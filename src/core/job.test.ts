import { describe, expect, it } from 'vitest';
import { chunkCount, chunkRanges, runInline } from './job';
import { deriveSeed } from './rng';
import type { JobDefinition } from './types';

interface Params {
  total: number;
}
interface Chunk {
  index: number;
  start: number;
  count: number;
  seed: number;
}
interface Part {
  index: number;
  sum: number;
}

/** Sum of squares over chunk ranges — the plan's toy job. */
const sumOfSquares: JobDefinition<Params, Chunk, Part, { sum: number; order: number[] }> = {
  plan: (params) =>
    chunkRanges(params.total, 100).map((r, index) => ({
      index,
      start: r.start,
      count: r.count,
      seed: deriveSeed(1234, index),
    })),
  process: (chunk) => {
    let sum = 0;
    for (let i = 0; i < chunk.count; i++) {
      const v = chunk.start + i;
      sum += v * v;
    }
    return { index: chunk.index, sum };
  },
  reduce: (parts) => ({ sum: parts.reduce((acc, p) => acc + p.sum, 0), order: parts.map((p) => p.index) }),
};

describe('chunkRanges / chunkCount', () => {
  it('splits exactly, last chunk takes the remainder', () => {
    expect(chunkRanges(2500, 1000)).toEqual([
      { start: 0, count: 1000 },
      { start: 1000, count: 1000 },
      { start: 2000, count: 500 },
    ]);
    expect(chunkCount(2500, 1000)).toBe(3);
  });

  it('handles exact multiples, zero and tiny sizes', () => {
    expect(chunkRanges(2000, 1000)).toHaveLength(2);
    expect(chunkRanges(0, 1000)).toEqual([]);
    expect(chunkRanges(10, 0)).toHaveLength(10); // size is clamped to >= 1
  });
});

describe('runInline', () => {
  it('computes the same sum as a direct loop', () => {
    const result = runInline(sumOfSquares, { total: 2500 }, 1234);
    let direct = 0;
    for (let i = 0; i < 2500; i++) direct += i * i;
    expect(result.sum).toBe(direct);
  });

  it('reduces parts in chunk order', () => {
    expect(runInline(sumOfSquares, { total: 3500 }, 1234).order).toEqual(Array.from({ length: 35 }, (_, i) => i));
  });

  it('is deterministic for a given seed', () => {
    const a = runInline(sumOfSquares, { total: 1000 }, 7);
    const b = runInline(sumOfSquares, { total: 1000 }, 7);
    expect(a).toEqual(b);
  });

  it('reduces an empty job without throwing', () => {
    const r = runInline(sumOfSquares, { total: 0 }, 1);
    expect(r.sum).toBe(0);
    expect(r.order).toEqual([]);
  });
});
