// ─── Traffic · logic.ts — IDM on a single-lane ring (pure, IEEE-exact) ────
// a = a_max·[1 − (v/v₀)⁴ − (s*/s)²], s* = s₀ + max(0, vT + vΔv/(2√(a·b))).
// Ballistic update; speeds never negative; positions wrap modulo the ring.

import type { ParamSchema, Rng } from '../../core/types';

export interface Params {
  vehicles: number; ringM: number; v0: number; timeGap: number; minGap: number;
  accel: number; decel: number; heterogeneity: number; truckFraction: number;
  noise: number; polarize: boolean;
}

export const defaultParams: Params = {
  vehicles: 22, ringM: 230, v0: 20, timeGap: 1, minGap: 2, accel: 1.5, decel: 2,
  heterogeneity: 0.05, truckFraction: 0.1, noise: 0, polarize: false,
};

export const paramSchema: ParamSchema<Params> = {
  vehicles: { kind: 'range', label: 'Vehicles', min: 2, max: 400, step: 1, hint: 'Sugiyama preset: 22 cars on 230 m' },
  ringM: { kind: 'range', label: 'Ring length', min: 60, max: 2000, step: 10, unit: 'm' },
  v0: { kind: 'range', label: 'Desired speed', min: 5, max: 50, step: 1, unit: 'm/s' },
  timeGap: { kind: 'range', label: 'Time gap T', min: 0.5, max: 3, step: 0.1, unit: 's' },
  minGap: { kind: 'range', label: 'Standstill gap s₀', min: 0.5, max: 6, step: 0.5, unit: 'm' },
  accel: { kind: 'range', label: 'Max acceleration', min: 0.2, max: 4, step: 0.1, unit: 'm/s²' },
  decel: { kind: 'range', label: 'Comfortable deceleration', min: 0.3, max: 6, step: 0.1, unit: 'm/s²' },
  heterogeneity: { kind: 'range', label: 'Driver heterogeneity', min: 0, max: 0.4, step: 0.01 },
  truckFraction: { kind: 'range', label: 'Truck fraction', min: 0, max: 0.5, step: 0.01 },
  noise: { kind: 'range', label: 'Acceleration noise', min: 0, max: 3, step: 0.1, live: true },
  polarize: { kind: 'boolean', label: 'Brake one car (perturbation)', live: true },
};

export const DT = 0.1;
export const CELLS = 120;
export const HISTORY = 240;

export interface State {
  n: number;
  pos: Float64Array; vel: Float64Array; len: Float64Array; v0: Float64Array; T: Float64Array;
  ring: number; time: number; perturbUntil: number; brakeIndex: number;
  speedHistory: Float32Array; historyCols: number; historyHead: number;
  params: Params; rng: Rng;
}

const SUBSTEPS = 6;

export function init(params: Params, rng: Rng): State {
  const n = Math.max(2, Math.round(params.vehicles));
  const state: State = {
    n, pos: new Float64Array(n), vel: new Float64Array(n), len: new Float64Array(n),
    v0: new Float64Array(n), T: new Float64Array(n), ring: params.ringM, time: 0,
    perturbUntil: 0, brakeIndex: Math.floor(n / 2),
    speedHistory: new Float32Array(CELLS * HISTORY), historyCols: 0, historyHead: 0,
    params: { ...params }, rng,
  };
  const spacing = params.ringM / n;
  for (let i = 0; i < n; i++) {
    state.pos[i] = i * spacing;
    const truck = rng.next() < params.truckFraction;
    state.len[i] = truck ? 12 : 4.5;
    state.v0[i] = params.v0 * (1 + rng.range(-params.heterogeneity, params.heterogeneity)) * (truck ? 0.8 : 1);
    state.T[i] = params.timeGap * (truck ? 1.3 : 1);
    state.vel[i] = state.v0[i]! * 0.8;
  }
  return state;
}

export function idm(v: number, v0: number, gap: number, dv: number, T: number, s0: number, a: number, b: number): number {
  const sStar = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
  const g = Math.max(0.1, gap);
  return a * (1 - (v / Math.max(0.1, v0)) ** 4 - (sStar / g) ** 2);
}

export function step(state: State, _dt: number): State {
  void _dt;
  const p = state.params;
  for (let sub = 0; sub < SUBSTEPS; sub++) {
    state.time += DT;
    for (let i = 0; i < state.n; i++) {
      const lead = (i + 1) % state.n;
      let gap = lead === 0 ? state.pos[0]! + state.ring - state.pos[i]! : state.pos[lead]! - state.pos[i]!;
      gap -= state.len[lead]!;
      const dv = state.vel[i]! - state.vel[lead]!;
      let a = idm(state.vel[i]!, state.v0[i]!, gap, dv, state.T[i]!, p.minGap, p.accel, p.decel);
      if (p.polarize && state.time < state.perturbUntil && i === state.brakeIndex % state.n) a -= 6;
      if (p.noise > 0) a += (state.rng.next() - 0.5) * p.noise;
      const vOld = state.vel[i]!;
      const vNext = vOld + a * DT;
      const v = Math.max(0, vNext);
      let x = vNext >= 0 ? state.pos[i]! + vOld * DT + 0.5 * a * DT * DT : state.pos[i]! - (vOld * vOld) / (2 * Math.max(0.1, -a));
      x = ((x % state.ring) + state.ring) % state.ring;
      state.pos[i] = x; state.vel[i] = v;
    }
    const order = Array.from({ length: state.n }, (_, i) => i).sort((a, b) => state.pos[a]! - state.pos[b]!);
    if (order.some((v, i) => v !== i)) {
      const P2 = state.pos.slice(); const V2 = state.vel.slice(); const L2 = state.len.slice(); const V02 = state.v0.slice(); const T2 = state.T.slice();
      order.forEach((src, i) => { state.pos[i] = P2[src]!; state.vel[i] = V2[src]!; state.len[i] = L2[src]!; state.v0[i] = V02[src]!; state.T[i] = T2[src]!; });
    }
  }
  const col = state.historyHead;
  for (let c = 0; c < CELLS; c++) {
    const from = (c / CELLS) * state.ring; const to = ((c + 1) / CELLS) * state.ring;
    let sum = 0; let count = 0;
    for (let i = 0; i < state.n; i++) { const x = state.pos[i]!; if (x >= from && x < to) { sum += state.vel[i]!; count++; } }
    state.speedHistory[col * CELLS + c] = count ? sum / count : NaN;
  }
  state.historyHead = (col + 1) % HISTORY;
  state.historyCols = Math.min(HISTORY, state.historyCols + 1);
  return state;
}

export function applyParams(state: State, params: Params): State { state.params = { ...params }; return state; }

export function onPointer(state: State, ev: { type: string; shift: boolean }): State {
  if (ev.type !== 'down') return state;
  state.perturbUntil = state.time + 1.5;
  state.brakeIndex = Math.floor((ev.shift ? 0.66 : 0.5) * state.n);
  return state;
}

export function diagnostics(state: State): { flow: number; meanSpeed: number; speedSd: number; minSpeed: number; density: number } {
  let mean = 0; let min = Infinity;
  for (let i = 0; i < state.n; i++) { mean += state.vel[i]!; min = Math.min(min, state.vel[i]!); }
  mean /= Math.max(1, state.n);
  let varSum = 0;
  for (let i = 0; i < state.n; i++) varSum += (state.vel[i]! - mean) ** 2;
  const density = state.n / (state.ring / 1000);
  return { flow: density * mean * 3.6, meanSpeed: mean, speedSd: Math.sqrt(varSum / Math.max(1, state.n)), minSpeed: min === Infinity ? 0 : min, density };
}

/** Cell displacement of the slowest region between the last two rows (m/s; negative = backwards). */
export function jamTravelDirection(state: State): number {
  if (state.historyCols < 2) return NaN;
  const last = (state.historyHead - 1 + HISTORY) % HISTORY;
  const prev = (state.historyHead - 2 + HISTORY) % HISTORY;
  // Weighted circular centroid of "slowness" in each profile; its angular
  // displacement is the wave displacement. Negative = opposite to travel.
  const centroid = (row: number): number => {
    let sx = 0; let sy = 0;
    for (let c = 0; c < CELLS; c++) {
      const v = state.speedHistory[row * CELLS + c]!;
      if (!Number.isFinite(v)) continue;
      const w = Math.max(0, state.params.v0 - v);
      const ang = (c / CELLS) * Math.PI * 2;
      sx += w * Math.cos(ang); sy += w * Math.sin(ang);
    }
    return Math.atan2(sy, sx);
  };
  let a = centroid(last);
  let b = centroid(prev);
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  a = 0; b = 0;
  return (delta / (Math.PI * 2)) * state.ring / (DT * SUBSTEPS);
}
