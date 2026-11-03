// ─── Bouncing Balls · logic.ts ──────────────────────────────────────────────
// PURE: no DOM, no Math.random(), no Date.now(). Enforced by ESLint
// (no-restricted-globals / no-restricted-properties on logic files).
// step() MUTATES and returns the same state object — allocation-free at
// 500 balls × 60 Hz. Tests therefore snapshot via structuredClone.

import type { ParamSchema, Rng } from '../../core/types';

export interface Params {
  count: number;
  gravity: number;
  restitution: number;
  radius: number;
  maxSpeed: number;
  collisions: boolean;
  palette: string;
  color: string;
}

export const defaultParams: Params = {
  count: 40,
  gravity: 900,
  restitution: 0.85,
  radius: 10,
  maxSpeed: 300,
  collisions: false,
  palette: 'rainbow',
  color: '#4f9dff',
};

export const paramSchema: ParamSchema<Params> = {
  count: { kind: 'range', label: 'Ball count', min: 1, max: 500, step: 1, hint: 'Re-inits the world' },
  gravity: { kind: 'range', label: 'Gravity', min: 0, max: 2000, step: 10, unit: 'px/s²' },
  restitution: { kind: 'range', label: 'Restitution (bounciness)', min: 0, max: 1, step: 0.01, hint: '1 = perfectly elastic' },
  radius: { kind: 'range', label: 'Ball radius', min: 3, max: 30, step: 1, unit: 'px' },
  maxSpeed: { kind: 'number', label: 'Max initial speed', min: 0, max: 1000, step: 10, unit: 'px/s' },
  collisions: { kind: 'boolean', label: 'Ball–ball collisions', hint: 'Naive O(n²) elastic — fine at n ≤ 500' },
  palette: { kind: 'select', label: 'Colour palette', options: ['mono', 'rainbow', 'speed'] },
  color: { kind: 'color', label: 'Mono colour', hint: 'Used when palette = mono' },
};

export const WORLD = { w: 800, h: 600 } as const;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number; // assigned at init from the seeded Rng; rainbow palette reads it
}

export interface State {
  balls: Ball[];
  w: number;
  h: number;
  rng: Rng; // lives in state so step() needs no rng argument (Contract v1)
  params: Params;
}

export function init(params: Params, rng: Rng): State {
  const r = params.radius;
  const balls: Ball[] = [];
  for (let i = 0; i < params.count; i++) {
    balls.push({
      x: rng.range(r, WORLD.w - r),
      y: rng.range(r, WORLD.h - r),
      vx: rng.range(-params.maxSpeed, params.maxSpeed),
      vy: rng.range(-params.maxSpeed, params.maxSpeed),
      hue: rng.range(0, 360),
    });
  }
  return { balls, w: WORLD.w, h: WORLD.h, rng, params: { ...params } };
}

export function step(state: State, dt: number): State {
  const { gravity: g, restitution: e, radius: r, collisions } = state.params;
  const { balls, w, h } = state;

  for (const b of balls) {
    b.vy += g * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * e; }
    else if (b.x > w - r) { b.x = w - r; b.vx = -Math.abs(b.vx) * e; }
    if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * e; }
    else if (b.y > h - r) { b.y = h - r; b.vy = -Math.abs(b.vy) * e; }
  }

  if (collisions) {
    // Equal-mass elastic collisions, naive O(n²). Positional correction
    // first (split the overlap), then exchange normal velocity components.
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]!;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = r * 2;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 >= minDist * minDist) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (minDist - d) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          const impulse = -(1 + e) * rvn / 2;
          a.vx -= impulse * nx; a.vy -= impulse * ny;
          b.vx += impulse * nx; b.vy += impulse * ny;
        }
        // keep the pair inside the world after correction
        a.x = Math.min(Math.max(a.x, r), w - r); a.y = Math.min(Math.max(a.y, r), h - r);
        b.x = Math.min(Math.max(b.x, r), w - r); b.y = Math.min(Math.max(b.y, r), h - r);
      }
    }
  }
  return state;
}

/** Total kinetic energy (unit mass per ball) — the invariant the tests watch. */
export function kineticEnergy(state: State): number {
  let ke = 0;
  for (const b of state.balls) ke += 0.5 * (b.vx * b.vx + b.vy * b.vy);
  return ke;
}
