import type { BatchSpec, EventSimulation } from '../../core/types';
import { meta } from './meta';
import {
  compileEpidemic, deriveEpidemicTimeline, epidemicBatch, epidemicSim, paramSchema,
  R, S, E, I, V, transmissibility, type EpiAction, type EpiEvent, type Params, type Shared, type State,
} from './sim';

const STATUS_COLOR: Record<number, string> = { [S]: '#64748b', [E]: '#f59e0b', [I]: '#ef4444', [R]: '#22c55e', [V]: '#38bdf8' };

function render(state: State, rc: import('../../core/types').RenderContext, _view: { now: number; head: number }, shared?: Shared): void {
  const { ctx, width, height, theme } = rc;
  ctx.fillStyle = theme === 'dark' ? '#0a0f16' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  if (!shared) {
    ctx.fillStyle = theme === 'dark' ? '#94a3b8' : '#64748b';
    ctx.fillText('Building network…', 20, 30);
    return;
  }
  const g = shared.graph;
  const overview = g.n > 1500;
  ctx.strokeStyle = theme === 'dark' ? 'rgba(148,163,184,0.10)' : 'rgba(15,23,42,0.07)';
  ctx.beginPath();
  if (!overview) {
    for (let u = 0; u < g.n; u++) {
      for (let k = g.offsets[u]!; k < g.offsets[u + 1]!; k++) {
        const v = g.adj[k]!;
        if (v < u) continue;
        const a = state.status[u]!; const b = state.status[v]!;
        if (a !== I && b !== I) continue;
        ctx.moveTo(shared.x[u]!, shared.y[u]!);
        ctx.lineTo(shared.x[v]!, shared.y[v]!);
      }
    }
  }
  ctx.stroke();
  for (const status of [S, E, I, R, V]) {
    ctx.beginPath();
    for (let i = 0; i < g.n; i++) {
      if (state.status[i] !== status) continue;
      const d = g.offsets[i + 1]! - g.offsets[i]!;
      const r = 2 + Math.min(10, Math.sqrt(d));
      ctx.moveTo(shared.x[i]! + r, shared.y[i]!);
      ctx.arc(shared.x[i]!, shared.y[i]!, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = STATUS_COLOR[status]!;
    if (status === V) { ctx.strokeStyle = STATUS_COLOR[status]!; ctx.lineWidth = 1.5; ctx.stroke(); } else ctx.fill();
  }
  ctx.fillStyle = theme === 'dark' ? '#e2e8f0' : '#1e293b';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText(`S ${state.counts[S]} · E ${state.counts[E]} · I ${state.counts[I]} · R ${state.counts[R]} · V ${state.counts[V]}   ⟨k⟩ ${shared.moments.k1.toFixed(1)}  T ${shared.transmissibility.toFixed(3)}  R_early ${shared.rEarly.toFixed(2)}${g.n > 1500 ? ' · edges hidden (n>1500)' : ''}`, 12, height - 12);
}

const sim: EventSimulation<Params, State, EpiEvent, EpiAction, unknown, Shared> = {
  ...epidemicSim,
  meta,
  paramSchema,
  compile: (params, input, seed) => compileEpidemic(params, input, seed ?? 1),
  batch: epidemicBatch,
  render,
  deriveTimeline: (log) => deriveEpidemicTimeline(log),
  onCanvasAction: (state, x, y, _ev, shared) => {
    if (!shared) return null;
    let best = -1; let bestD = 24 * 24;
    for (let i = 0; i < shared.graph.n; i++) {
      const d = (shared.x[i]! - x) ** 2 + (shared.y[i]! - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return null;
    return state.status[best] === S ? { a: 'infect', node: best } : { a: 'vaccinate', node: best };
  },
  getActions: (state, shared) => {
    void state; void shared;
    return [];
  },
  about: {
    summary:
      'SIR/SEIR epidemics on exact network topologies, simulated event by event. Vaccination removes nodes before the outbreak; degree-targeting removes hubs first, which collapses ⟨k²⟩ and can push R_early below 1 with far fewer doses than random vaccination.',
    bullets: [
      'Theory panel: T = β/(β+γ), residual ⟨k⟩/⟨k²⟩, R₀,seed = T⟨k⟩, early R = T(⟨k²⟩−⟨k⟩)/⟨k⟩ and the threshold T_c. Click a node to infect/vaccinate it (recorded actions).',
      'Node radius grows with degree, so hubs are visible; vaccinated nodes are hollow blue. Edge lines are drawn only around infectious nodes (and hidden above 1,500 nodes).',
      'Scrub the outbreak with the timeline; seeking back truncates the dashboard and replays regenerate exactly the same samples. Branching discards the old future.',
      'The Batch tab runs variants on common random numbers: paired attack-rate differences with 95% CIs, a sweep over vaccinated %, Wilson intervals for P(major outbreak), and conditional means.',
      'Major outbreak is defined as more than max(20 nodes, 5% of n) ever infected; below that an outbreak is a fizzle and a mean attack rate would be misleading.',
    ],
    invariant: 'S+E+I+R+V = n after every event; every infection records a real infector; vaccinated nodes are never infected.',
  },
  concepts:
    '## Concepts\n\n**Transmissibility and the threshold.** An edge transmits with probability T = β/(β+γ). On a locally tree-like network the early reproduction number is R_early = T·(⟨k²⟩−⟨k⟩)/⟨k⟩; the epidemic can take off only when R_early > 1, i.e. T > ⟨k⟩/(⟨k²⟩−⟨k⟩).\n\n**Why hubs matter.** Scale-free degree distributions have enormous ⟨k²⟩, so R_early stays above 1 even for tiny T — and removing the highest-degree nodes collapses it fastest. That is the mathematical reason targeted vaccination beats random.\n\n**Exactness.** The event-driven scheme samples each edge transmission only when the infector becomes infectious, and drops it if recovery comes first. This is exact for Markovian SIR/SEIR and O(edges), not O(n·steps).\n\n**Fizzle vs outbreak.** Most runs die out early. Reporting only a mean attack rate hides the bimodality, so the batch panel reports P(major outbreak) with a Wilson interval and the mean conditional on a major outbreak.\n\n**References.** Newman, Phys. Rev. E (2002); Pastor-Satorras & Vespignani, PRL (2001); Cohen, Havlin & ben-Avraham, PRL (2003); Kiss, Miller & Simon (2017).\n\n*1 tick = 1/1000 day; exponential sampling uses Math.log, so determinism is guaranteed per engine, not across engines.*',
};

export default sim;
export const batch: BatchSpec<Params> = epidemicBatch;
export { transmissibility };
