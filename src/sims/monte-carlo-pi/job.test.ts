import { describe, expect, it } from 'vitest';
import { runInline } from '../../core/job';
import { CHUNK_POINTS, piJob, type Params } from './job';

describe('monte-carlo-pi job', () => {
  it('determinism: same seed → identical estimate; different seed → different estimate', () => {
    const p: Params = { points: 100000 };
    expect(runInline(piJob, p, 42).estimate).toBe(runInline(piJob, p, 42).estimate);
    expect(runInline(piJob, p, 43).estimate).not.toBe(runInline(piJob, p, 42).estimate);
  });

  it('accuracy: 1,000,000 seeded points land within 0.01 of π', () => {
    const r = runInline(piJob, { points: 1000000 }, 42);
    expect(Math.abs(r.estimate - Math.PI)).toBeLessThan(0.01);
    expect(r.ciLo).toBeLessThan(Math.PI);
    expect(r.ciHi).toBeGreaterThan(Math.PI);
  });

  it('exact chunking: 120,000 points → 50k + 50k + 20k', () => {
    const chunks = piJob.plan({ points: 120000 }, 1);
    expect(chunks.map((c) => c.points)).toEqual([50000, 50000, 20000]);
    expect(chunks.length).toBe(Math.ceil(120000 / CHUNK_POINTS));
    expect(runInline(piJob, { points: 120000 }, 1).totalPoints).toBe(120000);
  });

  it('worker-order independence: reversed part delivery → identical result', () => {
    const p: Params = { points: 200000 };
    const chunks = piJob.plan(p, 7);
    const reversed = [...chunks].reverse().map((c) => piJob.process(c));
    const viaReverse = piJob.reduce(reversed, p);
    const inline = runInline(piJob, p, 7);
    expect(viaReverse.estimate).toBe(inline.estimate);
    expect(viaReverse.inside).toBe(inline.inside);
  });

  it('the 95% band narrows as points accumulate (1/√N)', () => {
    const r = runInline(piJob, { points: 500000 }, 3);
    const widths = r.convergence.points.map((_, i) => r.convergence.hi[i]! - r.convergence.lo[i]!);
    expect(widths[widths.length - 1]!).toBeLessThan(widths[0]! / 2);
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeLessThanOrEqual(widths[i - 1]! + 1e-12);
  });
});
