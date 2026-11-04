// ─── core/grid/noise.ts — seeded value noise → weighted terrain ────────────

import type { Rng } from '../types';
import type { Grid } from './grid';

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1], bilinearly interpolated on a seeded lattice. */
export function valueNoise(w: number, h: number, scale: number, rng: Rng): Float32Array {
  const gw = Math.max(2, Math.ceil(w / scale) + 2);
  const gh = Math.max(2, Math.ceil(h / scale) + 2);
  const lattice = new Float32Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const a = lattice[y0 * gw + x0]!;
      const b = lattice[y0 * gw + x0 + 1]!;
      const c = lattice[(y0 + 1) * gw + x0]!;
      const d = lattice[(y0 + 1) * gw + x0 + 1]!;
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

export interface TerrainNoiseOpts {
  scale: number;
  grass: number;
  mud: number;
  water: number;
}

/** Repaint open (0) cells as terrain values 2 (grass), 5 (mud), 10 (water). */
export function applyTerrainNoise(g: Grid, opts: TerrainNoiseOpts, rng: Rng): Grid {
  const n = valueNoise(g.w, g.h, opts.scale, rng);
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i] !== 0) continue;
    const v = n[i]!;
    g.cells[i] = v < opts.grass ? 0 : v < opts.mud ? 2 : v < opts.water ? 5 : 10;
  }
  return g;
}
