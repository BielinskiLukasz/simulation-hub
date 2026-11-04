import { describe, expect, it } from 'vitest';
import { runInline } from '../../core/job';
import { mcJob } from './job';
import { defaultParams, deterministicDepletionMonth, deterministicFinal, type Params } from './model';

const base: Params = { ...defaultParams, runs: 1000 };

describe('monte-carlo model', () => {
  it('closed form, σ = 0: final balance equals the annuity-due formula', () => {
    const p: Params = { ...base, volatility: 0, withdrawYears: 0, accumYears: 25 };
    const r = runInline(mcJob, p, 42);
    const expected = deterministicFinal(p);
    expect(Math.abs(r.medianFinal - expected) / expected).toBeLessThan(1e-5);
    // annuity-due check against the textbook formula FV = P·gⁿ + C·g·(gⁿ−1)/(g−1)
    const g = Math.exp(p.expectedRealReturn / 100 / 12);
    const n = 25 * 12;
    const fv = p.initialBalance * g ** n + p.monthlyContribution * g * ((g ** n - 1) / (g - 1));
    expect(Math.abs(expected - fv) / fv).toBeLessThan(1e-9);
  });

  it('mean matches analytic: σ > 0, accumulation only, within 3 standard errors (20k runs)', () => {
    const p: Params = { ...base, runs: 20000, withdrawYears: 0, accumYears: 20, volatility: 15 };
    const r = runInline(mcJob, p, 7);
    const expected = deterministicFinal(p);
    const se = r.stdFinal / Math.sqrt(r.runsTotal);
    expect(Math.abs(r.meanFinal - expected)).toBeLessThan(3 * se);
  });

  it('depletion timing, σ = 0: depletion year matches the deterministic path', () => {
    const p: Params = {
      ...base, volatility: 0, initialBalance: 100000, monthlyContribution: 0,
      accumYears: 0, withdrawYears: 30, withdrawalStrategy: 'fixed-real', monthlyWithdrawal: 2000,
      expectedRealReturn: 2,
    };
    const month = deterministicDepletionMonth(p);
    expect(month).not.toBeNull();
    const r = runInline(mcJob, p, 1);
    const depYear = Math.ceil(month! / 12);
    const before = r.depletionByYear.find((d) => d.year === depYear - 1);
    const at = r.depletionByYear.find((d) => d.year === depYear);
    expect(before?.prob ?? 0).toBe(0);
    expect(at?.prob).toBe(1);
    expect(r.successProb).toBe(0);
  });

  it('success is monotonic in withdrawals (same seed)', () => {
    const low: Params = { ...base, runs: 3000, monthlyWithdrawal: 1500 };
    const high: Params = { ...low, monthlyWithdrawal: 4500 };
    const a = runInline(mcJob, low, 99);
    const b = runInline(mcJob, high, 99);
    expect(b.successProb).toBeLessThanOrEqual(a.successProb);
  });

  it('edge cases: runs = 1,000 and horizon = 1 year do not crash', () => {
    const p: Params = { ...base, runs: 1000, accumYears: 1, withdrawYears: 0 };
    const r = runInline(mcJob, p, 3);
    expect(r.runsTotal).toBe(1000);
    expect(r.years).toEqual([0, 1]);
    expect(r.histogram.bins.length).toBe(40);
  });
});
