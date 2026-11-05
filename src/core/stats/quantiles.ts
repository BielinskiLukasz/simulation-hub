// ─── core/stats/quantiles.ts — type-7 quantiles, ECDF, histogram ───────────

export function quantile(values: ArrayLike<number>, p: number): number {
  const arr = sortedFinite(values);
  if (arr.length === 0) return NaN;
  if (arr.length === 1) return arr[0]!;
  const q = Math.min(1, Math.max(0, p));
  const idx = q * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, arr.length - 1);
  return arr[lo]! + (arr[hi]! - arr[lo]!) * (idx - lo);
}

export function sortedFinite(values: ArrayLike<number>): number[] {
  const arr: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i]!)) arr.push(values[i]!);
  arr.sort((a, b) => a - b);
  return arr;
}

export function median(values: ArrayLike<number>): number { return quantile(values, 0.5); }
export function iqr(values: ArrayLike<number>): number { return quantile(values, 0.75) - quantile(values, 0.25); }

export function ecdf(values: ArrayLike<number>): { x: number; p: number }[] {
  const arr = sortedFinite(values);
  return arr.map((x, i) => ({ x, p: (i + 1) / arr.length }));
}

export interface HistogramBin { x0: number; x1: number; count: number }

export function histogram(values: ArrayLike<number>, bins: number, range?: [number, number]): HistogramBin[] {
  const arr = sortedFinite(values);
  const b = Math.max(1, Math.floor(bins));
  if (arr.length === 0) return Array.from({ length: b }, (_, i) => ({ x0: i, x1: i + 1, count: 0 }));
  const lo = range ? range[0] : arr[0]!;
  const hi = range ? range[1] : arr[arr.length - 1]!;
  const span = hi === lo ? 1 : hi - lo;
  const out: HistogramBin[] = Array.from({ length: b }, (_, i) => ({ x0: lo + (span * i) / b, x1: lo + (span * (i + 1)) / b, count: 0 }));
  for (const v of arr) {
    const k = Math.min(b - 1, Math.max(0, Math.floor(((v - lo) / span) * b)));
    out[k]!.count++;
  }
  return out;
}
