// ─── core/physics/gravity.ts — direct + Barnes–Hut gravity ─────────────────

import { QuadTree } from './quadtree';

/** Accelerations for all n targets from massive sources (srcIdx). */
export function directAccel(
  x: Float64Array, mass: Float64Array, srcIdx: Int32Array, nSrc: number, n: number,
  G: number, eps2: number, a: Float64Array,
): void {
  a.fill(0);
  for (let t = 0; t < n; t++) {
    const tx = x[t * 2]!;
    const ty = x[t * 2 + 1]!;
    let ax = 0;
    let ay = 0;
    for (let s = 0; s < nSrc; s++) {
      const si = srcIdx[s]!;
      if (si === t) continue;
      const dx = x[si * 2]! - tx;
      const dy = x[si * 2 + 1]! - ty;
      const d2 = dx * dx + dy * dy + eps2;
      const inv = 1 / Math.sqrt(d2);
      const sc = G * mass[si]! * inv * inv * inv;
      ax += dx * sc;
      ay += dy * sc;
    }
    a[t * 2] = ax;
    a[t * 2 + 1] = ay;
  }
}

export function treeAccel(
  tree: QuadTree,
  x: Float64Array, mass: Float64Array, srcIdx: Int32Array, nSrc: number, n: number,
  G: number, eps2: number, theta: number, a: Float64Array,
): void {
  tree.buildInterleaved(x, mass, srcIdx, nSrc);
  const out = new Float64Array(2);
  for (let t = 0; t < n; t++) {
    tree.accel(x[t * 2]!, x[t * 2 + 1]!, t, theta, eps2, G, out);
    a[t * 2] = out[0]!;
    a[t * 2 + 1] = out[1]!;
  }
}

/** Exact softened potential energy over massive-source pairs. */
export function potentialEnergy(
  x: Float64Array, mass: Float64Array, srcIdx: Int32Array, nSrc: number, G: number, eps2: number,
): number {
  let u = 0;
  for (let i = 0; i < nSrc; i++) {
    const a = srcIdx[i]!;
    for (let j = i + 1; j < nSrc; j++) {
      const b = srcIdx[j]!;
      const dx = x[b * 2]! - x[a * 2]!;
      const dy = x[b * 2 + 1]! - x[a * 2 + 1]!;
      u -= G * mass[a]! * mass[b]! / Math.sqrt(dx * dx + dy * dy + eps2);
    }
  }
  return u;
}

export function kineticEnergy(x: Float64Array, v: Float64Array, mass: Float64Array, n: number): number {
  void x;
  let ke = 0;
  for (let i = 0; i < n; i++) {
    const vx = v[i * 2]!;
    const vy = v[i * 2 + 1]!;
    ke += 0.5 * mass[i]! * (vx * vx + vy * vy);
  }
  return ke;
}

export function momentum(v: Float64Array, mass: Float64Array, n: number): { x: number; y: number } {
  let px = 0, py = 0;
  for (let i = 0; i < n; i++) { px += mass[i]! * v[i * 2]!; py += mass[i]! * v[i * 2 + 1]!; }
  return { x: px, y: py };
}

export function angularMomentum(x: Float64Array, v: Float64Array, mass: Float64Array, n: number): number {
  let l = 0;
  for (let i = 0; i < n; i++) l += mass[i]! * (x[i * 2]! * v[i * 2 + 1]! - x[i * 2 + 1]! * v[i * 2]!);
  return l;
}
