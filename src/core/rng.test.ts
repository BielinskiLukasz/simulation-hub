import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

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
