// ─── Order book · sim.ts — event-driven market with liquidity withdrawal ──
// Integer milliseconds; agents wake on Poisson clocks (≥1 ms). Matching uses
// the price-time engine (book.ts). Cash/inventory move between exactly two
// parties per trade, so Σcash and Σinventory are invariants.

import type { BatchSpec, EventCtx, EventSimulation, LogEntry, ParamSchema, TimelineData } from '../../core/types';
import type { Rng } from '../../core/types';
import { createRng } from '../../core/rng';
import {
  MAX_TICKS, SIDE_BUY, SIDE_SELL, bestBidAsk, cancel as cancelOrder, checkBook, createBook, levels,
  submit, type BookState,
} from './book';
import { meta } from './meta';
import { Engine } from '../../core/des/engine';

export interface Params {
  preset: string;
  mmCount: number;
  mmQuoteSize: number;
  mmWithdrawVol: number;
  noiseRate: number;
  trendFollowers: number;
  stopLosses: number;
  latency: number;
  shockQty: number;
  crashPct: number;
  crashWindow: number;
  recoverWindow: number;
}

export const defaultParams: Params = {
  preset: 'flash-crash', mmCount: 3, mmQuoteSize: 8, mmWithdrawVol: 3,
  noiseRate: 40, trendFollowers: 6, stopLosses: 8, latency: 2, shockQty: 120,
  crashPct: 0.08, crashWindow: 60, recoverWindow: 120,
};

export const paramSchema: ParamSchema<Params> = {
  preset: { kind: 'select', label: 'Scenario', options: ['calm', 'thin-book', 'momentum-heavy', 'flash-crash'], hint: 'Applies an agent mix; re-inits' },
  mmCount: { kind: 'range', label: 'Market makers', min: 0, max: 8, step: 1 },
  mmQuoteSize: { kind: 'range', label: 'MM quote size', min: 1, max: 30, step: 1 },
  mmWithdrawVol: { kind: 'range', label: 'Withdraw above volatility', min: 1, max: 20, step: 1, unit: 'ticks' },
  noiseRate: { kind: 'range', label: 'Noise orders /s', min: 0, max: 200, step: 5 },
  trendFollowers: { kind: 'range', label: 'Trend followers', min: 0, max: 30, step: 1 },
  stopLosses: { kind: 'range', label: 'Stop-loss holders', min: 0, max: 30, step: 1 },
  latency: { kind: 'range', label: 'Latency', min: 1, max: 20, step: 1, unit: 'ms' },
  shockQty: { kind: 'range', label: 'Shock size', min: 10, max: 400, step: 10, unit: 'lots' },
  crashPct: { kind: 'range', label: 'Crash threshold', min: 0.02, max: 0.3, step: 0.01 },
  crashWindow: { kind: 'range', label: 'Crash window', min: 20, max: 300, step: 10, unit: 'ms' },
  recoverWindow: { kind: 'range', label: 'Rebound window', min: 20, max: 400, step: 10, unit: 'ms' },
};

export const TICK0 = 512;
const N_TRADERS = 80;
const INSTITUTIONAL = 79;

export interface Agent {
  type: 0 | 1 | 2 | 3; // noise, mm, trend, stop
  wakeRate: number;
  inventory: number;
  cash: number;
  quoteBid: number;
  quoteAsk: number;
  withdrawnUntil: number;
  stop: number;
  fired: number;
}

export interface Shared {
  params: Params;
  preset: string;
  tick: number;
  crashPct: number;
  crashWindow: number;
  recoverWindow: number;
}

export interface State {
  book: BookState;
  agents: Agent[];
  lastPrice: number;
  midHistory: number[]; // ring of mids (every mid computation)
  lastMid: number;
  refPrice: number;
  peakPrice: number;
  maxDrawdown: number;
  volume: number;
  tradeCount: number;
  cashTotal: number;
  inventoryTotal: number;
  shockPlaced: boolean;
  haltUntil: number;
  withdrawn: number;
}

export type MarketEvent = { t: 'wake'; agent: number } | { t: 'mmCheck'; agent: number } | { t: 'shock' };
export type MarketAction = { a: 'shock'; side: number; qty: number } | { a: 'halt'; ms: number };

type Ctx = EventCtx<State, MarketEvent, Shared>;

function expMs(rng: Rng, ratePerSec: number): number {
  return Math.max(1, Math.round((-Math.log(1 - rng.next()) / Math.max(0.001, ratePerSec)) * 1000));
}

function midOf(state: State): number {
  const { bid, ask } = bestBidAsk(state.book);
  if (bid < 0 && ask < 0) return state.lastMid || TICK0;
  if (bid < 0) return ask;
  if (ask < 0) return bid;
  return (bid + ask) / 2;
}

function scheduleWake(ctx: Ctx, agent: number): void {
  const a = ctx.state.agents[agent]!;
  ctx.schedule(expMs(ctx.rng, a.wakeRate), { t: 'wake', agent });
}

interface Placed { id: number; filled: number }
function placeOrder(state: State, agent: number, side: number, price: number, qty: number): Placed {
  const fills: { price: number; qty: number; makerId: number; takerId: number; makerTrader: number; takerTrader: number; takerSide: number }[] = [];
  const res = submit(state.book, { side, price, qty, trader: agent + 1 }, fills);
  for (const f of fills) {
    const maker = f.makerTrader - 1;
    const taker = f.takerTrader - 1;
    const signed = f.takerSide === SIDE_BUY ? 1 : -1;
    state.agents[taker]!.inventory += signed * f.qty;
    state.agents[maker]!.inventory -= signed * f.qty;
    state.agents[taker]!.cash -= signed * f.qty * f.price;
    state.agents[maker]!.cash += signed * f.qty * f.price;
    state.volume += f.qty;
    state.tradeCount++;
    state.lastPrice = f.price;
  }
  const mid = midOf(state);
  state.maxDrawdown = Math.max(state.maxDrawdown, (state.peakPrice - mid) / Math.max(1, state.peakPrice));
  state.peakPrice = Math.max(state.peakPrice, mid);
  if (mid > 0) { state.lastMid = mid; state.midHistory.push(mid); if (state.midHistory.length > 400) state.midHistory.shift(); }
  for (const a of state.agents) if (a.type === 3 && !a.fired && state.lastPrice <= a.stop) a.fired = 1;
  return { id: res.id, filled: res.filled };
}

function place(ctx: Ctx, agent: number, side: number, price: number, qty: number): number {
  const before = ctx.state.lastPrice;
  const res = placeOrder(ctx.state, agent, side, price, qty);
  if (ctx.state.lastPrice !== before && ctx.state.tradeCount % 25 === 0) {
    ctx.log({ cat: 'trade', actor: agent, text: `trade ${ctx.state.lastPrice} (vol ${ctx.state.volume})`, data: { price: ctx.state.lastPrice } });
  }
  return res.id;
}

function wake(ctx: Ctx, agent: number): void {
  const st = ctx.state;
  const a = st.agents[agent]!;
  const mid = Math.round(midOf(st));
  if (ctx.now < st.haltUntil) { scheduleWake(ctx, agent); return; }
  if (a.type === 0) {
    const side = ctx.rng.next() < 0.5 ? SIDE_BUY : SIDE_SELL;
    if (ctx.rng.next() < 0.35) place(ctx, agent, side, side === SIDE_BUY ? -1 : MAX_TICKS + 1, ctx.rng.int(1, 4));
    else {
      const offset = ctx.rng.int(1, 6);
      place(ctx, agent, side, side === SIDE_BUY ? mid - offset : mid + offset, ctx.rng.int(1, 5));
    }
  } else if (a.type === 1) {
    // market maker: withdraw under volatility, else re-quote symmetrically
    const window = st.midHistory.slice(-12);
    const vol = window.length > 1 ? Math.max(...window) - Math.min(...window) : 0;
    if (vol >= ctx.shared.tick * 0 + (ctx.state.agents[agent]!.stop || 0)) { /* reserved */ }
    if (vol >= (a.stop || 0) && ctx.now < a.withdrawnUntil) { scheduleWake(ctx, agent); return; }
    if (vol >= (a.stop || 0)) {
      if (a.quoteBid > 0) cancelOrder(st.book, a.quoteBid);
      if (a.quoteAsk > 0) cancelOrder(st.book, a.quoteAsk);
      a.quoteBid = 0; a.quoteAsk = 0;
      a.withdrawnUntil = ctx.now + 600;
      st.withdrawn++;
      ctx.log({ cat: 'mm', actor: agent, text: `MM ${agent} withdrew (vol ${vol.toFixed(1)})` });
      ctx.schedule(600, { t: 'mmCheck', agent });
      scheduleWake(ctx, agent);
      return;
    }
    if (a.quoteBid > 0) cancelOrder(st.book, a.quoteBid);
    if (a.quoteAsk > 0) cancelOrder(st.book, a.quoteAsk);
    const skew = Math.max(-4, Math.min(4, Math.round(a.inventory / 5)));
    const half = 1;
    a.quoteBid = place(ctx, agent, SIDE_BUY, mid - half - Math.max(0, skew), ctx.state.agents[agent]!.quoteBid > 0 ? 1 : ctx.shared.crashWindow > 0 ? 8 : 8);
    a.quoteAsk = place(ctx, agent, SIDE_SELL, mid + half + Math.max(0, -skew), 8);
    ctx.log({ cat: 'mm', actor: agent, text: `MM ${agent} quotes ${mid - half - Math.max(0, skew)}/${mid + half + Math.max(0, -skew)}` });
  } else if (a.type === 2) {
    const hist = st.midHistory;
    if (hist.length > 6) {
      const ret = (mid - hist[hist.length - 6]!) / Math.max(1, hist[hist.length - 6]!);
      if (Math.abs(ret) > 0.004) {
        const side = ret > 0 ? SIDE_BUY : SIDE_SELL;
        place(ctx, agent, side, side === SIDE_BUY ? MAX_TICKS + 1 : -1, 6);
        ctx.log({ cat: 'order', actor: agent, text: `trend ${ret > 0 ? 'buy' : 'sell'} (${(ret * 100).toFixed(2)}%)` });
      }
    }
  } else {
    if (!a.fired && st.lastPrice > 0 && st.lastPrice <= a.stop) {
      a.fired = 1;
      place(ctx, agent, SIDE_SELL, -1, 10);
      ctx.log({ cat: 'order', actor: agent, text: `stop-loss fired at ${st.lastPrice}` });
    }
  }
  scheduleWake(ctx, agent);
}

export const marketSim: EventSimulation<Params, State, MarketEvent, MarketAction, unknown, Shared> = {
  kind: 'event',
  meta,
  defaultParams,
  paramSchema,
  playback: { unit: 'ms', baseRate: 400 },
  input: { initial: () => ({}), codec: { encode: () => '', decode: () => ({}) } },
  compile: (params) => ({ params, preset: params.preset, tick: TICK0, crashPct: params.crashPct, crashWindow: params.crashWindow, recoverWindow: params.recoverWindow }),
  init: (params, ctx) => {
    const agentCount = N_TRADERS;
    const agents: Agent[] = [];
    const preset = params.preset;
    const mmCount = preset === 'thin-book' ? 1 : preset === 'calm' ? 6 : preset === 'flash-crash' ? 2 : params.mmCount;
    const trends = preset === 'momentum-heavy' ? 16 : preset === 'flash-crash' ? 10 : params.trendFollowers;
    const stops = preset === 'flash-crash' ? 14 : params.stopLosses;
    for (let i = 0; i < agentCount; i++) {
      const type: Agent['type'] = i < mmCount ? 1 : i < mmCount + trends ? 2 : i < mmCount + trends + stops ? 3 : i === INSTITUTIONAL ? 0 : 0;
      agents.push({
        type,
        wakeRate: type === 1 ? 30 : type === 2 ? 4 : type === 3 ? 1 : Math.max(1, params.noiseRate / Math.max(1, agentCount - mmCount - trends - stops)),
        inventory: 50,
        cash: 0,
        quoteBid: 0,
        quoteAsk: 0,
        withdrawnUntil: 0,
        stop: type === 1 ? params.mmWithdrawVol : type === 3 ? 480 + ((i * 7) % 25) : 0,
        fired: 0,
      });
    }
    const state: State = {
      book: createBook(),
      agents,
      lastPrice: TICK0,
      midHistory: [TICK0],
      lastMid: TICK0,
      refPrice: TICK0,
      peakPrice: TICK0,
      maxDrawdown: 0,
      volume: 0,
      tradeCount: 0,
      cashTotal: 0,
      inventoryTotal: agentCount * 50,
      shockPlaced: false,
      haltUntil: 0,
      withdrawn: 0,
    };
    const shim = {
      state, now: 0, rng: ctx.rng, shared: {} as Shared,
      schedule: () => 0, cancel: () => undefined, log: () => undefined,
    } as unknown as Ctx;
    // seed a two-sided book around TICK0 with the institution as passive seller/buyer
    for (let i = 1; i <= 10; i++) {
      place(shim, INSTITUTIONAL, SIDE_SELL, TICK0 + i, 20);
      place(shim, INSTITUTIONAL, SIDE_BUY, TICK0 - i, 20);
    }
    for (let i = 0; i < agentCount; i++) scheduleWake(shim, i);
    if (preset === 'flash-crash') ctx.schedule(2500, { t: 'shock' });
    return state;
  },
  handle: (ctx, ev) => {
    if (ev.t === 'wake') { wake(ctx, ev.agent); return; }
    if (ev.t === 'mmCheck') return;
    if (ev.t === 'shock') {
      ctx.state.shockPlaced = true;
      place(ctx, INSTITUTIONAL, SIDE_SELL, -1, ctx.shared.params.shockQty);
      ctx.log({ cat: 'action', actor: INSTITUTIONAL, text: `SHOCK market sell ${ctx.shared.params.shockQty}` });
      return;
    }
  },
  applyAction: (ctx, action) => {
    if (action.a === 'shock') place(ctx, INSTITUTIONAL, action.side, -1, action.qty);
    else if (action.a === 'halt') ctx.state.haltUntil = ctx.now + action.ms;
  },
  describeAction: (a) => a.a === 'shock' ? `Market ${a.side === SIDE_BUY ? 'buy' : 'sell'} ${a.qty}` : `Halt ${a.ms} ms`,
  render: () => undefined,
  isFinished: () => false,
  getStats: (state) => {
    const { bid, ask } = bestBidAsk(state.book);
    return {
      bid: bid < 0 ? '—' : bid,
      ask: ask < 0 ? '—' : ask,
      spread: bid >= 0 && ask >= 0 ? ask - bid : '—',
      last: state.lastPrice,
      trades: state.tradeCount,
      dd: `${(state.maxDrawdown * 100).toFixed(1)}%`,
    };
  },
  invariants: [
    { id: 'not-crossed', label: 'Book never crossed', check: (s) => checkBook(s.book) },
    {
      id: 'ledgers', label: 'Σ cash constant and Σ inventory = 0',
      check: (s) => {
        let cash = 0; let inv = 0;
        for (const a of s.agents) { cash += a.cash; inv += a.inventory; }
        if (Math.abs(cash) > 1e-6) return `cash not conserved: ${cash}`;
        if (inv !== s.inventoryTotal) return `inventory moved: ${inv} vs ${s.inventoryTotal}`;
        return null;
      },
    },
  ],
  metrics: {
    metrics: [
      { id: 'mid', label: 'Mid price', fmt: 'price' },
      { id: 'spread', label: 'Spread', fmt: 'int' },
      { id: 'volume', label: 'Volume', fmt: 'int' },
      { id: 'drawdown', label: 'Drawdown', fmt: 'pct' },
      { id: 'bidDepth', label: 'Bid depth', fmt: 'int' },
      { id: 'askDepth', label: 'Ask depth', fmt: 'int' },
      { id: 'withdrawn', label: 'MM withdrawals', fmt: 'int' },
    ],
    sample: (s, _sh, out) => {
      const { bid, ask } = bestBidAsk(s.book);
      out[0] = bid >= 0 && ask >= 0 ? (bid + ask) / 2 : NaN;
      out[1] = bid >= 0 && ask >= 0 ? ask - bid : NaN;
      out[2] = s.volume;
      out[3] = s.maxDrawdown;
      out[4] = levels(s.book, SIDE_BUY, 20).reduce((a, l) => a + l.qty, 0);
      out[5] = levels(s.book, SIDE_SELL, 20).reduce((a, l) => a + l.qty, 0);
      out[6] = s.withdrawn;
    },
    every: { by: 'time', dt: 250 },
    policy: 'cap',
    charts: [
      { id: 'price', title: 'Mid price & drawdown', kind: 'lines', series: ['mid', 'drawdown'] },
      { id: 'liquidity', title: 'Spread & depth', kind: 'lines', series: ['spread', 'bidDepth', 'askDepth'] },
      { id: 'activity', title: 'Volume & withdrawals', kind: 'lines', series: ['volume', 'withdrawn'], hideByDefault: true },
    ],
  },
  about: { summary: '', bullets: [], invariant: '' },
};

export const marketBatch: BatchSpec<Params> = {
  metrics: [
    { id: 'maxDrawdown', label: 'Max drawdown', kind: 'scalar' },
    { id: 'crash', label: 'Crash', kind: 'indicator' },
    { id: 'flashCrash', label: 'Flash crash', kind: 'indicator' },
    { id: 'minDepth', label: 'Min depth', kind: 'scalar' },
    { id: 'meanSpread', label: 'Mean spread', kind: 'scalar' },
  ],
  runOne(params, seed) {
    const engine = new Engine(marketSim, params, seed, undefined);
    let maxDd = 0;
    const depths: number[] = [];
    const spreads: number[] = [];
    let crashes = 0;
    let recovered = false;
    let crashAt = -1;
    let guard = 0;
    while (guard++ < 40000) {
      if (!engine.step()) break;
      if (engine.now > 6000) break;
      if (engine.state.tradeCount % 20 === 0) {
        maxDd = Math.max(maxDd, engine.state.maxDrawdown);
        const { bid, ask } = bestBidAsk(engine.state.book);
        if (bid >= 0 && ask >= 0) spreads.push(ask - bid);
        depths.push(levels(engine.state.book, 1, 10).reduce((a, l) => a + l.qty, 0));
        if (maxDd >= params.crashPct && crashAt < 0) { crashes = 1; crashAt = engine.now; }
        if (crashAt >= 0 && engine.now - crashAt <= params.recoverWindow) {
          const mid = (bid + ask) / 2;
          if (mid / TICK0 >= 1 - params.crashPct / 2) recovered = true;
        }
      }
    }
    const meanDepth = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
    const meanSpread = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : NaN;
    return { values: Float64Array.from([maxDd, crashes, crashes && recovered ? 1 : 0, meanDepth, meanSpread]) };
  },
  variants: [
    { id: 'calm', label: 'Calm', overrides: { preset: 'calm', mmCount: 6 } },
    { id: 'flash', label: 'Flash-crash mix', overrides: { preset: 'flash-crash', mmCount: 2 } },
  ],
  sweep: { key: 'mmCount', label: 'market makers', values: [0, 1, 2, 3, 4, 6, 8] },
  defaults: { runs: 20, maxRuns: 100 },
};

export { cancelOrder, createRng };
export function deriveMarketTimeline(log: readonly LogEntry[]): TimelineData {
  const lanes = [{ id: 'mm', label: 'market makers' }, { id: 'shock', label: 'shocks' }];
  const segments: TimelineData['segments'] = [];
  const markers: TimelineData['markers'] = [];
  for (const e of log) {
    const d = (e.data ?? {}) as { price?: number };
    if (e.cat === 'mm' && e.actor !== null) {
      segments.push({ lane: 'mm', start: e.t, end: e.t + 250, label: e.text.includes('withdrew') ? 'withdrawn' : 'quoting', cls: e.text.includes('withdrew') ? 'down' : 'leader' });
    }
    if (e.cat === 'trade' && d.price) markers.push({ t: e.t, label: `${d.price}`, cls: 'committed' });
    if (e.cat === 'action') markers.push({ lane: 'shock', t: e.t, label: e.text, cls: 'election' });
  }
  return { lanes, segments, markers };
}
