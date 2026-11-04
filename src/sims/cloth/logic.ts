// ─── Cloth · logic.ts — Verlet particles + iterative constraints (pure) ────
// Only + - * / and Math.sqrt in the step; wind is integer-hash value noise.

import type { ParamSchema, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';

export interface Params {
  object: string;
  clothW: number;
  clothH: number;
  spacing: number;
  pins: string;
  iterations: number;
  substeps: number;
  gravity: number;
  damping: number; // percent
  stiffness: number;
  windStrength: number;
  windGust: number;
  tearRatio: number;
  showStrain: boolean;
  blobs: number;
}

export const defaultParams: Params = {
  object: 'cloth',
  clothW: 34,
  clothH: 22,
  spacing: 15,
  pins: 'top-row',
  iterations: 12,
  substeps: 2,
  gravity: 900,
  damping: 0.4,
  stiffness: 1,
  windStrength: 60,
  windGust: 0.7,
  tearRatio: 3,
  showStrain: true,
  blobs: 2,
};

export const paramSchema: ParamSchema<Params> = {
  object: { kind: 'select', label: 'Object', options: ['cloth', 'rope', 'blob'], hint: 'Re-inits' },
  clothW: { kind: 'range', label: 'Cloth width (particles)', min: 10, max: 100, step: 1, hint: 'Re-inits' },
  clothH: { kind: 'range', label: 'Cloth height', min: 8, max: 60, step: 1, hint: 'Re-inits' },
  spacing: { kind: 'range', label: 'Rest spacing', min: 8, max: 24, step: 1, unit: 'px', hint: 'Re-inits' },
  pins: { kind: 'select', label: 'Pins', options: ['top-row', 'corners', 'none'], hint: 'Re-inits' },
  iterations: { kind: 'range', label: 'Constraint iterations', min: 1, max: 50, step: 1, live: true },
  substeps: { kind: 'range', label: 'Substeps', min: 1, max: 10, step: 1, live: true },
  gravity: { kind: 'range', label: 'Gravity', min: 0, max: 2000, step: 10, unit: 'px/s²', live: true },
  damping: { kind: 'range', label: 'Damping', min: 0, max: 5, step: 0.1, unit: '%', live: true },
  stiffness: { kind: 'range', label: 'Stiffness', min: 0.05, max: 1, step: 0.05, live: true },
  windStrength: { kind: 'range', label: 'Wind strength', min: 0, max: 400, step: 5, live: true },
  windGust: { kind: 'range', label: 'Wind gustiness', min: 0, max: 1, step: 0.05, live: true },
  tearRatio: { kind: 'range', label: 'Tear ratio (×rest)', min: 1.2, max: 4, step: 0.1, live: true },
  showStrain: { kind: 'boolean', label: 'Colour by strain', live: true },
  blobs: { kind: 'range', label: 'Blobs', min: 1, max: 5, step: 1, hint: 'Re-inits (blob mode)' },
};

export const WORLD = { w: 800, h: 600 } as const;
export const GROUND_Y = 560;

export interface State {
  n: number;
  x: Float64Array; y: Float64Array;
  px: Float64Array; py: Float64Array;
  invMass: Float64Array;
  nc: number;
  ca: Int32Array; cb: Int32Array;
  rest: Float64Array;
  alive: Uint8Array;
  kind: Uint8Array; // 0 structural 1 shear 2 bend
  grab: { i: number; tx: number; ty: number } | null;
  lastPointer: { x: number; y: number; down: boolean; cutting: boolean } | null;
  tick: number;
  torn: number;
  maxStrain: number;
  maxVelocity: number;
  rng: Rng;
  params: Params;
}

interface Builder {
  xs: number[]; ys: number[]; inv: number[];
  ca: number[]; cb: number[]; rest: number[]; kind: number[];
}

function hashNoise(ix: number, iy: number, it: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(it, 1442695041);
  h = Math.imul(h ^ (h >> 13), 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967296 * 2 - 1;
}

export function windAt(x: number, y: number, tick: number, params: Params): number {
  if (params.windStrength === 0) return 0;
  const cell = 90;
  const ix = Math.floor(x / cell);
  const iy = Math.floor(y / cell);
  const it = Math.floor(tick / 24);
  const fx = (x - ix * cell) / cell;
  const fy = (y - iy * cell) / cell;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hashNoise(ix, iy, it);
  const b = hashNoise(ix + 1, iy, it);
  const c = hashNoise(ix, iy + 1, it);
  const d = hashNoise(ix + 1, iy + 1, it);
  const n = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  return params.windStrength * (0.35 + params.windGust * n);
}

function addConstraint(b: Builder, i: number, j: number, kind: number): void {
  if (i < 0 || j < 0 || i === j) return;
  // Rest lengths are computed in finish(): builders may reference particles
  // that have not been pushed yet (blob ring neighbours).
  b.ca.push(i); b.cb.push(j);
  b.rest.push(0);
  b.kind.push(kind);
}

function finish(b: Builder, params: Params, rng: Rng): State {
  for (let k = 0; k < b.ca.length; k++) {
    const i = b.ca[k]!; const j = b.cb[k]!;
    const dx = b.xs[j]! - b.xs[i]!;
    const dy = b.ys[j]! - b.ys[i]!;
    b.rest[k] = Math.sqrt(dx * dx + dy * dy);
  }
  return {
    n: b.xs.length,
    x: Float64Array.from(b.xs), y: Float64Array.from(b.ys),
    px: Float64Array.from(b.xs), py: Float64Array.from(b.ys),
    invMass: Float64Array.from(b.inv),
    nc: b.ca.length,
    ca: Int32Array.from(b.ca), cb: Int32Array.from(b.cb),
    rest: Float64Array.from(b.rest), alive: new Uint8Array(b.ca.length).fill(1), kind: Uint8Array.from(b.kind),
    grab: null, lastPointer: null, tick: 0, torn: 0, maxStrain: 0, maxVelocity: 0,
    rng, params: { ...params },
  };
}

export function buildCloth(params: Params, rng: Rng): State {
  const b: Builder = { xs: [], ys: [], inv: [], ca: [], cb: [], rest: [], kind: [] };
  const W = Math.round(params.clothW);
  const H = Math.round(params.clothH);
  const sp = params.spacing;
  const x0 = 400 - (W - 1) * sp / 2;
  const y0 = 90;
  const id = (x: number, y: number) => y * W + x;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pinned = params.pins === 'top-row' ? y === 0 : params.pins === 'corners' ? y === 0 && (x === 0 || x === W - 1) : false;
      b.xs.push(x0 + x * sp); b.ys.push(y0 + y * sp); b.inv.push(pinned ? 0 : 1);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x + 1 < W) addConstraint(b, id(x, y), id(x + 1, y), 0);
      if (y + 1 < H) addConstraint(b, id(x, y), id(x, y + 1), 0);
      if (x + 1 < W && y + 1 < H) { addConstraint(b, id(x, y), id(x + 1, y + 1), 1); addConstraint(b, id(x + 1, y), id(x, y + 1), 1); }
      if (x + 2 < W) addConstraint(b, id(x, y), id(x + 2, y), 2);
      if (y + 2 < H) addConstraint(b, id(x, y), id(x, y + 2), 2);
    }
  }
  return finish(b, params, rng);
}

export function buildRope(params: Params, rng: Rng): State {
  const b: Builder = { xs: [], ys: [], inv: [], ca: [], cb: [], rest: [], kind: [] };
  const n = 26;
  for (let i = 0; i < n; i++) {
    b.xs.push(180 + i * params.spacing);
    b.ys.push(110);
    b.inv.push(i === 0 ? 0 : 1);
    if (i > 0) addConstraint(b, i - 1, i, 0);
  }
  return finish(b, params, rng);
}

export function buildBlob(params: Params, rng: Rng, count = params.blobs): State {
  const b: Builder = { xs: [], ys: [], inv: [], ca: [], cb: [], rest: [], kind: [] };
  const per = 14;
  for (let blob = 0; blob < count; blob++) {
    const cx = 230 + blob * 170;
    const cy = 190 + (blob % 2) * 90;
    const radius = 58;
    const base = b.xs.length;
    b.xs.push(cx); b.ys.push(cy); b.inv.push(1);
    for (let i = 0; i < per; i++) {
      const ang = (i / per) * Math.PI * 2;
      b.xs.push(cx + Math.cos(ang) * radius);
      b.ys.push(cy + Math.sin(ang) * radius);
      b.inv.push(1);
      addConstraint(b, base, base + 1 + i, 0);
      addConstraint(b, base + 1 + i, base + 1 + ((i + 1) % per), 0);
      addConstraint(b, base + 1 + i, base + 1 + ((i + 2) % per), 2);
    }
  }
  return finish(b, params, rng);
}

export function init(params: Params, rng: Rng): State {
  if (params.object === 'rope') return buildRope(params, rng);
  if (params.object === 'blob') return buildBlob(params, rng);
  return buildCloth(params, rng);
}

export function step(state: State, dt: number): State {
  const p = state.params;
  const sub = Math.max(1, Math.round(p.substeps));
  const h = dt / sub;
  const damp = Math.max(0, 1 - p.damping / 100);
  state.maxStrain = 0;
  state.maxVelocity = 0;

  for (let s = 0; s < sub; s++) {
    state.tick++;
    // integrate
    for (let i = 0; i < state.n; i++) {
      if (state.invMass[i] === 0) { state.px[i] = state.x[i]!; state.py[i] = state.y[i]!; continue; }
      if (state.grab?.i === i) continue;
      const x = state.x[i]!;
      const y = state.y[i]!;
      const vx = (x - state.px[i]!) * damp;
      const vy = (y - state.py[i]!) * damp;
      const wind = windAt(x, y, state.tick, p);
      state.px[i] = x; state.py[i] = y;
      state.x[i] = x + vx + wind * h * h;
      state.y[i] = y + vy + p.gravity * h * h;
      const sp = Math.sqrt(vx * vx + vy * vy) / Math.max(h, 1e-9);
      if (sp > state.maxVelocity) state.maxVelocity = sp;
    }
    if (state.grab) {
      const i = state.grab.i;
      state.px[i] = state.x[i]!;
      state.py[i] = state.y[i]!;
      state.x[i] = state.grab.tx;
      state.y[i] = state.grab.ty;
    }

    // constraints
    const iterations = Math.max(1, Math.round(p.iterations));
    for (let iter = 0; iter < iterations; iter++) {
      const forward = iter % 2 === 0;
      for (let k0 = 0; k0 < state.nc; k0++) {
        const k = forward ? k0 : state.nc - 1 - k0;
        if (!state.alive[k]) continue;
        const i = state.ca[k]!;
        const j = state.cb[k]!;
        const dx = state.x[j]! - state.x[i]!;
        const dy = state.y[j]! - state.y[i]!;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d === 0) continue;
        const rest = state.rest[k]!;
        if (iter === iterations - 1) {
          const strain = Math.abs(d - rest) / rest;
          if (strain > state.maxStrain) state.maxStrain = strain;
          if (p.tearRatio > 0 && d > rest * p.tearRatio) { state.alive[k] = 0; state.torn++; continue; }
        }
        const wi = state.invMass[i]!;
        const wj = state.invMass[j]!;
        const wsum = wi + wj;
        if (wsum === 0) continue;
        const diff = (d - rest) / d * p.stiffness;
        const cx = dx * diff;
        const cy = dy * diff;
        state.x[i] = state.x[i]! + cx * (wi / wsum);
        state.y[i] = state.y[i]! + cy * (wi / wsum);
        state.x[j] = state.x[j]! - cx * (wj / wsum);
        state.y[j] = state.y[j]! - cy * (wj / wsum);
      }
    }

    // collisions: ground + bounds
    for (let i = 0; i < state.n; i++) {
      if (state.invMass[i] === 0) continue;
      if (state.y[i]! > GROUND_Y) {
        state.y[i] = GROUND_Y;
        state.px[i] = state.px[i]! + (state.x[i]! - state.px[i]!) * 0.35; // friction
      }
      if (state.x[i]! < 4) state.x[i] = 4;
      if (state.x[i]! > WORLD.w - 4) state.x[i] = WORLD.w - 4;
      if (state.y[i]! < 4) state.y[i] = 4;
    }
  }
  return state;
}

export function applyParams(state: State, params: Params): State {
  state.params = { ...params };
  return state;
}

function nearest(state: State, x: number, y: number, maxD: number): number {
  let best = -1;
  let bestD = maxD * maxD;
  for (let i = 0; i < state.n; i++) {
    const dx = state.x[i]! - x;
    const dy = state.y[i]! - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (d === 0) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function onPointer(state: State, ev: PointerEv): State {
  if (ev.type === 'down') {
    state.lastPointer = { x: ev.x, y: ev.y, down: true, cutting: ev.button === 2 || ev.alt };
    if (ev.shift) {
      const i = nearest(state, ev.x, ev.y, 34);
      if (i >= 0) state.invMass[i] = state.invMass[i] === 0 ? 1 : 0;
      return state;
    }
    if (ev.button !== 2 && !ev.alt) {
      const i = nearest(state, ev.x, ev.y, 42);
      if (i >= 0) state.grab = { i, tx: ev.x, ty: ev.y };
    }
    return state;
  }
  if (ev.type === 'move') {
    if (state.grab && ev.pressed) { state.grab.tx = ev.x; state.grab.ty = ev.y; }
    if (state.lastPointer?.cutting && ev.pressed) {
      const prev = state.lastPointer;
      for (let k = 0; k < state.nc; k++) {
        if (!state.alive[k]) continue;
        const i = state.ca[k]!;
        const j = state.cb[k]!;
        if (segmentsCross(prev.x, prev.y, ev.x, ev.y, state.x[i]!, state.y[i]!, state.x[j]!, state.y[j]!)) {
          state.alive[k] = 0;
          state.torn++;
        }
      }
    }
    state.lastPointer = { x: ev.x, y: ev.y, down: ev.pressed, cutting: state.lastPointer?.cutting ?? false };
    return state;
  }
  if (ev.type === 'up') {
    state.grab = null;
    state.lastPointer = null;
  }
  return state;
}

export function diagnosticsExtras(state: State): Record<string, number> {
  return { maxStrain: state.maxStrain, maxVelocity: state.maxVelocity, torn: state.torn, constraints: state.nc };
}
