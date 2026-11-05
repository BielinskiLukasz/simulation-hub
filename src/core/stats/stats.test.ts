import { describe, expect, it } from 'vitest';
import { Welford, momentsOf } from './moments';
import { histogram, median, quantile } from './quantiles';
import { bootstrapCI, meanCI, normalQuantile, pairedDiff, tCritical, wilson } from './intervals';
import { createRng } from '../rng';
import { rk4 } from '../ode';

describe('moments', () => {
  it('known dataset: mean 5, sample variance 32/7', () => {
    const w = momentsOf([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(w.mean).toBeCloseTo(5, 12);
    expect(w.n).toBe(8);
    expect(w.variance).toBeCloseTo(32 / 7, 12);
  });
  it('merge equals single pass, including near-1e9 offsets', () => {
    const a = new Welford(); const b = new Welford();
    const all: number[] = [];
    for (let i = 0; i < 500; i++) { const v = 1e9 + (i % 7) * 1e-3; if (i < 200) a.push(v); else b.push(v); all.push(v); }
    const single = momentsOf(all); a.merge(b);
    expect(a.mean).toBeCloseTo(single.mean, 6);
    expect(Math.abs(a.variance - single.variance) / single.variance).toBeLessThan(1e-6);
  });
});

describe('quantiles', () => {
  it('type-7 values, median, empty/single', () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5, 12);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 12);
    expect(quantile([3], 0.9)).toBe(3);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
    const h = histogram([0, 1, 2, 3, 4], 5);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(5);
  });
});

describe('intervals', () => {
  it('normal and t critical values against tables', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959964, 5);
    expect(tCritical(9, 0.95)).toBeCloseTo(2.262, 3);
    expect(tCritical(29, 0.95)).toBeCloseTo(2.045, 3);
    expect(tCritical(1e9, 0.95)).toBeCloseTo(1.96, 3);
  });
  it('Wilson 8/10 and 0/10 match reference values and stay in [0,1]', () => {
    const a = wilson(8, 10);
    expect(a.lo).toBeCloseTo(0.49, 2);
    expect(a.hi).toBeCloseTo(0.943, 2);
    const b = wilson(0, 10);
    expect(b.lo).toBe(0);
    expect(b.hi).toBeCloseTo(0.278, 2);
  });
  it('coverage: 95% t-interval covers truth ~95% of the time (2000 reps, seeded)', () => {
    const rng = createRng(2024);
    let covered = 0;
    for (let r = 0; r < 2000; r++) {
      const vals = new Float64Array(30);
      for (let i = 0; i < 30; i++) vals[i] = 5 + 2 * normalQuantile(rng.next() || 1e-9);
      const ci = meanCI(vals);
      if (ci.lo <= 5 && ci.hi >= 5) covered++;
    }
    expect(covered).toBeGreaterThanOrEqual(1860);
    expect(covered).toBeLessThanOrEqual(1940);
  });
  it('paired differences: identical arrays → exactly 0; bootstrap finite on skewed data', () => {
    const a = [1, 2, 3, 4, 5];
    const d = pairedDiff(a, a);
    expect(d.estimate).toBe(0);
    expect(d.lo).toBe(0);
    expect(d.hi).toBe(0);
    const skewed = [1, 1, 1, 2, 40, 100];
    const ci = bootstrapCI(skewed, median, 200, 0.95, createRng(7));
    expect(Number.isFinite(ci.lo)).toBe(true);
    expect(ci.lo).toBeLessThanOrEqual(ci.hi);
  });
});

describe('ode', () => {
  it('rk4 decay y\'=-y matches exp(-t) to high accuracy', () => {
    const y = new Float64Array([1]);
    for (let i = 0; i < 1000; i++) rk4((_t, v, out) => { out[0] = -v[0]!; }, 0, y, 0.001);
    expect(y[0]!).toBeCloseTo(Math.exp(-1), 8);
  });
});
