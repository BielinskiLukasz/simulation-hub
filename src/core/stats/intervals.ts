// ─── core/stats/intervals.ts — normal/t quantiles, CIs, Wilson, bootstrap ──
// Verified by known-value tests AND coverage simulations (see tests).

import type { Rng } from '../types';
import { Welford } from './moments';
import { sortedFinite } from './quantiles';

/** Acklam's rational approximation; |error| < 1.15e-9 over (0,1). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  return x;
}

/** Two-sided critical values, table-backed (no inverse t implementation). */
const T_TABLE: Record<number, [number, number, number]> = {
  1: [6.314, 12.706, 63.657], 2: [2.92, 4.303, 9.925], 3: [2.353, 3.182, 5.841], 4: [2.132, 2.776, 4.604],
  5: [2.015, 2.571, 4.032], 6: [1.943, 2.447, 3.707], 7: [1.895, 2.365, 3.499], 8: [1.86, 2.306, 3.355],
  9: [1.833, 2.262, 3.25], 10: [1.812, 2.228, 3.169], 11: [1.796, 2.201, 3.106], 12: [1.782, 2.179, 3.055],
  13: [1.771, 2.16, 3.012], 14: [1.761, 2.145, 2.977], 15: [1.753, 2.131, 2.947], 16: [1.746, 2.12, 2.921],
  17: [1.74, 2.11, 2.898], 18: [1.734, 2.101, 2.878], 19: [1.729, 2.093, 2.861], 20: [1.725, 2.086, 2.845],
  21: [1.721, 2.08, 2.831], 22: [1.717, 2.074, 2.819], 23: [1.714, 2.069, 2.807], 24: [1.711, 2.064, 2.797],
  25: [1.708, 2.06, 2.787], 26: [1.706, 2.056, 2.779], 27: [1.703, 2.052, 2.771], 28: [1.701, 2.048, 2.763],
  29: [1.699, 2.045, 2.756], 30: [1.697, 2.042, 2.75], 40: [1.684, 2.021, 2.704], 60: [1.671, 2.0, 2.66],
  120: [1.658, 1.98, 2.617],
};

export function tCritical(df: number, level = 0.95): number {
  const idx = level >= 0.99 ? 2 : level >= 0.95 ? 1 : 0;
  if (!Number.isFinite(df) || df > 120) return [1.645, 1.96, 2.576][idx]!;
  const key = Object.keys(T_TABLE).map(Number).sort((a, b) => a - b).find((k) => k >= Math.max(1, Math.round(df)))!;
  return T_TABLE[key]![idx]!;
}

export interface Interval { lo: number; hi: number; estimate: number }

export function meanCI(values: ArrayLike<number>, level = 0.95): Interval {
  const w = new Welford();
  for (let i = 0; i < values.length; i++) w.push(values[i]!);
  if (w.n === 0) return { lo: NaN, hi: NaN, estimate: NaN };
  if (w.n === 1) return { lo: w.mean, hi: w.mean, estimate: w.mean };
  const crit = tCritical(w.n - 1, level);
  return { lo: w.mean - crit * w.sem, hi: w.mean + crit * w.sem, estimate: w.mean };
}

/** Wilson score interval — correct near 0/1 (do not use Wald for probabilities). */
export function wilson(k: number, n: number, level = 0.95): Interval {
  if (n <= 0) return { lo: NaN, hi: NaN, estimate: NaN };
  const z = normalQuantile(1 - (1 - level) / 2);
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half), estimate: p };
}

export function bootstrapCI(values: ArrayLike<number>, stat: (v: ArrayLike<number>) => number, B: number, level: number, rng: Rng): Interval {
  const arr = sortedFinite(values);
  if (arr.length === 0) return { lo: NaN, hi: NaN, estimate: NaN };
  const stats: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) sample[i] = arr[Math.min(arr.length - 1, Math.floor(rng.next() * arr.length))]!;
    stats.push(stat(sample));
  }
  stats.sort((a, b) => a - b);
  const lo = stats[Math.max(0, Math.floor(((1 - level) / 2) * stats.length))]!;
  const hi = stats[Math.min(stats.length - 1, Math.floor((1 - (1 - level) / 2) * stats.length) - 1)]!;
  return { lo, hi, estimate: stat(arr) };
}

/** Paired difference CI: b is subtracted from a, matched by index. */
export function pairedDiff(a: ArrayLike<number>, b: ArrayLike<number>, level = 0.95): Interval {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { lo: NaN, hi: NaN, estimate: NaN };
  const diffs = new Float64Array(n);
  for (let i = 0; i < n; i++) diffs[i] = a[i]! - b[i]!;
  return meanCI(diffs, level);
}
