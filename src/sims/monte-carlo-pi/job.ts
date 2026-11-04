// ─── Monte Carlo π · job.ts — deterministic chunked estimation ─────────────
// Points land uniformly in the unit square; P(inside quarter circle) = π/4.
// Fixed 50,000-point chunks with derived seeds; cumulative convergence is
// computed in reduce from index-ordered parts, so delivery order and worker
// count cannot change a single digit.

import type { ParamSchema } from '../../core/types';
import type { JobDefinition } from '../../core/job';
import { createRng, deriveSeed } from '../../core/rng';

export interface Params {
  points: number;
}

export const defaultParams: Params = { points: 500000 };

export const paramSchema: ParamSchema<Params> = {
  points: { kind: 'range', label: 'Total points', min: 10000, max: 5000000, step: 10000, hint: 'Chunked at 50,000 — error shrinks like 1/√N' },
};

export const CHUNK_POINTS = 50000;

export interface Chunk { index: number; points: number; seed: number }
export interface Part { index: number; points: number; inside: number }

export interface PiResult {
  estimate: number;
  absError: number;
  correctDigits: number;
  inside: number;
  totalPoints: number;
  ciLo: number;
  ciHi: number;
  convergence: { points: number[]; est: number[]; lo: number[]; hi: number[] };
}

function estimateAt(inside: number, total: number): { est: number; lo: number; hi: number } {
  if (total === 0) return { est: 0, lo: 0, hi: 0 };
  const p = inside / total;
  const se = 4 * Math.sqrt((p * (1 - p)) / total);
  const est = 4 * p;
  return { est, lo: est - 1.96 * se, hi: est + 1.96 * se };
}

export const piJob: JobDefinition<Params, Chunk, Part, PiResult> = {
  plan(params, seed) {
    const chunks: Chunk[] = [];
    const total = Math.max(0, Math.floor(params.points));
    for (let from = 0, index = 0; from < total; from += CHUNK_POINTS, index++) {
      chunks.push({ index, points: Math.min(CHUNK_POINTS, total - from), seed: deriveSeed(seed, index) });
    }
    return chunks;
  },

  process(chunk) {
    const rng = createRng(chunk.seed);
    let inside = 0;
    for (let i = 0; i < chunk.points; i++) {
      const x = rng.next();
      const y = rng.next();
      if (x * x + y * y <= 1) inside++;
    }
    return { index: chunk.index, points: chunk.points, inside };
  },

  reduce(parts) {
    const ordered = [...parts].sort((a, b) => a.index - b.index);
    let inside = 0;
    let total = 0;
    const conv = { points: [] as number[], est: [] as number[], lo: [] as number[], hi: [] as number[] };
    for (const part of ordered) {
      inside += part.inside;
      total += part.points;
      const e = estimateAt(inside, total);
      conv.points.push(total);
      conv.est.push(e.est);
      conv.lo.push(e.lo);
      conv.hi.push(e.hi);
    }
    const final = estimateAt(inside, total);
    const absError = Math.abs(final.est - Math.PI);
    return {
      estimate: final.est,
      absError,
      correctDigits: absError > 0 ? Math.max(0, Math.floor(-Math.log10(absError))) : 15,
      inside,
      totalPoints: total,
      ciLo: final.lo,
      ciHi: final.hi,
      convergence: conv,
    };
  },
};
