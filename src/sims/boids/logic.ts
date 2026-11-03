import type { ParamSchema, Rng } from '../../core/types';

export interface Params {
  count: number;
  separation: number;
  alignment: number;
  cohesion: number;
  perception: number;
  maxSpeed: number;
  wrap: boolean;
  palette: 'mono' | 'velocity' | 'heading';
  color: string;
}

export const PALETTES = ['mono', 'velocity', 'heading'] as const;

export const defaultParams: Params = {
  count: 180,
  separation: 1.5,
  alignment: 1.0,
  cohesion: 0.9,
  perception: 58,
  maxSpeed: 150,
  wrap: true,
  palette: 'heading',
  color: '#4dd6b4',
};

export const paramSchema: ParamSchema<Params> = {
  count: { kind: 'range', label: 'Boids', min: 10, max: 400, step: 5 },
  separation: { kind: 'range', label: 'Separation', min: 0, max: 3, step: 0.05 },
  alignment: { kind: 'range', label: 'Alignment', min: 0, max: 3, step: 0.05 },
  cohesion: { kind: 'range', label: 'Cohesion', min: 0, max: 3, step: 0.05 },
  perception: { kind: 'range', label: 'Perception radius', min: 10, max: 160, step: 2, unit: 'px' },
  maxSpeed: { kind: 'range', label: 'Max speed', min: 40, max: 300, step: 5, unit: 'px/s' },
  wrap: { kind: 'boolean', label: 'Toroidal world' },
  palette: { kind: 'select', label: 'Palette', options: PALETTES },
  color: { kind: 'color', label: 'Ink (mono palette)' },
};

export const WORLD = { w: 800, h: 600 };

export interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  neighbours: number;
}

export interface State {
  boids: Boid[];
  w: number;
  h: number;
  t: number;
  params: Params;
  rng: Rng;
}

const MAX_FORCE = 1600;

export function init(params: Params, rng: Rng): State {
  const count = Math.max(1, Math.round(params.count));
  const boids: Boid[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const speed = rng.range(params.maxSpeed * 0.5, params.maxSpeed);
    boids.push({
      x: rng.range(0, WORLD.w),
      y: rng.range(0, WORLD.h),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ax: 0,
      ay: 0,
      neighbours: 0,
    });
  }
  return { boids, w: WORLD.w, h: WORLD.h, t: 0, params, rng };
}

export function step(state: State, dt: number): State {
  const { boids, params } = state;
  const maxSpeed = Math.max(1, params.maxSpeed);
  const minSpeed = maxSpeed * 0.4;
  const perc2 = params.perception * params.perception;
  const sepR = params.perception * 0.5;
  const sepR2 = sepR * sepR;
  const wrap = params.wrap;
  const halfW = state.w / 2;
  const halfH = state.h / 2;

  // ---- phase 1: accelerations from a single shared snapshot ----
  for (const a of boids) {
    let sepX = 0;
    let sepY = 0;
    let aliX = 0;
    let aliY = 0;
    let cohX = 0;
    let cohY = 0;
    let n = 0;
    let nSep = 0;

    for (const o of boids) {
      if (o === a) continue;
      let dx = o.x - a.x;
      let dy = o.y - a.y;
      if (wrap) {
        if (dx > halfW) dx -= state.w;
        else if (dx < -halfW) dx += state.w;
        if (dy > halfH) dy -= state.h;
        else if (dy < -halfH) dy += state.h;
      }
      const d2 = dx * dx + dy * dy;
      if (d2 > perc2) continue;

      n++;
      aliX += o.vx;
      aliY += o.vy;
      cohX += dx;
      cohY += dy;

      if (d2 < sepR2 && d2 > 1e-6) {
        const inv = 1 / d2;
        sepX -= dx * inv;
        sepY -= dy * inv;
        nSep++;
      }
    }

    a.neighbours = n;
    let fx = 0;
    let fy = 0;

    if (n > 0) {
      const aliMag = Math.hypot(aliX, aliY);
      if (aliMag > 1e-6) {
        fx += ((aliX / aliMag) * maxSpeed - a.vx) * params.alignment;
        fy += ((aliY / aliMag) * maxSpeed - a.vy) * params.alignment;
      }
      const cohMag = Math.hypot(cohX, cohY);
      if (cohMag > 1e-6) {
        fx += ((cohX / cohMag) * maxSpeed - a.vx) * params.cohesion;
        fy += ((cohY / cohMag) * maxSpeed - a.vy) * params.cohesion;
      }
    }

    if (nSep > 0) {
      const sepMag = Math.hypot(sepX, sepY);
      if (sepMag > 1e-9) {
        fx += ((sepX / sepMag) * maxSpeed - a.vx) * params.separation;
        fy += ((sepY / sepMag) * maxSpeed - a.vy) * params.separation;
      }
    }

    const fMag = Math.hypot(fx, fy);
    if (fMag > MAX_FORCE) {
      const k = MAX_FORCE / fMag;
      fx *= k;
      fy *= k;
    }
    a.ax = fx;
    a.ay = fy;
  }

  // ---- phase 2: integrate ----
  for (const a of boids) {
    a.vx += a.ax * dt;
    a.vy += a.ay * dt;

    const speed = Math.hypot(a.vx, a.vy);
    if (speed > maxSpeed) {
      const k = maxSpeed / speed;
      a.vx *= k;
      a.vy *= k;
    } else if (speed > 1e-6 && speed < minSpeed) {
      const k = minSpeed / speed;
      a.vx *= k;
      a.vy *= k;
    }

    a.x += a.vx * dt;
    a.y += a.vy * dt;

    if (wrap) {
      if (a.x < 0) a.x += state.w;
      else if (a.x >= state.w) a.x -= state.w;
      if (a.y < 0) a.y += state.h;
      else if (a.y >= state.h) a.y -= state.h;
    } else {
      if (a.x < 0) { a.x = 0; a.vx = Math.abs(a.vx); }
      else if (a.x > state.w) { a.x = state.w; a.vx = -Math.abs(a.vx); }
      if (a.y < 0) { a.y = 0; a.vy = Math.abs(a.vy); }
      else if (a.y > state.h) { a.y = state.h; a.vy = -Math.abs(a.vy); }
    }
  }

  state.t += dt;
  return state;
}

export function meanNeighbours(state: State): number {
  if (state.boids.length === 0) return 0;
  let sum = 0;
  for (const b of state.boids) sum += b.neighbours;
  return sum / state.boids.length;
}

export function snapshot(state: State): Boid[] {
  return state.boids.map((b) => ({ ...b }));
}
