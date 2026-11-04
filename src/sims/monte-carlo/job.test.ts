import { describe, expect, it } from 'vitest';
import { runInline } from '../../core/job';
import { CHUNK_RUNS, mcJob, type McResult } from './job';
import { defaultParams, type Params } from './model';

const base: Params = { ...defaultParams, runs: 3000, accumYears: 10, withdrawYears: 10 };

function sameResult(a: McResult, b: McResult): boolean {
  return (
    a.successProb === b.successProb &&
    a.medianFinal === b.medianFinal &&
    a.meanFinal === b.meanFinal &&
    Array.from(a.percentiles.p50).join(',') === Array.from(b.percentiles.p50).join(',')
  );
}

describe('monte-carlo job', () => {
  it('determinism: same params + seed → identical McResult', () => {
    expect(sameResult(runInline(mcJob, base, 42), runInline(mcJob, base, 42))).toBe(true);
  });

  it('worker-count independence: chunks processed in reverse order → identical result', () => {
    const chunks = mcJob.plan(base, 42);
    const partsReversed = [...chunks].reverse().map((c) => mcJob.process(c));
    const viaReverse = mcJob.reduce(partsReversed, base);
    expect(sameResult(viaReverse, runInline(mcJob, base, 42))).toBe(true);
  });

  it('different seed → different result', () => {
    expect(sameResult(runInline(mcJob, base, 1), runInline(mcJob, base, 2))).toBe(false);
  });

  it('percentile ordering at every checkpoint: p5 ≤ … ≤ p95', () => {
    const r = runInline(mcJob, base, 5);
    for (let c = 0; c < r.years.length; c++) {
      const seq = [r.percentiles.p5[c]!, r.percentiles.p10[c]!, r.percentiles.p25[c]!, r.percentiles.p50[c]!, r.percentiles.p75[c]!, r.percentiles.p90[c]!, r.percentiles.p95[c]!];
      expect(seq).toEqual([...seq].sort((a, b) => a - b));
    }
  });

  it('non-negative balances everywhere', () => {
    const r = runInline(mcJob, { ...base, monthlyWithdrawal: 9000 }, 5);
    for (const k of ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'] as const) {
      for (const v of r.percentiles[k]) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('exact run count: runs = 2,500 → chunks 1000 + 1000 + 500', () => {
    const chunks = mcJob.plan({ ...base, runs: 2500 }, 1);
    expect(chunks.map((c) => c.runs)).toEqual([1000, 1000, 500]);
    expect(chunks.length).toBe(Math.ceil(2500 / CHUNK_RUNS));
    expect(runInline(mcJob, { ...base, runs: 2500 }, 1).runsTotal).toBe(2500);
  });
});
