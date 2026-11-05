// ─── core/batch/batch.ts — seeds × variants × sweeps with CIs and CRN ─────
// Common random numbers: replicate r always uses deriveSeed(base, r), so the
// same r across variants/sweep points is paired. Chunk boundaries depend only
// on the replicate index -> results independent of worker count/order.

import type { BatchSpec } from '../types';
import type { JobDefinition } from '../job';
import { deriveSeed } from '../rng';
import { Welford } from '../stats/moments';
import { histogram, median, quantile, type HistogramBin } from '../stats/quantiles';
import { meanCI, pairedDiff, wilson, type Interval } from '../stats/intervals';

export const BATCH_CHUNK = 20;

export interface BatchChunk<P> {
  cell: number;
  runStart: number;
  runCount: number;
  params: P;
  baseSeed: number;
}

export interface BatchPart {
  cell: number;
  runStart: number;
  values: Float64Array[]; // per run, length = metrics
  series?: Float32Array[][];
}

export interface BatchCell {
  cell: number;
  label: string;
  variantId: string;
  variantLabel: string;
  sweepValue?: number;
  n: number;
  means: number[];
  sds: number[];
  cis: Interval[];
  medians: number[];
  p5: number[];
  p95: number[];
  indicatorCIs?: Interval[];
  conditionalMeans?: number[];
  histograms: HistogramBin[][];
  seriesMean?: Float64Array;
  seriesLo?: Float64Array;
  seriesHi?: Float64Array;
}

export interface BatchPaired {
  variantId: string;
  baselineId: string;
  metricId: string;
  sweepValue?: number;
  diff: Interval;
  significant: boolean;
  n: number;
}

export interface BatchResult {
  cells: BatchCell[];
  paired: BatchPaired[];
  baseSeed: number;
  runs: number;
  chunkCount: number;
}

export interface BatchPlan<P> {
  job: JobDefinition<BatchSpec<P>, BatchChunk<P>, BatchPart, BatchResult>;
  cells: { cell: number; label: string; variantId: string; variantLabel: string; sweepValue?: number }[];
  totalRuns: number;
}

export function planBatch<P>(spec: BatchSpec<P>, params: P, baseSeed: number, runs: number, sweepValues?: number[]): BatchPlan<P> {
  const variants = spec.variants ?? [{ id: 'base', label: 'base', overrides: {} }];
  const sweep = spec.sweep ? (sweepValues ?? spec.sweep.values) : [undefined];
  const cells: BatchPlan<P>['cells'] = [];
  const cellParams: P[] = [];
  for (const variant of variants) {
    for (const sweepValue of sweep) {
      const p = { ...params, ...variant.overrides } as P;
      if (sweepValue !== undefined && spec.sweep) (p as Record<string, unknown>)[String(spec.sweep.key)] = sweepValue;
      cells.push({
        cell: cells.length,
        label: sweepValue === undefined ? variant.label : `${variant.label} @ ${spec.sweep!.label}=${sweepValue}`,
        variantId: variant.id,
        variantLabel: variant.label,
        sweepValue,
      });
      cellParams.push(p);
    }
  }
  const cellCount = cells.length;
  const job: JobDefinition<BatchSpec<P>, BatchChunk<P>, BatchPart, BatchResult> = {
    plan(_spec, seed) {
      const chunks: BatchChunk<P>[] = [];
      for (let cell = 0; cell < cellCount; cell++) {
        for (let runStart = 0; runStart < runs; runStart += BATCH_CHUNK) {
          chunks.push({ cell, runStart, runCount: Math.min(BATCH_CHUNK, runs - runStart), params: cellParams[cell]!, baseSeed: seed });
        }
      }
      return chunks;
    },
    process(chunk) {
      const specRef = currentSpec!;
      const values: Float64Array[] = [];
      const series: Float32Array[][] = [];
      for (let r = chunk.runStart; r < chunk.runStart + chunk.runCount; r++) {
        const out = specRef.runOne(chunk.params, deriveSeed(chunk.baseSeed, r));
        values.push(out.values);
        if (out.series) series.push(out.series);
      }
      return { cell: chunk.cell, runStart: chunk.runStart, values, series: specRef.series ? series : undefined };
    },
    reduce(parts) {
      return reduceBatch(spec, cells, parts, baseSeed, runs);
    },
  };
  // The job interface has no params slot for the spec; bind it for this plan.
  currentSpec = spec as BatchSpec<unknown>;
  return { job: job as unknown as JobDefinition<BatchSpec<P>, BatchChunk<P>, BatchPart, BatchResult>, cells, totalRuns: cellCount * runs };
}

let currentSpec: BatchSpec<unknown> | null = null;

function reduceBatch<P>(
  spec: BatchSpec<P>, cells: BatchPlan<P>['cells'], parts: BatchPart[], baseSeed: number, runs: number,
): BatchResult {
  const byCell = new Map<number, { values: number[][]; series: Float32Array[][] }>();
  for (const cell of cells) byCell.set(cell.cell, { values: [], series: [] });
  for (const part of [...parts].sort((a, b) => a.cell - b.cell || a.runStart - b.runStart)) {
    const bucket = byCell.get(part.cell)!;
    for (const v of part.values) bucket.values.push(Array.from(v));
    if (part.series) for (const s of part.series) bucket.series.push(s);
  }
  const metricCount = spec.metrics.length;
  const out: BatchCell[] = cells.map((cell) => {
    const bucket = byCell.get(cell.cell)!;
    const n = bucket.values.length;
    const perMetric = (i: number) => bucket.values.map((v) => v[i] ?? NaN);
    const stats = Array.from({ length: metricCount }, (_, i) => {
      const vals = perMetric(i);
      const w = new Welford();
      for (const v of vals) w.push(v);
      return { vals, w, ci: meanCI(vals) };
    });
    const indicatorCIs: Interval[] = [];
    spec.metrics.forEach((m, i) => {
      if (m.kind === 'indicator') {
        const k = stats[i]!.vals.filter((v) => v === 1).length;
        indicatorCIs.push(wilson(k, n));
      }
    });
    const condIndex = spec.conditional ? spec.metrics.findIndex((m) => m.id === spec.conditional!.on) : -1;
    const conditionalMeans = condIndex >= 0
      ? Array.from({ length: metricCount }, (_, i) => {
          const vals = stats[i]!.vals.filter((_, r) => bucket.values[r]![condIndex] === 1);
          if (vals.length === 0) return NaN;
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        })
      : undefined;
    let seriesMean: Float64Array | undefined;
    let seriesLo: Float64Array | undefined;
    let seriesHi: Float64Array | undefined;
    if (spec.series && bucket.series.length > 0) {
      const length = spec.series[0]!.n;
      seriesMean = new Float64Array(length);
      seriesLo = new Float64Array(length);
      seriesHi = new Float64Array(length);
      for (let k = 0; k < length; k++) {
        const col: number[] = [];
        for (const s of bucket.series) col.push(s[0]?.[k] ?? NaN);
        const ci = meanCI(col);
        seriesMean[k] = ci.estimate;
        seriesLo[k] = ci.lo;
        seriesHi[k] = ci.hi;
      }
    }
    return {
      ...cell,
      n,
      means: stats.map((s) => s.w.mean),
      sds: stats.map((s) => s.w.sd),
      cis: stats.map((s) => s.ci),
      medians: stats.map((s) => median(s.vals)),
      p5: stats.map((s) => quantile(s.vals, 0.05)),
      p95: stats.map((s) => quantile(s.vals, 0.95)),
      indicatorCIs: indicatorCIs.length ? indicatorCIs : undefined,
      conditionalMeans,
      histograms: stats.map((s) => histogram(s.vals, 16)),
      seriesMean, seriesLo, seriesHi,
    };
  });

  const paired: BatchPaired[] = [];
  const variants = spec.variants ?? [{ id: 'base', label: 'base', overrides: {} }];
  const baseline = variants[0]!;
  for (const variant of variants.slice(1)) {
    for (const sweepValue of spec.sweep ? spec.sweep.values : [undefined]) {
      const a = out.find((c) => c.variantId === baseline.id && c.sweepValue === sweepValue);
      const b = out.find((c) => c.variantId === variant.id && c.sweepValue === sweepValue);
      if (!a || !b) continue;
      spec.metrics.forEach((_m, i) => {
        const ci = pairedDiff(
          byCell.get(a.cell)!.values.map((v) => v[i] ?? NaN),
          byCell.get(b.cell)!.values.map((v) => v[i] ?? NaN),
        );
        paired.push({
          variantId: variant.id, baselineId: baseline.id, metricId: spec.metrics[i]!.id,
          sweepValue, diff: ci,
          significant: Number.isFinite(ci.lo) && Number.isFinite(ci.hi) && (ci.lo > 0 || ci.hi < 0),
          n: byCell.get(a.cell)!.values.length,
        });
      });
    }
  }
  return { cells: out, paired, baseSeed, runs, chunkCount: parts.length };
}

export function formatBatchMarkdown(spec: BatchSpec<unknown>, result: BatchResult): string {
  const lines = [
    `Base seed: ${result.baseSeed} · runs per cell: ${result.runs} · chunks: ${result.chunkCount}`,
    '',
    `| cell | metric | n | mean | 95% CI | median | p5 | p95 |`,
    `|---|---|---|---|---|---|---|---|`,
  ];
  for (const cell of result.cells) {
    spec.metrics.forEach((m, i) => {
      const ci = cell.cis[i]!;
      const fmt = (v: number) => Number.isFinite(v) ? v.toFixed(3) : '—';
      lines.push(`| ${cell.label} | ${m.label} | ${cell.n} | ${fmt(cell.means[i]!)} | [${fmt(ci.lo)}, ${fmt(ci.hi)}] | ${fmt(cell.medians[i]!)} | ${fmt(cell.p5[i]!)} | ${fmt(cell.p95[i]!)} |`);
    });
  }
  return lines.join('\n');
}
