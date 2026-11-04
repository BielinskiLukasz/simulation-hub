// ─── Double Pendulum · logic.ts ─────────────────────────────────────────────
// PURE. Classic two-link pendulum (m1 = m2 = 1), RK4 integration with 2
// substeps per runner step. Angles measured from the downward vertical;
// positions x = L·sinθ, y = L·cosθ (screen-down). Ghosts are copies of the
// state perturbed by ~0.001 rad at init — they visualise Lyapunov divergence.

import type { ParamSchema, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';

export interface Params {
  theta1: number; // degrees, initial
  theta2: number; // degrees, initial
  gravity: number; // px/s² (live)
  length1: number; // px (live)
  length2: number; // px (live)
  damping: number; // 1/s velocity decay (live)
  ghosts: number; // perturbed copies (re-init)
  trail: boolean; // bob-2 trail (live)
}

export const defaultParams: Params = {
  theta1: 130,
  theta2: 160,
  gravity: 981,
  length1: 150,
  length2: 150,
  damping: 0,
  ghosts: 5,
  trail: true,
};

export const paramSchema: ParamSchema<Params> = {
  theta1: { kind: 'range', label: 'Initial angle θ₁', min: -170, max: 170, step: 1, unit: '°', hint: 'Re-inits' },
  theta2: { kind: 'range', label: 'Initial angle θ₂', min: -170, max: 170, step: 1, unit: '°', hint: 'Re-inits' },
  gravity: { kind: 'range', label: 'Gravity', min: 100, max: 2000, step: 10, unit: 'px/s²', live: true },
  length1: { kind: 'range', label: 'Rod 1 length', min: 80, max: 220, step: 5, unit: 'px', live: true },
  length2: { kind: 'range', label: 'Rod 2 length', min: 80, max: 220, step: 5, unit: 'px', live: true },
  damping: { kind: 'range', label: 'Damping', min: 0, max: 0.5, step: 0.005, unit: '1/s', live: true },
  ghosts: { kind: 'range', label: 'Ghost pendulums', min: 0, max: 12, step: 1, hint: '±0.001 rad perturbations (re-inits)' },
  trail: { kind: 'boolean', label: 'Show trail', live: true },
};

export const WORLD = { w: 800, h: 600 } as const;
export const PIVOT = { x: 400, y: 225 } as const;
const TRAIL_MAX = 900;

export interface PendulumState { a1: number; w1: number; a2: number; w2: number }

export interface State {
  main: PendulumState;
  ghosts: PendulumState[];
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead: number;
  trailCount: number;
  time: number;
  rng: Rng;
  params: Params;
  w: number;
  h: number;
}

type Vec = [number, number, number, number];

function derivs(v: Vec, p: Params): Vec {
  const [a1, w1, a2, w2] = v;
  const { gravity: g, length1: L1, length2: L2 } = p;
  const den = 3 - Math.cos(2 * a1 - 2 * a2); // 2m1+m2 − m2·cos(2a1−2a2) with m1=m2=1 → 3 − cos(...)
  const a1acc =
    (-g * 3 * Math.sin(a1) - g * Math.sin(a1 - 2 * a2) - 2 * Math.sin(a1 - a2) * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(a1 - a2))) /
    (L1 * den);
  const a2acc =
    (2 * Math.sin(a1 - a2) * (w1 * w1 * L1 * 2 + g * 2 * Math.cos(a1) + w2 * w2 * L2 * Math.cos(a1 - a2))) /
    (L2 * den);
  return [w1, a1acc, w2, a2acc];
}

function rk4(v: Vec, dt: number, p: Params): Vec {
  const k1 = derivs(v, p);
  const v2 = v.map((x, i) => x + k1[i]! * dt / 2) as Vec;
  const k2 = derivs(v2, p);
  const v3 = v.map((x, i) => x + k2[i]! * dt / 2) as Vec;
  const k3 = derivs(v3, p);
  const v4 = v.map((x, i) => x + k3[i]! * dt) as Vec;
  const k4 = derivs(v4, p);
  return v.map((x, i) => x + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!)) as Vec;
}

function advance(s: PendulumState, dt: number, p: Params): PendulumState {
  const sub = 2;
  let v: Vec = [s.a1, s.w1, s.a2, s.w2];
  for (let i = 0; i < sub; i++) v = rk4(v, dt / sub, p);
  const decay = Math.max(0, 1 - p.damping * dt);
  return { a1: v[0], w1: v[1] * decay, a2: v[2], w2: v[3] * decay };
}

export function bobPositions(s: PendulumState, p: Params): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = PIVOT.x + p.length1 * Math.sin(s.a1);
  const y1 = PIVOT.y + p.length1 * Math.cos(s.a1);
  const x2 = x1 + p.length2 * Math.sin(s.a2);
  const y2 = y1 + p.length2 * Math.cos(s.a2);
  return { x1, y1, x2, y2 };
}

/** Total mechanical energy (m1 = m2 = 1). Conserved when damping = 0. */
export function energy(s: PendulumState, p: Params): number {
  const { gravity: g, length1: L1, length2: L2 } = p;
  const v1sq = L1 * L1 * s.w1 * s.w1;
  const v2sq = v1sq + L2 * L2 * s.w2 * s.w2 + 2 * L1 * L2 * s.w1 * s.w2 * Math.cos(s.a1 - s.a2);
  const ke = 0.5 * v1sq + 0.5 * v2sq;
  const pe = -2 * g * L1 * Math.cos(s.a1) - g * L2 * Math.cos(s.a2);
  return ke + pe;
}

export function init(params: Params, rng: Rng): State {
  const deg = Math.PI / 180;
  const main: PendulumState = { a1: params.theta1 * deg, w1: 0, a2: params.theta2 * deg, w2: 0 };
  const ghosts: PendulumState[] = [];
  for (let i = 0; i < params.ghosts; i++) {
    ghosts.push({
      a1: main.a1 + rng.range(-0.001, 0.001),
      w1: 0,
      a2: main.a2 + rng.range(-0.001, 0.001),
      w2: 0,
    });
  }
  return {
    main, ghosts,
    trailX: new Float32Array(TRAIL_MAX),
    trailY: new Float32Array(TRAIL_MAX),
    trailHead: 0, trailCount: 0,
    time: 0, rng, params: { ...params }, w: WORLD.w, h: WORLD.h,
  };
}

export function step(state: State, dt: number): State {
  state.main = advance(state.main, dt, state.params);
  state.ghosts = state.ghosts.map((g) => advance(g, dt, state.params));
  const { x2, y2 } = bobPositions(state.main, state.params);
  state.trailX[state.trailHead] = x2;
  state.trailY[state.trailHead] = y2;
  state.trailHead = (state.trailHead + 1) % TRAIL_MAX;
  state.trailCount = Math.min(state.trailCount + 1, TRAIL_MAX);
  state.time += dt;
  return state;
}

/** Live: gravity/lengths/damping swap in place; angles are untouched. */
export function applyParams(state: State, params: Params): State {
  state.params = { ...params };
  return state;
}

/** Pointer: aim both links toward the click and release from rest. */
export function onPointer(state: State, ev: PointerEv): State {
  if (ev.type !== 'down' && !(ev.type === 'move' && ev.pressed)) return state;
  const ang = Math.atan2(ev.x - PIVOT.x, ev.y - PIVOT.y); // from downward vertical
  state.main = { a1: ang, w1: 0, a2: ang, w2: 0 };
  state.ghosts = state.ghosts.map((_g, i) => ({
    a1: ang + (i - state.ghosts.length / 2) * 0.0004, w1: 0,
    a2: ang + (i - state.ghosts.length / 2) * 0.0004, w2: 0,
  }));
  state.trailCount = 0;
  state.trailHead = 0;
  return state;
}
