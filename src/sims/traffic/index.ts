import type { BatchSpec, RealtimeSimulation } from '../../core/types';
import { createRng } from '../../core/rng';
import { meta } from './meta';
import {
  applyParams, CELLS, defaultParams, diagnostics, HISTORY, init, jamTravelDirection, onPointer, paramSchema, step,
  type Params, type State,
} from './logic';

function render(state: State, rc: import('../../core/types').RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#0a0f16' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  // space-time heatmap
  const top = 20; const hmH = height * 0.46;
  const cellW = (width - 32) / HISTORY; const cellH = hmH / CELLS;
  for (let c = 0; c < state.historyCols; c++) {
    const col = (state.historyHead - 1 - c + HISTORY * 2) % HISTORY;
    for (let cell = 0; cell < CELLS; cell++) {
      const v = state.speedHistory[col * CELLS + cell]!;
      if (!Number.isFinite(v)) continue;
      const t = Math.min(1, v / Math.max(1, state.params.v0));
      ctx.fillStyle = `hsl(${t * 120} 70% ${dark ? 28 + t * 22 : 40 + t * 20}%)`;
      ctx.fillRect(32 + c * cellW, top + cell * cellH, Math.max(1, cellW + 0.6), cellH + 0.4);
    }
  }
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('space-time (oldest → newest) · cell speed slow→fast · rings show backward-travelling jams', 32, top - 6);
  // ring illustration
  const cx = 400; const cy = top + hmH + 88; const r = 68;
  ctx.strokeStyle = dark ? 'rgba(148,163,184,0.4)' : 'rgba(15,23,42,0.25)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < state.n; i++) {
    const ang = (state.pos[i]! / state.ring) * Math.PI * 2;
    const x = cx + Math.cos(ang) * r; const y = cy + Math.sin(ang) * r;
    const t = Math.min(1, state.vel[i]! / Math.max(1, state.params.v0));
    ctx.fillStyle = `hsl(${t * 120} 75% 52%)`;
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  }
  const d = diagnostics(state);
  ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
  ctx.font = '11px "JetBrains Mono", monospace';
  const dir = jamTravelDirection(state);
  ctx.fillText(`n ${state.n} · ρ ${d.density.toFixed(0)} veh/km · flow ${d.flow.toFixed(0)} veh/h · v̄ ${(d.meanSpeed * 3.6).toFixed(0)} km/h · σ ${d.speedSd.toFixed(2)} · vmin ${(d.minSpeed * 3.6).toFixed(0)} km/h · jam wave ${Number.isFinite(dir) ? dir.toFixed(1) : '—'} m/s`, 16, height - 10);
}

const batch: BatchSpec<Params> = {
  metrics: [
    { id: 'flow', label: 'Flow (veh/h)', kind: 'scalar' },
    { id: 'meanSpeed', label: 'Mean speed (m/s)', kind: 'scalar' },
    { id: 'speedSd', label: 'Speed SD', kind: 'scalar' },
    { id: 'jam', label: 'Jam (v<2 m/s)', kind: 'indicator' },
  ],
  runOne(params, seed) {
    const st = init({ ...params, polarize: true }, createRng(seed));
    for (let i = 0; i < 900; i++) step(st, 0);
    const d = diagnostics(st);
    return { values: Float64Array.from([d.flow, d.meanSpeed, d.speedSd, d.minSpeed < 2 ? 1 : 0]) };
  },
  sweep: { key: 'vehicles', label: 'vehicles', values: [8, 12, 16, 22, 30, 40, 55, 70] },
  defaults: { runs: 20, maxRuns: 100 },
};

const sim: RealtimeSimulation<Params, State> = {
  kind: 'realtime',
  meta,
  defaultParams,
  paramSchema,
  init,
  step: (s, dt) => step(s, dt),
  render,
  applyParams,
  onPointer: (s, ev) => onPointer(s, { type: ev.type, shift: ev.shift }),
  getStats: (s) => { const d = diagnostics(s); return { flow: d.flow.toFixed(0), speed: `${(d.meanSpeed * 3.6).toFixed(0)} km/h`, min: `${(d.minSpeed * 3.6).toFixed(0)} km/h`, jam: d.minSpeed < 2 ? 'YES' : 'no' }; },
  metrics: {
    metrics: [
      { id: 'flow', label: 'Flow', fmt: 'float' },
      { id: 'meanSpeed', label: 'Mean speed', fmt: 'float' },
      { id: 'minSpeed', label: 'Min speed', fmt: 'float' },
      { id: 'speedSd', label: 'Speed SD', fmt: 'float' },
      { id: 'density', label: 'Density', fmt: 'float' },
    ],
    sample: (s, _sh, out) => { const d = diagnostics(s); out[0] = d.flow; out[1] = d.meanSpeed; out[2] = d.minSpeed; out[3] = d.speedSd; out[4] = d.density; },
    every: { by: 'steps', n: 5 },
    policy: 'decimate',
    charts: [
      { id: 'flow', title: 'Flow & mean speed', kind: 'lines', series: ['flow', 'meanSpeed'] },
      { id: 'sd', title: 'Speed dispersion (jam indicator)', kind: 'lines', series: ['speedSd', 'minSpeed'] },
    ],
  },
  batch,
  about: {
    summary:
      'The Intelligent Driver Model on a ring road. No obstacles, no bottlenecks — only car-following. Yet at moderate density a tiny braking perturbation grows into a stop-and-go wave that travels backwards through traffic.',
    bullets: [
      'Space-time diagram: each column is a moment, each row a section of the ring. Slow regions appear as red stripes; a phantom jam slopes against the direction of travel.',
      'Click the ring (or toggle “Brake one car”) to inject a perturbation; at low density it decays, in the unstable density range it amplifies.',
      'The fundamental diagram comes from the Batch tab: sweep vehicles, replicate over seeds with common random numbers, and read flow with confidence intervals.',
      'IDM params: desired speed v₀, time gap T, standstill gap s₀, acceleration, comfortable braking, heterogeneity and trucks.',
      'Ring invariants: the vehicle count is constant, cyclic order is preserved, speeds never go negative, and the minimum gap stays positive.',
    ],
    invariant: 'Collision-free over long runs; jam waves travel backwards with negative speed; free-road speed converges to v₀.',
  },
  concepts:
    '## Concepts\n\n**Why jams appear without obstacles.** IDM is unstable above a critical density: a small speed reduction makes the follower brake slightly harder, which amplifies upstream. The resulting wave moves opposite to the cars.\n\n**The fundamental diagram.** Flow = density × mean speed. Flow rises with density, peaks near capacity, then falls as congestion dominates. Batch runs give the curve with confidence bands.\n\n**MOBIL and networks** (multi-lane lane changing, signalized junctions, the road editor) are the planned extension; this milestone ships the single-lane ring, statistics and batch evidence.\n\n**References.** Treiber, Hennecke & Helbing, Phys. Rev. E (2000); Kesting, Treiber & Helbing (2007); Sugiyama et al., New J. Phys. (2008); Treiber & Kesting, *Traffic Flow Dynamics* (2013).',
};

export { CELLS, HISTORY };
export default sim;
