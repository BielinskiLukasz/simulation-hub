import type { EventSimulation } from '../../core/types';
import { meta } from './meta';
import {
  deriveMarketTimeline, marketBatch, marketSim, paramSchema,
  type MarketAction, type MarketEvent, type Params, type Shared, type State,
} from './sim';
import { SIDE_BUY, SIDE_SELL, levels } from './book';

function render(state: State, rc: import('../../core/types').RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#0a0f16' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  // price path
  const hist = state.midHistory.slice(-300);
  const lo = Math.min(...hist) - 2; const hi = Math.max(...hist) + 2;
  const X = (i: number) => 16 + (i / Math.max(1, hist.length - 1)) * (width - 220);
  const Y = (v: number) => 24 + (1 - (v - lo) / Math.max(1, hi - lo)) * (height - 80);
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
  hist.forEach((v, i) => i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)));
  ctx.stroke();
  ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText(`${state.lastPrice}`, 16, 18);
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = state.maxDrawdown > 0.05 ? '#ef4444' : '#94a3b8';
  ctx.fillText(`drawdown ${(state.maxDrawdown * 100).toFixed(1)}% · withdrawn ${state.withdrawn}`, 70, 18);
  // ladder
  const x0 = width - 190;
  const bids = levels(state.book, SIDE_BUY, 8);
  const asks = levels(state.book, SIDE_SELL, 8);
  const maxQ = Math.max(1, ...bids.map((l) => l.qty), ...asks.map((l) => l.qty));
  ctx.font = '9.5px "JetBrains Mono", monospace';
  for (let i = 0; i < 8; i++) {
    const a = asks[7 - i]; const b = bids[i];
    const yA = 34 + i * 18; const yB = 206 + i * 18;
    if (a) { ctx.fillStyle = 'rgba(244,63,94,0.18)'; ctx.fillRect(x0, yA, (a.qty / maxQ) * 110, 15); ctx.fillStyle = '#fb7185'; ctx.fillText(`${a.price}  ${a.qty}`, x0 + 4, yA + 11); }
    if (b) { ctx.fillStyle = 'rgba(34,197,94,0.18)'; ctx.fillRect(x0, yB, (b.qty / maxQ) * 110, 15); ctx.fillStyle = '#4ade80'; ctx.fillText(`${b.price}  ${b.qty}`, x0 + 4, yB + 11); }
  }
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`mid ${state.lastMid.toFixed(1)} · trades ${state.tradeCount} · vol ${state.volume}`, 16, height - 12);
}

const sim: EventSimulation<Params, State, MarketEvent, MarketAction, unknown, Shared> = {
  ...marketSim,
  meta,
  paramSchema,
  batch: marketBatch,
  render: (state, rc) => render(state, rc),
  deriveTimeline: (log) => deriveMarketTimeline(log),
  onCanvasAction: () => null,
  getActions: () => [
    { label: 'Institutional shock (sell)', action: { a: 'shock', side: SIDE_SELL, qty: 120 } as MarketAction },
    { label: 'Halt 2 s', action: { a: 'halt', ms: 2000 } as MarketAction },
  ],
  about: {
    summary:
      'A price-time-priority limit order book driven by heterogeneous agents. Market makers quote both sides, skew with inventory and withdraw under volatility; trend followers chase moves; stop-loss holders fire once; an institutional seller can trigger a cascade. Every invariant is checked continuously.',
    bullets: [
      'The matching engine is differential-tested against an independent naive model (identical trades and top-N book snapshots over hundreds of random ops).',
      'Flash-crash preset: few withdrawing market makers + trend followers + stop-losses + a scheduled shock at 2.5 s. Watch depth vanish and the ladder thin out.',
      'Scrub back to before the shock and branch; the invariant badge (book not crossed, Σcash constant, Σinventory = 0) stays green.',
      'Batch tab sweeps market-maker count with common random numbers and displays P(crash) with Wilson intervals plus paired drawdown differences.',
      'Dashboard: mid/drawdown, spread/depth, volume/withdrawals. This is a stylized toy market, not a replica of any real venue or of May 2010.',
    ],
    invariant: 'Book never crossed; cash is conserved; Σ inventory is constant; every trade has exactly one buyer and one seller.',
  },
  concepts:
    '## Concepts\n\n**Price-time priority.** At each price, orders fill FIFO; better prices win first, and trades print at the resting price. Cancellations are O(1) through generation-checked ids, so a recycled slot can never be cancelled by a stale id.\n\n**Liquidity withdrawal.** Market makers are short volatility: when short-term price swings exceed a threshold they cancel quotes and step away. The cost of immediacy rises exactly when it is most valuable, amplifying the move.\n\n**Cascades.** A large market sell eats depth; trend followers sell into the fall; stop-losses fire once each. The batch panel measures how the probability of a crash depends on the number of market makers.\n\n**References.** Gould et al., *Limit order books* (2013); Farmer, Patelli & Zovko, *The predictive power of zero intelligence* (PNAS 2005); Kirilenko et al., *The Flash Crash* (2017); CFTC-SEC report (2010).\n\n*Stylized toy model: no queue-position optimisation, no hidden liquidity, no exchange latency distribution, no real data.*',
};

export default sim;
