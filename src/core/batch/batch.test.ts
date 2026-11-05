import { describe, expect, it } from 'vitest';
import { planBatch, type BatchChunk, type BatchPart, type BatchResult } from './batch';
import { WorkerPool, InlineTransport, type Transport } from '../../runtime/worker-pool';
import { runInline } from '../job';
import type { BatchSpec } from '../types';
import { deriveSeed, createRng } from '../rng';

interface P { mean: number; scale: number }

const spec: BatchSpec<P> = {
  metrics: [
    { id: 'x', label: 'x', kind: 'scalar' },
    { id: 'hit', label: 'hit', kind: 'indicator' },
  ],
  runOne(params, seed) {
    const rng = createRng(seed);
    const x = params.mean + params.scale * (rng.next() - 0.5);
    return { values: Float64Array.from([x, x > params.mean ? 1 : 0]) };
  },
  variants: [
    { id: 'a', label: 'A', overrides: {} },
    { id: 'b', label: 'B', overrides: { mean: 10 } },
  ],
  sweep: { key: 'mean', label: 'mean', values: [0, 5] },
  defaults: { runs: 100, maxRuns: 400 },
};

function reduction(specToPlan: BatchSpec<P>, runs: number, seed: string): Promise<BatchResult> {
  const plan = planBatch(specToPlan, { mean: 0, scale: 1 }, 42, runs);
  void seed;
  return Promise.resolve(runInline(plan.job, specToPlan, 42));
}

describe('batch planning and reduction', () => {
  it('worker-count and delivery-order independence (1 vs 7 fake workers)', async () => {
    const plan = planBatch(spec, { mean: 0, scale: 1 }, 7, 95);
    const inline = runInline(plan.job, spec, 7);
    const shuffled = [...plan.job.plan(spec, 7)].reverse();
    const reduced = plan.job.reduce(shuffled.map((c: BatchChunk<P>) => plan.job.process(c)), spec);
    expect(reduced.cells.map((c) => c.means)).toEqual(inline.cells.map((c) => c.means));
    expect(reduced.paired.length).toBe(inline.paired.length);
    const pool = new WorkerPool(() => new InlineTransport() as Transport, 7);
    const viaPool = await pool.run(plan.job, spec, 7);
    expect(viaPool.cells.map((c) => c.means.map((v: number) => v.toFixed(9)))).toEqual(inline.cells.map((c) => c.means.map((v) => v.toFixed(9))));
    pool.dispose();
  });

  it('chunk boundaries: runs=95 → exactly 95 replicates per cell and 5 chunks per cell', async () => {
    const plan = planBatch(spec, { mean: 0, scale: 1 }, 3, 95);
    const result = await reduction(spec, 95, '');
    expect(result.cells.every((c) => c.n === 95)).toBe(true);
    expect(result.cells.length).toBe(4);
    const perCell = plan.job.plan(spec, 3).filter((c: BatchChunk<P>) => c.cell === 0);
    expect(perCell.map((c) => c.runCount)).toEqual([20, 20, 20, 20, 15]);
  });

  it('CRN: identical variants have exactly zero paired differences; seeds ignore variant/sweep', async () => {
    const identical: BatchSpec<P> = {
      ...spec,
      variants: [
        { id: 'a', label: 'A', overrides: {} },
        { id: 'a2', label: 'A2', overrides: {} },
      ],
      sweep: undefined,
      runOne(_params, seed) { const v = createRng(seed).next(); return { values: Float64Array.from([v, v > 0.5 ? 1 : 0]) }; },
    };
    const result = await reduction(identical, 50, '');
    for (const p of result.paired) {
      expect(p.diff.estimate).toBe(0);
      expect(p.diff.lo).toBe(0);
      expect(p.diff.hi).toBe(0);
      expect(p.significant).toBe(false);
    }
    const seen: number[] = [];
    const spy: BatchSpec<P> = { ...identical, metrics: [identical.metrics[0]!], runOne(_p, seed) { seen.push(seed); return { values: Float64Array.from([0]) }; }, variants: [{ id: 'a', label: 'A', overrides: {} }], sweep: undefined };
    const plan = planBatch(spy, { mean: 0, scale: 1 }, 99, 40);
    plan.job.plan(spy, 99).forEach((c: BatchChunk<P>) => plan.job.process(c));
    expect(new Set(seen).size).toBe(40);
    expect(seen.every((s, i) => s === deriveSeed(99, i % 40))).toBe(true);
  });

  it('indicator edge cases, zero variance, single-value sweep and CI coverage', async () => {
    const edges: BatchSpec<P> = {
      metrics: [
        { id: 'always', label: 'always', kind: 'indicator' },
        { id: 'never', label: 'never', kind: 'indicator' },
        { id: 'const', label: 'const', kind: 'scalar' },
      ],
      runOne: () => ({ values: Float64Array.from([1, 0, 5]) }),
      variants: [{ id: 'a', label: 'A', overrides: {} }],
      sweep: { key: 'mean', label: 'mean', values: [3] },
      defaults: { runs: 30, maxRuns: 100 },
    };
    const r = await reduction(edges, 30, '');
    expect(r.cells.length).toBe(1);
    expect(r.cells[0]!.indicatorCIs![0]!.lo).toBeCloseTo(0.886, 2);
    expect(r.cells[0]!.indicatorCIs![1]!.hi).toBeCloseTo(0.114, 2);
    expect(r.cells[0]!.cis[2]!.lo).toBe(5);
    expect(r.cells[0]!.cis[2]!.hi).toBe(5);

    const normalToy: BatchSpec<P> = {
      metrics: [{ id: 'x', label: 'x', kind: 'scalar' }],
      runOne: (_p, seed) => {
        const rng = createRng(seed);
        return { values: Float64Array.from([-2 * Math.log(1 - rng.next())]) };
      },
      defaults: { runs: 100, maxRuns: 300 },
    };
    let covered = 0;
    for (let s = 0; s < 40; s++) {
      const res = await reduction(normalToy, 100, '');
      void res;
      const plan = planBatch(normalToy, { mean: 0, scale: 1 }, s, 100);
      const single = plan.job.reduce(plan.job.plan(normalToy, s).map((c: BatchChunk<P>) => plan.job.process(c)), normalToy);
      const ci = single.cells[0]!.cis[0]!;
      if (ci.lo <= 2 && ci.hi >= 2) covered++;
    }
    expect(covered).toBeGreaterThanOrEqual(30);
  });

  it('cancel drops partial work; pool rejects with AbortError', async () => {
    const plan = planBatch(spec, { mean: 0, scale: 1 }, 1, 400);
    const pool = new WorkerPool(() => new InlineTransport() as Transport, 2);
    const ac = new AbortController();
    const promise = pool.run(plan.job, spec, 1, { signal: ac.signal });
    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    const ok = await pool.run(plan.job, spec, 1);
    expect(ok.cells.every((c: { n: number }) => c.n === 400)).toBe(true);
    pool.dispose();
  });
});

void (null as unknown as BatchPart);
