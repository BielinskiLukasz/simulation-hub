// ─── core/des/timeline-math.ts — pure time↔pixel mapping ───────────────────

export interface View {
  t0: number;
  t1: number;
  widthPx: number;
}

export interface SegmentLike {
  start: number;
  end: number | null;
}

export function timeToX(t: number, v: View): number {
  const span = v.t1 - v.t0;
  return span === 0 ? 0 : ((t - v.t0) / span) * v.widthPx;
}

export function xToTime(x: number, v: View): number {
  return v.widthPx === 0 ? v.t0 : v.t0 + (x / v.widthPx) * (v.t1 - v.t0);
}

/** Zoom around a pixel anchor: the time under the cursor stays under it. */
export function zoom(v: View, factor: number, anchorX: number, domain: [number, number]): View {
  const anchorT = xToTime(anchorX, v);
  const span = (v.t1 - v.t0) / Math.max(factor, 0.0001);
  const domSpan = domain[1] - domain[0];
  const clampedSpan = Math.min(Math.max(span, domSpan / 10000 || 1), domSpan || span);
  let t0 = anchorT - (anchorX / (v.widthPx || 1)) * clampedSpan;
  let t1 = t0 + clampedSpan;
  if (t0 < domain[0]) { t1 += domain[0] - t0; t0 = domain[0]; }
  if (t1 > domain[1]) { t0 -= t1 - domain[1]; t1 = domain[1]; }
  if (t0 < domain[0]) t0 = domain[0];
  return { t0, t1, widthPx: v.widthPx };
}

export function pan(v: View, dxPx: number, domain: [number, number]): View {
  const span = v.t1 - v.t0;
  const dt = (dxPx / (v.widthPx || 1)) * span;
  let t0 = v.t0 - dt;
  let t1 = v.t1 - dt;
  if (t0 < domain[0]) { t1 += domain[0] - t0; t0 = domain[0]; }
  if (t1 > domain[1]) { t0 -= t1 - domain[1]; t1 = domain[1]; }
  if (t0 < domain[0]) t0 = domain[0];
  return { ...v, t0, t1 };
}

/** "Nice" tick positions: multiples of 1/2/5 × 10ⁿ within [t0, t1]. */
export function niceTicks(t0: number, t1: number, targetCount: number): number[] {
  if (!(t1 > t0) || targetCount < 1) return [];
  const rawStep = (t1 - t0) / targetCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  const first = Math.ceil(t0 / step) * step;
  for (let t = first; t <= t1 + 1e-9; t += step) out.push(Math.round(t * 1e9) / 1e9);
  return out;
}

/** Segments intersecting the view (end null = open, treated as +∞). */
export function visibleSegments<T extends SegmentLike>(segs: T[], v: View): T[] {
  return segs.filter((s) => (s.end ?? Infinity) >= v.t0 && s.start <= v.t1);
}
