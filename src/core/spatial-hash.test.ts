import { describe, expect, it } from 'vitest';
import { SpatialHash } from './spatial-hash';
import { createRng } from './rng';

const W = 800; const H = 600;

function bruteForce(x: Float32Array, y: Float32Array, n: number, px: number, py: number, radius: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < n; i++) {
    let dx = Math.abs(x[i]! - px); if (dx > W / 2) dx = W - dx; // toroidal (minimum image)
    let dy = Math.abs(y[i]! - py); if (dy > H / 2) dy = H - dy;
    if (dx * dx + dy * dy <= radius * radius) out.add(i);
  }
  return out;
}

describe('SpatialHash', () => {
  it('property: query + distance filter == brute force, 200 seeds', () => {
    const cellSize = 40;
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed * 7919 + 1);
      const n = 120;
      const x = new Float32Array(n); const y = new Float32Array(n);
      for (let i = 0; i < n; i++) { x[i] = rng.range(0, W); y[i] = rng.range(0, H); }
      const hash = new SpatialHash(W, H, cellSize, n);
      hash.rebuild(x, y, n);
      const px = rng.range(0, W); const py = rng.range(0, H);
      const radius = cellSize; // ≤ cellSize, per the contract
      const out = new Int32Array(n);
      const count = hash.query(px, py, out);
      const found = new Set<number>();
      for (let k = 0; k < count; k++) {
        const i = out[k]!;
        let dx = Math.abs(x[i]! - px); if (dx > W / 2) dx = W - dx;
        let dy = Math.abs(y[i]! - py); if (dy > H / 2) dy = H - dy;
        if (dx * dx + dy * dy <= radius * radius) found.add(i);
      }
      expect(found).toEqual(bruteForce(x, y, n, px, py, radius));
    }
  });

  it('does not lose points on edges / cell boundaries; rebuild is stable', () => {
    const n = 5;
    const x = new Float32Array([0, 799.9, 40, 80, 400]);
    const y = new Float32Array([0, 599.9, 40, 0, 300]);
    const hash = new SpatialHash(W, H, 40, n);
    const out = new Int32Array(n);
    hash.rebuild(x, y, n);
    const first = Array.from(out.subarray(0, hash.query(0, 0, out))).sort();
    hash.rebuild(x, y, n);
    const second = Array.from(out.subarray(0, hash.query(0, 0, out))).sort();
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it('handles n === capacity without out-of-range writes', () => {
    const cap = 64;
    const x = new Float32Array(cap); const y = new Float32Array(cap);
    const rng = createRng(3);
    for (let i = 0; i < cap; i++) { x[i] = rng.range(0, W); y[i] = rng.range(0, H); }
    const hash = new SpatialHash(W, H, 25, cap);
    expect(() => hash.rebuild(x, y, cap)).not.toThrow();
    const out = new Int32Array(cap);
    expect(hash.query(400, 300, out)).toBeLessThanOrEqual(cap);
  });

  it('clamps grid to at least 3×3 even for huge cells', () => {
    const hash = new SpatialHash(W, H, 10000, 4);
    expect(hash.cols).toBeGreaterThanOrEqual(3);
    expect(hash.rows).toBeGreaterThanOrEqual(3);
  });
});
