import { describe, expect, it } from 'vitest';
import { createNormal, createRng, createStudentT, deriveSeed } from './rng';

describe('deriveSeed', () => {
  it('has no collisions over 10,000 chunk indices', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) seen.add(deriveSeed(4242, i));
    expect(seen.size).toBe(10_000);
  });

  it('gives different streams for different base seeds', () => {
    const a = createRng(deriveSeed(1, 3));
    const b = createRng(deriveSeed(2, 3));
    expect(Array.from({ length: 16 }, () => a.next())).not.toEqual(Array.from({ length: 16 }, () => b.next()));
  });

  it('is stable across calls and stays 32-bit unsigned', () => {
    for (let i = 0; i < 500; i++) {
      const s = deriveSeed(99, i);
      expect(s).toBe(deriveSeed(99, i));
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('mixes adjacent indices apart (no sequential correlation)', () => {
    const diffs = new Set<number>();
    for (let i = 0; i < 1000; i++) diffs.add(deriveSeed(7, i + 1) - deriveSeed(7, i));
    expect(diffs.size).toBeGreaterThan(990);
  });
});

describe('createNormal (Box-Muller)', () => {
  it('has mean ~0 and variance ~1 over 100k samples', () => {
    const rng = createRng(2024);
    const normal = createNormal(rng);
    let sum = 0;
    let sumSq = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const z = normal();
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(variance - 1)).toBeLessThan(0.03);
  });

  it('is reproducible for the same seed', () => {
    const a = createNormal(createRng(5));
    const b = createNormal(createRng(5));
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('never returns non-finite values', () => {
    const normal = createNormal(createRng(8));
    for (let i = 0; i < 50_000; i++) expect(Number.isFinite(normal())).toBe(true);
  });

  it('uses the cached spare, so consecutive pairs are distinct draws', () => {
    const normal = createNormal(createRng(3));
    const draws = new Set<number>();
    for (let i = 0; i < 200; i++) draws.add(normal());
    expect(draws.size).toBeGreaterThan(190);
  });
});

describe('createStudentT', () => {
  it('has heavier tails than the normal for low df', () => {
    const sample = (df: number) => {
      const t = createStudentT(createRng(77), df);
      let big = 0;
      for (let i = 0; i < 20_000; i++) if (Math.abs(t()) > 3) big++;
      return big;
    };
    expect(sample(3)).toBeGreaterThan(sample(1000));
  });

  it('stays finite', () => {
    const t = createStudentT(createRng(4), 5);
    for (let i = 0; i < 5000; i++) expect(Number.isFinite(t())).toBe(true);
  });
});
