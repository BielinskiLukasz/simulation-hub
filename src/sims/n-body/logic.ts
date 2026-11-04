// ─── N-body · logic.ts — Float64 gravity, integrators, Barnes–Hut ──────────
// Step functions use only + - * / and Math.sqrt (via gravity), for
// cross-engine bit reproducibility. y-down world, camera handled by shell.

import type { Diagnostics, ParamSchema, Rect, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';
import { Stepper, type IntegratorId } from '../../core/physics/integrators';
import { QuadTree } from '../../core/physics/quadtree';
import { angularMomentum, directAccel, kineticEnergy, momentum, potentialEnergy, treeAccel } from '../../core/physics/gravity';

export interface Params {
  preset: string;
  bodies: number;
  selfGravity: boolean;
  integrator: IntegratorId;
  dt: number;
  substeps: number;
  softening: number;
  forceMethod: string;
  theta: number;
  trails: boolean;
  trailLength: number;
}

export const defaultParams: Params = {
  preset: 'solar-system',
  bodies: 800,
  selfGravity: false,
  integrator: 'verlet',
  dt: 0.01,
  substeps: 2,
  softening: 0.02,
  forceMethod: 'direct',
  theta: 0.5,
  trails: true,
  trailLength: 160,
};

export const paramSchema: ParamSchema<Params> = {
  preset: { kind: 'select', label: 'Preset', options: ['solar-system', 'figure-8', 'three-body-chaos', 'galaxy-collision', 'random-cluster'], hint: 'Re-inits' },
  bodies: { kind: 'range', label: 'Bodies (cluster/galaxy)', min: 3, max: 20000, step: 10, hint: 'Re-inits' },
  selfGravity: { kind: 'boolean', label: 'Galaxy stars have mass', hint: 'Re-inits; uses tree cost when on' },
  integrator: { kind: 'select', label: 'Integrator', options: ['euler', 'semi-implicit', 'verlet', 'rk4'], live: true },
  dt: { kind: 'range', label: 'Integrator dt', min: 0.001, max: 0.05, step: 0.001, live: true },
  substeps: { kind: 'range', label: 'Substeps / runner step', min: 1, max: 50, step: 1, live: true },
  softening: { kind: 'range', label: 'Plummer softening ε', min: 0, max: 0.5, step: 0.005, live: true },
  forceMethod: { kind: 'select', label: 'Force method', options: ['direct', 'barnes-hut'], live: true },
  theta: { kind: 'range', label: 'Barnes–Hut θ', min: 0.2, max: 1.2, step: 0.05, live: true },
  trails: { kind: 'boolean', label: 'Trails (≤200 bodies)', live: true },
  trailLength: { kind: 'range', label: 'Trail length', min: 20, max: 400, step: 10, live: true },
};

export interface State {
  n: number;
  capacity: number;
  pos: Float64Array;
  vel: Float64Array;
  mass: Float64Array;
  src: Int32Array;
  nSrc: number;
  stepper: Stepper;
  tree: QuadTree;
  trail: Float64Array;
  trailHead: number;
  trailCount: number;
  simTime: number;
  G: number;
  launch: { x: number; y: number; cx: number; cy: number } | null;
  rng: Rng;
  params: Params;
}

const MAX_CAPACITY = 20000;

function rebuildSrc(state: State): void {
  let k = 0;
  for (let i = 0; i < state.n; i++) if (state.mass[i]! > 0) state.src[k++] = i;
  state.nSrc = k;
}

function makeAccel(state: State) {
  return (x: Float64Array, _v: Float64Array, a: Float64Array) => {
    const p = state.params;
    const eps2 = p.softening * p.softening;
    if (p.forceMethod === 'barnes-hut') {
      treeAccel(state.tree, x, state.mass, state.src, state.nSrc, state.n, state.G, eps2, p.theta, a);
    } else {
      directAccel(x, state.mass, state.src, state.nSrc, state.n, state.G, eps2, a);
    }
  };
}

function blankState(params: Params, rng: Rng, capacity: number): State {
  const state: State = {
    n: 0,
    capacity,
    pos: new Float64Array(capacity * 2),
    vel: new Float64Array(capacity * 2),
    mass: new Float64Array(capacity),
    src: new Int32Array(capacity),
    nSrc: 0,
    stepper: undefined as never,
    tree: new QuadTree(capacity),
    trail: new Float64Array(0),
    trailHead: 0,
    trailCount: 0,
    simTime: 0,
    G: 1,
    launch: null,
    rng,
    params: { ...params },
  };
  state.stepper = new Stepper(capacity * 2, makeAccel(state));
  return state;
}

function addBody(state: State, x: number, y: number, vx: number, vy: number, mass: number): number {
  if (state.n >= state.capacity) return -1;
  const i = state.n++;
  state.pos[i * 2] = x; state.pos[i * 2 + 1] = y;
  state.vel[i * 2] = vx; state.vel[i * 2 + 1] = vy;
  state.mass[i] = mass;
  return i;
}

export function init(params: Params, rng: Rng): State {
  const requested = params.preset === 'figure-8' ? 3 : params.preset === 'three-body-chaos' ? 3 : params.preset === 'solar-system' ? 5 : Math.round(params.bodies);
  const capacity = Math.max(requested, MAX_CAPACITY);
  const state = blankState(params, rng, capacity);
  const p = params;

  if (p.preset === 'solar-system') {
    state.G = 4 * Math.PI * Math.PI;
    addBody(state, 0, 0, 0, 0, 1);
    // AU / year / solar-mass units: circular speed v = sqrt(G*M/r), G = 4π².
    const planets: [number, number][] = [[1, 3e-6], [1.52, 3.2e-7], [5.2, 9.5e-4], [9.58, 2.9e-4]];
    for (const [r, m] of planets) {
      addBody(state, r, 0, 0, Math.sqrt(state.G / r), m);
    }
    // Zero total momentum: the Sun carries the balancing velocity so the
    // system barycentre stays at the origin.
    let px = 0, py = 0;
    for (let i = 1; i < state.n; i++) { px += state.mass[i]! * state.vel[i * 2]!; py += state.mass[i]! * state.vel[i * 2 + 1]!; }
    state.vel[0] = -px;
    state.vel[1] = -py;
  } else if (p.preset === 'figure-8') {
    state.G = 1;
    addBody(state, -0.97000436 * 120, 0.24308753 * 120, 0.93240737 / 2 * 0.55, -0.86473146 / 2 * 0.55, 1);
    addBody(state, 0.97000436 * 120, -0.24308753 * 120, 0.93240737 / 2 * 0.55, -0.86473146 / 2 * 0.55, 1);
    addBody(state, 0, 0, -0.93240737 * 0.55, 0.86473146 * 0.55, 1);
  } else if (p.preset === 'three-body-chaos') {
    state.G = 1;
    for (let i = 0; i < 3; i++) {
      addBody(state, rng.range(-70, 70), rng.range(-50, 50), rng.range(-0.25, 0.25), rng.range(-0.25, 0.25), rng.range(60, 120));
    }
  } else if (p.preset === 'galaxy-collision') {
    state.G = 1;
    const coreA = addBody(state, -110, 0, 0.55, 0.08, 900);
    const coreB = addBody(state, 110, 10, -0.55, -0.08, 900);
    const stars = Math.max(0, requested - 2);
    for (let i = 0; i < stars; i++) {
      const aroundA = i % 2 === 0;
      const core = aroundA ? coreA : coreB;
      const cx = state.pos[core * 2]!;
      const cy = state.pos[core * 2 + 1]!;
      const r = 12 + rng.next() * 55;
      const ang = rng.range(0, Math.PI * 2);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r * 0.72;
      const speed = Math.sqrt(state.G * 900 / Math.max(8, r)) * 0.028;
      const vx = state.vel[core * 2]! - Math.sin(ang) * speed;
      const vy = state.vel[core * 2 + 1]! + Math.cos(ang) * speed * 0.72;
      addBody(state, x, y, vx, vy, params.selfGravity ? 0.4 : 0);
    }
  } else {
    state.G = 1;
    const totalMass = 1200;
    const per = totalMass / requested;
    for (let i = 0; i < requested; i++) {
      const r = Math.sqrt(rng.next()) * 95;
      const ang = rng.range(0, Math.PI * 2);
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      const speed = Math.sqrt(state.G * totalMass / Math.max(12, r)) * 0.012;
      addBody(state, x, y, -Math.sin(ang) * speed, Math.cos(ang) * speed, per);
    }
  }

  rebuildSrc(state);
  state.trail = new Float64Array(Math.max(1, state.n) * Math.max(20, params.trailLength) * 2);
  state.stepper.invalidate();
  return state;
}

export function step(state: State, _dt: number): State {
  void _dt;
  const p = state.params;
  for (let s = 0; s < Math.max(1, Math.round(p.substeps)); s++) {
    state.stepper.step(p.integrator, state.pos, state.vel, p.dt);
    state.simTime += p.dt;
  }
  if (p.trails && state.n <= 200) {
    const len = Math.max(20, Math.round(p.trailLength));
    if (state.trail.length < state.n * len * 2) state.trail = new Float64Array(state.n * len * 2);
    for (let i = 0; i < state.n; i++) {
      const base = (state.trailHead * state.n + i) * 2;
      state.trail[base] = state.pos[i * 2]!;
      state.trail[base + 1] = state.pos[i * 2 + 1]!;
    }
    state.trailHead = (state.trailHead + 1) % len;
    state.trailCount = Math.min(state.trailCount + 1, len);
  }
  return state;
}

export function applyParams(state: State, params: Params): State {
  state.params = { ...params };
  state.stepper.invalidate();
  return state;
}

export function onPointer(state: State, ev: PointerEv): State {
  if (ev.type === 'down' && ev.button === 2) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < state.n; i++) {
      const dx = state.pos[i * 2]! - ev.x;
      const dy = state.pos[i * 2 + 1]! - ev.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      const last = state.n - 1;
      if (best !== last) {
        state.pos[best * 2] = state.pos[last * 2]!;
        state.pos[best * 2 + 1] = state.pos[last * 2 + 1]!;
        state.vel[best * 2] = state.vel[last * 2]!;
        state.vel[best * 2 + 1] = state.vel[last * 2 + 1]!;
        state.mass[best] = state.mass[last]!;
      }
      state.n--;
      rebuildSrc(state);
      state.stepper.invalidate();
    }
    return state;
  }
  if (ev.type === 'down') {
    state.launch = { x: ev.x, y: ev.y, cx: ev.x, cy: ev.y };
  } else if (ev.type === 'move' && state.launch) {
    state.launch.cx = ev.x;
    state.launch.cy = ev.y;
  } else if (ev.type === 'up' && state.launch) {
    const vx = (ev.x - state.launch.x) * 0.01;
    const vy = (ev.y - state.launch.y) * 0.01;
    addBody(state, state.launch.x, state.launch.y, vx, vy, 8);
    rebuildSrc(state);
    state.stepper.invalidate();
    state.launch = null;
  }
  return state;
}

export function diagnostics(state: State): Diagnostics {
  const eps2 = state.params.softening * state.params.softening;
  const ke = kineticEnergy(state.pos, state.vel, state.mass, state.n);
  let potential: number;
  let approximate = false;
  if (state.nSrc <= 2000) {
    potential = potentialEnergy(state.pos, state.mass, state.src, state.nSrc, state.G, eps2);
  } else {
    approximate = true;
    state.tree.buildInterleaved(state.pos, state.mass, state.src, state.nSrc);
    let sum = 0;
    for (let s = 0; s < state.nSrc; s++) {
      const i = state.src[s]!;
      sum += state.mass[i]! * state.tree.potential(state.pos[i * 2]!, state.pos[i * 2 + 1]!, i, state.params.theta, eps2, state.G);
    }
    potential = 0.5 * sum;
  }
  const mom = momentum(state.vel, state.mass, state.n);
  return {
    time: state.simTime,
    energy: { kinetic: ke, potential },
    momentum: mom,
    angularMomentum: angularMomentum(state.pos, state.vel, state.mass, state.n),
    extras: { bodies: state.n, evals: state.stepper.evals, interactions: state.tree.interactions },
    approximate,
  };
}

export function bounds(state: State): Rect {
  if (state.n === 0) return { x: -100, y: -100, w: 200, h: 200 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < state.n; i++) {
    minX = Math.min(minX, state.pos[i * 2]!); maxX = Math.max(maxX, state.pos[i * 2]!);
    minY = Math.min(minY, state.pos[i * 2 + 1]!); maxY = Math.max(maxY, state.pos[i * 2 + 1]!);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const pad = Math.max(0.5, span * 0.15);
  return { x: minX - pad, y: minY - pad, w: Math.max(1, maxX - minX + pad * 2), h: Math.max(1, maxY - minY + pad * 2) };
}

export function centerOfMass(state: State): { x: number; y: number } {
  let m = 0, x = 0, y = 0;
  for (let i = 0; i < state.n; i++) {
    const mass = state.mass[i]!;
    if (mass <= 0) continue;
    m += mass; x += mass * state.pos[i * 2]!; y += mass * state.pos[i * 2 + 1]!;
  }
  return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
}

export const nbodyLogic = { init, step, applyParams, onPointer, diagnostics, bounds, centerOfMass };
