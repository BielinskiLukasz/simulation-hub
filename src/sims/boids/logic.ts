// ─── Boids · logic.ts ───────────────────────────────────────────────────────
// PURE (ESLint-enforced). Structure-of-arrays state preallocated to MAX —
// the hot loop allocates nothing: typed arrays, a reusable scratch buffer,
// scalar locals, squared distances first.
//
// Step: hash.rebuild → per-boid neighbour forces (separation / alignment /
// cohesion) → predator flee + obstacle avoidance → integrate → wrap/bounce.
// stepBrute is the O(n²) reference used ONLY by the hash-equivalence test.

import type { ParamSchema, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';
import { SpatialHash } from '../../core/spatial-hash';

export interface Params {
  count: number;
  separation: number;
  alignment: number;
  cohesion: number;
  perception: number;
  maxSpeed: number;
  maxForce: number;
  predators: number;
  obstacles: boolean;
  edges: string;
  colorBy: string;
}

export const defaultParams: Params = {
  count: 1500,
  separation: 1.5,
  alignment: 1.0,
  cohesion: 1.0,
  perception: 40,
  maxSpeed: 180,
  maxForce: 300,
  predators: 0,
  obstacles: true,
  edges: 'wrap',
  colorBy: 'heading',
};

export const paramSchema: ParamSchema<Params> = {
  count: { kind: 'range', label: 'Boids', min: 100, max: 10000, step: 100, hint: 'Re-inits the flock' },
  separation: { kind: 'range', label: 'Separation weight', min: 0, max: 3, step: 0.05, live: true },
  alignment: { kind: 'range', label: 'Alignment weight', min: 0, max: 3, step: 0.05, live: true },
  cohesion: { kind: 'range', label: 'Cohesion weight', min: 0, max: 3, step: 0.05, live: true },
  perception: { kind: 'range', label: 'Perception radius', min: 10, max: 100, step: 1, unit: 'px', live: true },
  maxSpeed: { kind: 'range', label: 'Max speed', min: 50, max: 400, step: 5, unit: 'px/s', live: true },
  maxForce: { kind: 'range', label: 'Max steering force', min: 50, max: 800, step: 10, unit: 'px/s²', live: true },
  predators: { kind: 'range', label: 'Predators (initial)', min: 0, max: 5, step: 1, hint: 'Re-inits; Shift+click adds more' },
  obstacles: { kind: 'boolean', label: 'Obstacles enabled', hint: 'Alt+click places, right-click removes', live: true },
  edges: { kind: 'select', label: 'Edges', options: ['wrap', 'bounce'], live: true },
  colorBy: { kind: 'select', label: 'Colour by', options: ['heading', 'speed', 'mono'], live: true },
};

export const WORLD = { w: 800, h: 600 } as const;
export const MAX = 10000;
const FEAR_RADIUS = 140;
const MIN_SPEED_FRAC = 0.35;

export interface Predator { x: number; y: number; vx: number; vy: number }
export interface Obstacle { x: number; y: number; r: number }

export interface State {
  n: number;
  x: Float32Array; y: Float32Array;
  vx: Float32Array; vy: Float32Array;
  ax: Float32Array; ay: Float32Array;
  predators: Predator[];
  obstacles: Obstacle[];
  hash: SpatialHash;
  scratch: Int32Array;
  avgNeighbors: number;
  rng: Rng;
  params: Params;
  w: number;
  h: number;
}

export function init(params: Params, rng: Rng): State {
  const x = new Float32Array(MAX); const y = new Float32Array(MAX);
  const vx = new Float32Array(MAX); const vy = new Float32Array(MAX);
  const n = Math.min(params.count, MAX);
  for (let i = 0; i < n; i++) {
    x[i] = rng.range(0, WORLD.w);
    y[i] = rng.range(0, WORLD.h);
    const ang = rng.range(0, Math.PI * 2);
    const sp = rng.range(params.maxSpeed * 0.4, params.maxSpeed);
    vx[i] = Math.cos(ang) * sp;
    vy[i] = Math.sin(ang) * sp;
  }
  const predators: Predator[] = [];
  for (let i = 0; i < params.predators; i++) {
    predators.push({ x: rng.range(0, WORLD.w), y: rng.range(0, WORLD.h), vx: rng.range(-60, 60), vy: rng.range(-60, 60) });
  }
  return {
    n, x, y, vx, vy,
    ax: new Float32Array(MAX), ay: new Float32Array(MAX),
    predators, obstacles: [],
    hash: new SpatialHash(WORLD.w, WORLD.h, Math.max(params.perception / 2, 10), MAX),
    scratch: new Int32Array(MAX),
    avgNeighbors: 0, rng, params: { ...params }, w: WORLD.w, h: WORLD.h,
  };
}

/** Live hot update: steering params swap in place; the flock is untouched. */
export function applyParams(state: State, params: Params): State {
  const perceptionChanged = params.perception !== state.params.perception;
  state.params = { ...params };
  if (perceptionChanged) {
    state.hash = new SpatialHash(state.w, state.h, Math.max(params.perception / 2, 10), MAX);
  }
  return state;
}

function spawn(state: State, px: number, py: number, count: number): void {
  const { rng, params } = state;
  for (let k = 0; k < count && state.n < MAX; k++) {
    const i = state.n++;
    state.x[i] = Math.min(Math.max(px + rng.range(-6, 6), 0), state.w - 0.01);
    state.y[i] = Math.min(Math.max(py + rng.range(-6, 6), 0), state.h - 0.01);
    const ang = rng.range(0, Math.PI * 2);
    const sp = rng.range(params.maxSpeed * 0.4, params.maxSpeed);
    state.vx[i] = Math.cos(ang) * sp;
    state.vy[i] = Math.sin(ang) * sp;
  }
}

export function onPointer(state: State, ev: PointerEv): State {
  if (ev.button === 2 && ev.type === 'down') {
    // right-click: remove nearest obstacle/predator under the cursor
    let best = -1; let bestD = 60 * 60;
    state.obstacles.forEach((o, i) => { const d = (o.x - ev.x) ** 2 + (o.y - ev.y) ** 2; if (d < bestD) { bestD = d; best = i; } });
    if (best >= 0) { state.obstacles.splice(best, 1); return state; }
    best = -1; bestD = 60 * 60;
    state.predators.forEach((p, i) => { const d = (p.x - ev.x) ** 2 + (p.y - ev.y) ** 2; if (d < bestD) { bestD = d; best = i; } });
    if (best >= 0) state.predators.splice(best, 1);
    return state;
  }
  if (ev.type === 'down' && ev.shift) {
    if (state.predators.length < 5) state.predators.push({ x: ev.x, y: ev.y, vx: 0, vy: 0 });
    return state;
  }
  if (ev.type === 'down' && ev.alt) {
    if (state.params.obstacles) state.obstacles.push({ x: ev.x, y: ev.y, r: 36 });
    return state;
  }
  if (ev.type === 'down') spawn(state, ev.x, ev.y, 10);
  else if (ev.type === 'move' && ev.pressed) spawn(state, ev.x, ev.y, 3);
  return state;
}

export function step(state: State, dt: number): State {
  return stepMode(state, dt, true);
}

/** O(n²) reference — test-only equivalence check for the spatial hash path. */
export function stepBrute(state: State, dt: number): State {
  return stepMode(state, dt, false);
}

function stepMode(state: State, dt: number, useHash: boolean): State {
  const p = state.params;
  const { x, y, vx, vy, ax, ay, n, w, h } = state;
  const wrap = p.edges === 'wrap';
  const perc = p.perception;
  const perc2 = perc * perc;
  const sepRadius = perc * 0.4;
  const sep2 = sepRadius * sepRadius;

  if (useHash) state.hash.rebuild(x, y, n);

  let neighborTotal = 0;

  for (let i = 0; i < n; i++) {
    const xi = x[i]!; const yi = y[i]!;
    let cnt = 0;
    let sumVx = 0; let sumVy = 0; // alignment
    let sumDx = 0; let sumDy = 0; // cohesion (offsets to neighbours)
    let sepX = 0; let sepY = 0; // separation

    // Inlined neighbour accumulation (no per-boid closure — it was the
    // single biggest hot-loop cost). The body is duplicated for the hash
    // and brute-force candidate sources on purpose.
    if (useHash) {
      // Iterate the hash's sorted cells directly — no scratch copy in the hot loop.
      const starts = state.hash.start;
      const items = state.hash.items;
      const cs = state.hash.cellSize;
      const cols = state.hash.cols;
      const rows = state.hash.rows;
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(xi / cs)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(yi / cs)));
      // cellSize = perception/2 → a 5x5 block covers the radius with
      // ~30% fewer candidates than a 3x3 block of perception-sized cells.
      const cr = Math.max(1, Math.ceil(perc / cs));
      for (let gy = -cr; gy <= cr; gy++) {
        const yy = (cy + gy + rows) % rows;
        for (let gx = -cr; gx <= cr; gx++) {
          const xx = (cx + gx + cols) % cols;
          const cell = yy * cols + xx;
          const end = starts[cell + 1]!;
          for (let k = starts[cell]!; k < end; k++) {
            const j = items[k]!;
            if (j === i) continue;
        let dx = x[j]! - xi;
        let dy = y[j]! - yi;
        if (wrap) {
          if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
          if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
        }
        if (dx > perc || dx < -perc || dy > perc || dy < -perc) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > perc2 || d2 === 0) continue;
        cnt++;
        sumVx += vx[j]!; sumVy += vy[j]!;
        sumDx += dx; sumDy += dy;
            if (d2 < sep2) { const inv = 1 / (d2 > 1 ? d2 : 1); sepX -= dx * inv; sepY -= dy * inv; }
          }
        }
      }
    } else {
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        let dx = x[j]! - xi;
        let dy = y[j]! - yi;
        if (wrap) {
          if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
          if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
        }
        if (dx > perc || dx < -perc || dy > perc || dy < -perc) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > perc2 || d2 === 0) continue;
        cnt++;
        sumVx += vx[j]!; sumVy += vy[j]!;
        sumDx += dx; sumDy += dy;
        if (d2 < sep2) { const inv = 1 / (d2 > 1 ? d2 : 1); sepX -= dx * inv; sepY -= dy * inv; }
      }
    }
    neighborTotal += cnt;

    let fx = 0; let fy = 0;
    if (cnt > 0) {
      fx += sepX * p.separation * 900;
      fy += sepY * p.separation * 900;
      fx += (sumVx / cnt - vx[i]!) * p.alignment;
      fy += (sumVy / cnt - vy[i]!) * p.alignment;
      fx += (sumDx / cnt) * p.cohesion * 6;
      fy += (sumDy / cnt) * p.cohesion * 6;
    }

    // flee predators
    for (const pr of state.predators) {
      let dx = xi - pr.x; let dy = yi - pr.y;
      if (wrap) {
        if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
        if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
      }
      const d2 = dx * dx + dy * dy;
      if (d2 < FEAR_RADIUS * FEAR_RADIUS && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const strength = (1 - d / FEAR_RADIUS) * p.maxForce * 3;
        fx += (dx / d) * strength;
        fy += (dy / d) * strength;
      }
    }

    // avoid obstacles
    if (p.obstacles) {
      for (const o of state.obstacles) {
        const dx = xi - o.x; const dy = yi - o.y;
        const rr = o.r + 28;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const strength = (1 - d / rr) * p.maxForce * 3.2;
          fx += (dx / d) * strength;
          fy += (dy / d) * strength;
        }
      }
    }

    // clamp steering to maxForce
    const f2 = fx * fx + fy * fy;
    const mf = p.maxForce;
    if (f2 > mf * mf) { const s = mf / Math.sqrt(f2); fx *= s; fy *= s; }
    ax[i] = fx; ay[i] = fy;
  }

  state.avgNeighbors = n > 0 ? neighborTotal / n : 0;

  // predators chase the nearest boid (brute force is fine: ≤ 5 predators)
  for (const pr of state.predators) {
    let best = -1; let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = x[i]! - pr.x; const dy = y[i]! - pr.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    if (best >= 0) {
      const d = Math.sqrt(bestD) || 1;
      const speed = 150;
      const dvx = ((x[best]! - pr.x) / d) * speed - pr.vx;
      const dvy = ((y[best]! - pr.y) / d) * speed - pr.vy;
      const turn = Math.min(1, 1.6 * dt);
      pr.vx += dvx * turn; pr.vy += dvy * turn;
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (wrap) {
      pr.x = ((pr.x % w) + w) % w; pr.y = ((pr.y % h) + h) % h;
    } else {
      if (pr.x < 0) { pr.x = 0; pr.vx = Math.abs(pr.vx); } else if (pr.x > w) { pr.x = w; pr.vx = -Math.abs(pr.vx); }
      if (pr.y < 0) { pr.y = 0; pr.vy = Math.abs(pr.vy); } else if (pr.y > h) { pr.y = h; pr.vy = -Math.abs(pr.vy); }
    }
  }

  // integrate
  const minSpeed = p.maxSpeed * MIN_SPEED_FRAC;
  for (let i = 0; i < n; i++) {
    let nvx = vx[i]! + ax[i]! * dt;
    let nvy = vy[i]! + ay[i]! * dt;
    const sp2 = nvx * nvx + nvy * nvy;
    if (sp2 > p.maxSpeed * p.maxSpeed) {
      const s = p.maxSpeed / Math.sqrt(sp2); nvx *= s; nvy *= s;
    } else if (sp2 < minSpeed * minSpeed && sp2 > 0.0001) {
      const s = minSpeed / Math.sqrt(sp2); nvx *= s; nvy *= s;
    }
    vx[i] = nvx; vy[i] = nvy;
    let nx = x[i]! + nvx * dt;
    let ny = y[i]! + nvy * dt;
    if (wrap) {
      nx = ((nx % w) + w) % w;
      ny = ((ny % h) + h) % h;
    } else {
      if (nx < 0) { nx = 0; vx[i] = Math.abs(nvx); } else if (nx > w - 0.01) { nx = w - 0.01; vx[i] = -Math.abs(nvx); }
      if (ny < 0) { ny = 0; vy[i] = Math.abs(nvy); } else if (ny > h - 0.01) { ny = h - 0.01; vy[i] = -Math.abs(nvy); }
    }
    x[i] = nx; y[i] = ny;
  }
  return state;
}
