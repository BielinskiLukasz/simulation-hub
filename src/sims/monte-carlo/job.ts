// ─── Monte Carlo · job.ts — deterministic chunked map/reduce ────────────────
// Chunk size is a FIXED constant (1,000 runs), never derived from worker
// count. Each chunk's seed is derived from (seed, chunkIndex), and reduce
// receives parts in index order — so results are identical on 1 or 16 workers.

import type { JobDefinition } from '../../core/job';
import { deriveSeed } from '../../core/rng';
import { horizonYears, processChunk, type Chunk, type ChunkPart, type Params } from './model';

export const CHUNK_RUNS = 1000;

export type PercentileKey = 'p5' | 'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'p95';
const KEYS: PercentileKey[] = ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'];
const Q: Record<PercentileKey, number> = { p5: 0.05, p10: 0.1, p25: 0.25, p50: 0.5, p75: 0.75, p90: 0.9, p95: 0.95 };

export interface McResult {
  years: number[];
  percentiles: Record<PercentileKey, Float64Array>;
  successProb: number;
  medianFinal: number;
  p10Final: number;
  p90Final: number;
  meanFinal: number;
  stdFinal: number;
  runsTotal: number;
  histogram: { bins: { start: number; width: number; count: number }[]; clippedAt: number };
  depletionByYear: { year: number; prob: number }[];
}

function percentile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const frac = idx - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

export const mcJob: JobDefinition<Params, Chunk, ChunkPart, McResult> = {
  plan(params, seed) {
    const chunks: Chunk[] = [];
    const total = Math.max(0, Math.floor(params.runs));
    for (let from = 0, index = 0; from < total; from += CHUNK_RUNS, index++) {
      chunks.push({
        index,
        runs: Math.min(CHUNK_RUNS, total - from),
        seed: deriveSeed(seed, index),
        params,
      });
    }
    return chunks;
  },

  process: (chunk) => processChunk(chunk),

  transfer: (part) => [part.balances.buffer as ArrayBuffer],

  reduce(parts, params) {
    const years = horizonYears(params);
    const checkpoints = years + 1;
    const ordered = [...parts].sort((a, b) => a.index - b.index);
    const runsTotal = ordered.reduce((a, p) => a + p.runs, 0);

    // concatenate checkpoint storage in chunk order
    const all = new Float32Array(runsTotal * checkpoints);
    let offsetRuns = 0;
    for (const part of ordered) {
      all.set(part.balances, offsetRuns * checkpoints);
      offsetRuns += part.runs;
    }

    const percentiles = {} as Record<PercentileKey, Float64Array>;
    for (const k of KEYS) percentiles[k] = new Float64Array(checkpoints);
    const column = new Float64Array(runsTotal);

    for (let c = 0; c < checkpoints; c++) {
      for (let r = 0; r < runsTotal; r++) column[r] = all[r * checkpoints + c]!;
      const sorted = Float64Array.from(column).sort();
      for (const k of KEYS) percentiles[k][c] = percentile(sorted, Q[k]);
    }

    const finals = Float64Array.from(column).sort(); // column currently holds the last checkpoint
    const medianFinal = percentile(finals, 0.5);
    let mean = 0;
    for (let r = 0; r < runsTotal; r++) mean += finals[r]!;
    mean = runsTotal > 0 ? mean / runsTotal : 0;
    let varSum = 0;
    for (let r = 0; r < runsTotal; r++) varSum += (finals[r]! - mean) ** 2;
    const stdFinal = runsTotal > 1 ? Math.sqrt(varSum / (runsTotal - 1)) : 0;

    let successes = 0;
    for (let r = 0; r < runsTotal; r++) {
      const f = finals[r]!;
      if (params.withdrawYears > 0 ? f > 0 : f >= params.targetBalance) successes++;
    }

    // histogram of final balances: 40 bins, top clipped at p99 (stated in UI)
    const clippedAt = percentile(finals, 0.99);
    const top = clippedAt > 0 ? clippedAt : 1;
    const width = top / 40;
    const bins = Array.from({ length: 40 }, (_, i) => ({ start: i * width, width, count: 0 }));
    for (let r = 0; r < runsTotal; r++) {
      const idx = Math.min(39, Math.floor(finals[r]! / width));
      bins[idx]!.count++;
    }

    // depletion probability by year (cumulative share at 0, withdrawal phase)
    const depletionByYear: { year: number; prob: number }[] = [];
    if (params.withdrawYears > 0 && runsTotal > 0) {
      for (let y = params.accumYears; y <= years; y++) {
        let zeros = 0;
        for (let r = 0; r < runsTotal; r++) if (all[r * checkpoints + y] === 0) zeros++;
        depletionByYear.push({ year: y, prob: zeros / runsTotal });
      }
    }

    return {
      years: Array.from({ length: checkpoints }, (_, i) => i),
      percentiles,
      successProb: runsTotal > 0 ? successes / runsTotal : 0,
      medianFinal,
      p10Final: percentile(finals, 0.1),
      p90Final: percentile(finals, 0.9),
      meanFinal: mean,
      stdFinal,
      runsTotal,
      histogram: { bins, clippedAt },
      depletionByYear,
    };
  },
};
