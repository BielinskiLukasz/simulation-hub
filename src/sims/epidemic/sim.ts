// ─── Epidemic · sim.ts — exact event-driven SIR/SEIR on CSR graphs ────────
// 1 tick = 1/1000 day; exponential delays rounded and clamped to ≥1 tick.
// Event-driven (Kiss–Miller–Simon): on infection sample recovery + per-edge
// transmission times; only schedule transmissions that beat recovery.
// Sampling uses Math.log (same-engine determinism; documented).

import type { BatchSpec, EventCtx, EventSimulation, Invariant, LogEntry, ParamSchema } from '../../core/types';
import { createRng, deriveSeed } from '../../core/rng';
import { Engine } from '../../core/des/engine';
import type { Rng as RngType } from '../../core/types';
import type { Graph } from '../../core/graph/graph';
import { barabasiAlbert, erdosRenyi, wattsStrogatz } from '../../core/graph/generators';
import { degrees } from '../../core/graph/graph';
import { residualMoments } from '../../core/graph/metrics';
import { meta } from './meta';

export const S = 0; export const E = 1; export const I = 2; export const R = 3; export const V = 4;
export const TICKS_PER_DAY = 1000;

export interface Params {
  topology: string; nodes: number; meanDegree: number; rewire: number; attach: number;
  graphSeed: number; model: string; beta: number; gamma: number; sigma: number;
  seeds: number; vaccination: string; vaccinated: number;
}

export const defaultParams: Params = {
  topology: 'barabasi-albert', nodes: 800, meanDegree: 6, rewire: 0.1, attach: 3, graphSeed: 0,
  model: 'SIR', beta: 0.8, gamma: 0.4, sigma: 0.2, seeds: 5, vaccination: 'degree', vaccinated: 10,
};

export const paramSchema: ParamSchema<Params> = {
  topology: { kind: 'select', label: 'Network topology', options: ['erdos-renyi', 'watts-strogatz', 'barabasi-albert'] },
  nodes: { kind: 'range', label: 'Nodes', min: 50, max: 5000, step: 50 },
  meanDegree: { kind: 'range', label: 'Mean degree (ER/WS)', min: 2, max: 20, step: 1 },
  rewire: { kind: 'range', label: 'WS rewire β', min: 0, max: 1, step: 0.05 },
  attach: { kind: 'range', label: 'BA attach m', min: 1, max: 10, step: 1 },
  graphSeed: { kind: 'number', label: 'Graph seed (0 = main seed)', min: 0, step: 1, hint: 'Share a graph across strategies' },
  model: { kind: 'select', label: 'Model', options: ['SIR', 'SEIR'] },
  beta: { kind: 'range', label: 'Transmission β /day', min: 0.05, max: 3, step: 0.05 },
  gamma: { kind: 'range', label: 'Recovery γ /day', min: 0.05, max: 3, step: 0.05 },
  sigma: { kind: 'range', label: 'Latency σ /day (SEIR)', min: 0.05, max: 3, step: 0.05 },
  seeds: { kind: 'range', label: 'Initial infections', min: 1, max: 20, step: 1 },
  vaccination: { kind: 'select', label: 'Vaccination', options: ['none', 'random', 'degree'] },
  vaccinated: { kind: 'range', label: 'Vaccinated at t=0', min: 0, max: 60, step: 1, unit: '%' },
};

export interface Shared {
  graph: Graph;
  removed: Uint8Array;
  vaccinatedCount: number;
  x: Float32Array;
  y: Float32Array;
  moments: { k1: number; k2: number; n: number; m: number };
  transmissibility: number;
  rSeed: number;
  rEarly: number;
  thresholdT: number;
  finalSizePrediction: number;
  params: Params;
}

export interface State {
  status: Uint8Array;
  infectedBy: Int32Array;
  generation: Int16Array;
  secondary: Int32Array;
  recoveryAt: Uint32Array;
  counts: [number, number, number, number, number];
  everInfected: number;
  peakI: number;
  peakTime: number;
  seedNodes: number;
}

export type EpiEvent =
  | { t: 'infect'; v: number; from: number }
  | { t: 'infectious'; v: number }
  | { t: 'recover'; v: number };

export type EpiAction = { a: 'infect'; node: number } | { a: 'vaccinate'; node: number };
type Ctx = EventCtx<State, EpiEvent, Shared>;

export function transmissibility(beta: number, gamma: number): number {
  return beta / (beta + gamma);
}

/** Tree-like final-size prediction from the degree distribution. */
export function finalSizePrediction(pk: ArrayLike<number>, T: number): number {
  let total = 0;
  for (let d = 0; d < pk.length; d++) total += pk[d]!;
  if (total <= 0) return 0;
  const p0 = Array.from(pk, (v) => v / total);
  const mean = p0.reduce((a, v, d) => a + v * d, 0);
  if (mean <= 0) return 0;
  const g0 = (u: number) => p0.reduce((a, v, d) => a + v * u ** d, 0);
  const g1 = (u: number) => p0.reduce((a, v, d) => a + v * d * u ** Math.max(0, d - 1), 0) / mean;
  let u = 0.5;
  for (let it = 0; it < 300; it++) u = 1 - T + T * g1(u);
  return Math.max(0, Math.min(1, 1 - g0(u)));
}

function expTicks(rng: RngType, rate: number): number {
  return Math.max(1, Math.round((-Math.log(1 - rng.next()) / Math.max(1e-9, rate)) * TICKS_PER_DAY));
}

export function buildGraph(params: Params, seed: number): Graph {
  const rng = createRng(params.graphSeed > 0 ? params.graphSeed : seed);
  const n = Math.max(20, Math.min(50000, Math.round(params.nodes)));
  if (params.topology === 'watts-strogatz') return wattsStrogatz(n, Math.max(2, Math.round(params.meanDegree)), params.rewire, rng);
  if (params.topology === 'barabasi-albert') return barabasiAlbert(n, Math.max(1, Math.min(params.attach, n - 2)), rng);
  return erdosRenyi(n, Math.min(1, Math.max(0, params.meanDegree / (n - 1))), rng);
}

function vaccinationSet(graph: Graph, params: Params, rng: RngType): Uint8Array {
  const removed = new Uint8Array(graph.n);
  const target = Math.min(graph.n - params.seeds, Math.floor((params.vaccinated / 100) * graph.n));
  if (params.vaccination === 'none' || target <= 0) return removed;
  if (params.vaccination === 'random') {
    let count = 0;
    while (count < target) { const v = rng.int(0, graph.n - 1); if (!removed[v]) { removed[v] = 1; count++; } }
    return removed;
  }
  const order = Array.from({ length: graph.n }, (_, i) => i)
    .sort((a, b) => (graph.offsets[b + 1]! - graph.offsets[b]!) - (graph.offsets[a + 1]! - graph.offsets[a]!) || a - b);
  for (let k = 0; k < target; k++) removed[order[k]!] = 1;
  return removed;
}

function degreePk(graph: Graph, removed: Uint8Array): Float64Array {
  const pk = new Float64Array(400);
  for (let u = 0; u < graph.n; u++) {
    if (removed[u]) continue;
    let d = 0;
    for (let k = graph.offsets[u]!; k < graph.offsets[u + 1]!; k++) if (!removed[graph.adj[k]!]) d++;
    pk[Math.min(pk.length - 1, d)]! += 1;
  }
  return pk;
}

export function compileEpidemic(params: Params, _input?: unknown, seed = 1): Shared {
  const graph = buildGraph(params, seed);
  const removed = vaccinationSet(graph, params, createRng(deriveSeed(params.graphSeed > 0 ? params.graphSeed : seed, 7919)));
  const moments = residualMoments(graph, removed);
  const T = transmissibility(params.beta, params.gamma);
  const ds = degrees(graph);
  const maxR = Math.max(20, Math.max(...Array.from(ds)));
  const x = new Float32Array(graph.n);
  const y = new Float32Array(graph.n);
  for (let i = 0; i < graph.n; i++) {
    const ang = (i / graph.n) * Math.PI * 2;
    const r = 40 + (ds[i]! / maxR) * 240;
    x[i] = 400 + Math.cos(ang) * r;
    y[i] = 300 + Math.sin(ang) * r;
  }
  return {
    graph, removed, vaccinatedCount: removed.reduce((a, b) => a + b, 0), x, y, moments,
    transmissibility: T,
    rSeed: T * moments.k1,
    rEarly: moments.k1 > 0 ? (T * (moments.k2 - moments.k1)) / moments.k1 : 0,
    thresholdT: moments.k2 - moments.k1 > 0 ? moments.k1 / (moments.k2 - moments.k1) : Infinity,
    finalSizePrediction: finalSizePrediction(degreePk(graph, removed), T),
    params,
  } as Shared;
}

function transmit(ctx: Ctx, u: number): void {
  const { graph, params } = ctx.shared;
  const tr = ctx.state.recoveryAt[u]!;
  for (let k = graph.offsets[u]!; k < graph.offsets[u + 1]!; k++) {
    const v = graph.adj[k]!;
    if (ctx.state.status[v] !== S) continue;
    const ti = ctx.now + expTicks(ctx.rng, params.beta);
    if (ti < tr) ctx.schedule(ti - ctx.now, { t: 'infect', v, from: u });
  }
}

function becomeInfectious(ctx: Ctx, v: number): void {
  const st = ctx.state;
  st.status[v] = I;
  st.counts[E] = Math.max(0, st.counts[E]! - 1);
  st.counts[I] = st.counts[I]! + 1;
  st.recoveryAt[v] = ctx.now + expTicks(ctx.rng, ctx.shared.params.gamma);
  ctx.schedule(st.recoveryAt[v]! - ctx.now, { t: 'recover', v });
  ctx.log({ cat: 'infect', actor: v, text: `node ${v} infectious (gen ${st.generation[v]})`, data: { node: v, status: I } });
  transmit(ctx, v);
  if (st.counts[I]! > st.peakI) { st.peakI = st.counts[I]!; st.peakTime = ctx.now / TICKS_PER_DAY; }
}

function expose(ctx: Ctx, v: number, from: number): void {
  const st = ctx.state;
  st.status[v] = E;
  st.counts[S] = st.counts[S]! - 1;
  st.counts[E] = st.counts[E]! + 1;
  st.infectedBy[v] = from;
  st.generation[v] = (from >= 0 ? st.generation[from]! + 1 : 0) as number;
  if (from >= 0) st.secondary[from] = st.secondary[from]! + 1;
  st.everInfected++;
  ctx.log({ cat: 'infect', actor: v, text: `node ${v} exposed${from >= 0 ? ` by ${from}` : ''} (gen ${st.generation[v]})`, data: { node: v, status: E } });
  ctx.schedule(ctx.shared.params.model === 'SEIR' ? expTicks(ctx.rng, ctx.shared.params.sigma) : 0, { t: 'infectious', v });
}

export const epidemicSim: EventSimulation<Params, State, EpiEvent, EpiAction, unknown, Shared> = {
  kind: 'event',
  meta,
  defaultParams,
  paramSchema,
  playback: { unit: 'days', baseRate: 1000 },
  input: { initial: () => ({}), codec: { encode: () => '', decode: () => ({}) } },
  compile: (params, _input, seed) => compileEpidemic(params, undefined, seed ?? 1),
  init: (_params, ctx) => {
    const shared = ctx.shared;
    const n = shared.graph.n;
    const state: State = {
      status: new Uint8Array(n).fill(S),
      infectedBy: new Int32Array(n).fill(-1),
      generation: new Int16Array(n),
      secondary: new Int32Array(n),
      recoveryAt: new Uint32Array(n),
      counts: [0, 0, 0, 0, 0],
      everInfected: 0, peakI: 0, peakTime: 0, seedNodes: 0,
    };
    for (let i = 0; i < n; i++) if (shared.removed[i]) { state.status[i] = V; state.counts[V] = state.counts[V]! + 1; }
    state.counts[S] = n - state.counts[V]!;
    const susceptible: number[] = [];
    for (let i = 0; i < n; i++) if (state.status[i] === S) susceptible.push(i);
    const seeds = Math.min(shared.params.seeds, susceptible.length);
    for (let k = 0; k < seeds; k++) {
      const pick = susceptible[Math.floor(ctx.rng.next() * susceptible.length)]!;
      if (state.status[pick] !== S) { k--; continue; }
      state.status[pick] = E;
      state.counts[S] = state.counts[S]! - 1;
      state.counts[E] = state.counts[E]! + 1;
      state.everInfected++;
      state.generation[pick] = 0;
      ctx.schedule(0, { t: 'infectious', v: pick });
      state.seedNodes++;
    }
    return state;
  },
  handle: (ctx, ev) => {
    const st = ctx.state;
    if (ev.t === 'infect') {
      if (st.status[ev.v] !== S) return;
      expose(ctx, ev.v, ev.from);
      return;
    }
    if (ev.t === 'infectious') {
      if (st.status[ev.v] !== E) return;
      becomeInfectious(ctx, ev.v);
      return;
    }
    if (ev.t === 'recover') {
      if (st.status[ev.v] !== I) return;
      st.status[ev.v] = R;
      st.counts[I] = Math.max(0, st.counts[I]! - 1);
      st.counts[R] = st.counts[R]! + 1;
      ctx.log({ cat: 'recover', actor: ev.v, text: `node ${ev.v} recovered`, data: { node: ev.v, status: R } });
    }
  },
  applyAction: (ctx, action) => {
    const st = ctx.state;
    if (action.a === 'infect') {
      if (st.status[action.node] === S) { expose(ctx, action.node, -1); }
    } else if (action.a === 'vaccinate') {
      if (st.status[action.node] === S) {
        st.status[action.node] = V;
        st.counts[S] = st.counts[S]! - 1;
        st.counts[V] = st.counts[V]! + 1;
      }
    }
  },
  describeAction: (a) => `${a.a === 'infect' ? 'Infect' : 'Vaccinate'} node ${a.node}`,
  render: () => undefined,
  isFinished: (s) => s.counts[I] === 0 && s.counts[E] === 0,
  getStats: (s, shared) => ({
    S: s.counts[S]!, E: s.counts[E]!, I: s.counts[I]!, R: s.counts[R]!, V: s.counts[V]!,
    T: shared ? shared.transmissibility.toFixed(3) : '—',
    R_early: shared ? shared.rEarly.toFixed(2) : '—',
  }),
  getSignals: (s) => s.status,
  metrics: {
    metrics: [
      { id: 'S', label: 'Susceptible', fmt: 'int' },
      { id: 'E', label: 'Exposed', fmt: 'int' },
      { id: 'I', label: 'Infectious', fmt: 'int' },
      { id: 'R', label: 'Recovered', fmt: 'int' },
      { id: 'V', label: 'Vaccinated', fmt: 'int' },
      { id: 'cumulative', label: 'Cumulative infected', fmt: 'int' },
      { id: 'Rearly', label: 'R early (empirical)', fmt: 'float' },
    ],
    sample: (s, _shared, out) => {
      out[0] = s.counts[S]!;
      out[1] = s.counts[E]!;
      out[2] = s.counts[I]!;
      out[3] = s.counts[R]!;
      out[4] = s.counts[V]!;
      out[5] = s.everInfected;
      let sec = 0; let count = 0;
      for (let i = 0; i < s.secondary.length; i++) if (s.generation[i]! >= 1) { sec += s.secondary[i]!; count++; }
      out[6] = count > 0 ? sec / count : NaN;
    },
    every: { by: 'time', dt: 0.25 },
    policy: 'cap',
    charts: [
      { id: 'compartments', title: 'Compartments', kind: 'area', series: ['S', 'E', 'I', 'R', 'V'] },
      { id: 'cumulative', title: 'Cumulative infections', kind: 'lines', series: ['cumulative'] },
      { id: 'rearly', title: 'Empirical R early', kind: 'lines', series: ['Rearly'] },
    ],
  },
  invariants: [
    {
      id: 'population', label: 'S+E+I+R+V = n',
      check: (s) => s.counts.reduce((a, b) => a + b, 0) === s.status.length ? null : 'population not conserved',
    },
    {
      id: 'infected-by', label: 'Every infection has a valid infector',
      check: (s) => {
        for (let i = 0; i < s.status.length; i++) {
          if ((s.status[i] === E || s.status[i] === I || s.status[i] === R) && s.generation[i]! > 0) {
            const from = s.infectedBy[i]!;
            if (from < 0 || from >= s.status.length) return `node ${i} infected by invalid ${from}`;
          }
        }
        return null;
      },
    },
  ] as Invariant<State>[],
  about: { summary: '', bullets: [], invariant: '' },
};

export function deriveEpidemicTimeline(log: readonly LogEntry[]): { lanes: { id: string; label: string }[]; segments: never[]; markers: { t: number; label: string; cls: string }[] } {
  const seeds = log.filter((e) => e.cat === 'infect' && e.text.includes('gen 0')).slice(0, 10);
  return { lanes: [{ id: 'phase', label: 'outbreak' }], segments: [], markers: seeds.map((e) => ({ t: e.t, label: `seed ${e.actor}`, cls: 'election' })) };
}

export const epidemicBatch: BatchSpec<Params> = {
  metrics: [
    { id: 'attackRate', label: 'Attack rate', kind: 'scalar' },
    { id: 'majorOutbreak', label: 'Major outbreak', kind: 'indicator' },
    { id: 'peakI', label: 'Peak infectious', kind: 'scalar' },
    { id: 'duration', label: 'Duration (days)', kind: 'scalar' },
  ],
  runOne(params, seed) {
    const p = { ...params, nodes: Math.min(params.nodes, 3000), graphSeed: params.graphSeed || seed };
    const shared = compileEpidemic(p, undefined, seed);
    const maxEvents = 300000;
    let ever = 0;
    let peakI = 0;
    let now = 0;
    const engine = new Engine(epidemicSim, p, seed, undefined);
    let guard = 0;
    while (guard++ < maxEvents) {
      if (!engine.step()) break;
      ever = engine.state.everInfected;
      peakI = Math.max(peakI, engine.state.peakI);
      now = engine.now;
    }
    const denom = Math.max(1, shared.graph.n - shared.vaccinatedCount);
    const major = ever > Math.max(20, 0.05 * shared.graph.n) ? 1 : 0;
    return { values: Float64Array.from([ever / denom, major, peakI, now / TICKS_PER_DAY]) };
  },
  variants: [
    { id: 'random', label: 'Random vaccination', overrides: { vaccination: 'random' } },
    { id: 'degree', label: 'Degree-targeted', overrides: { vaccination: 'degree' } },
  ],
  sweep: { key: 'vaccinated', label: '% vaccinated', values: [0, 10, 20, 30, 40] },
  conditional: { id: 'majorOutbreak', on: 'majorOutbreak' },
  defaults: { runs: 20, maxRuns: 200 },
};
