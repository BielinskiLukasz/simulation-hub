import { describe, expect, it } from 'vitest';
import { createNormal, createRng, deriveSeed } from './rng';

describe('deriveSeed', () => {
  it('no collisions over indices 0..9999 for a fixed seed', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) seen.add(deriveSeed(42, i));
    expect(seen.size).toBe(10000);
  });
  it('different base seeds give different streams', () => {
    expect(deriveSeed(1, 0)).not.toBe(deriveSeed(2, 0));
    expect(deriveSeed(1, 5)).not.toBe(deriveSeed(2, 5));
  });
});

describe('createNormal (Box–Muller)', () => {
  it('mean ≈ 0 and variance ≈ 1 over 100k samples; same seed → same sequence', () => {
    const n = 100000;
    const a = createNormal(createRng(99));
    const b = createNormal(createRng(99));
    let sum = 0; let sum2 = 0;
    for (let i = 0; i < n; i++) {
      const v = a();
      if (i < 100) expect(v).toBe(b());
      sum += v; sum2 += v * v;
    }
    const mean = sum / n;
    const variance = sum2 / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(variance - 1)).toBeLessThan(0.03);
  });
});

describe('createRng (mulberry32)', () => {
  it('same seed → identical sequence of 1000 values', () => {
    const a = createRng(42); const b = createRng(42);
    const sa = Array.from({ length: 1000 }, () => a.next());
    const sb = Array.from({ length: 1000 }, () => b.next());
    expect(sa).toEqual(sb);
  });
  it('different seeds → different sequences', () => {
    const a = createRng(1); const b = createRng(2);
    const sa = Array.from({ length: 16 }, () => a.next());
    const sb = Array.from({ length: 16 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });
  it('next() always in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('int(1,6) hits all six faces, never out of range (10k samples)', () => {
    const r = createRng(123); const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) { const v = r.int(1, 6); expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(6); seen.add(v); }
    expect(seen.size).toBe(6);
  });
});
