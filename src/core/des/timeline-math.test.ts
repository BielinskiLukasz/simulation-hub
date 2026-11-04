import { describe, expect, it } from 'vitest';
import { niceTicks, pan, timeToX, visibleSegments, xToTime, zoom, type View } from './timeline-math';

const v: View = { t0: 100, t1: 300, widthPx: 800 };

describe('timeline-math', () => {
  it('timeToX / xToTime round-trip', () => {
    for (const t of [100, 150, 222.5, 300]) {
      expect(xToTime(timeToX(t, v), v)).toBeCloseTo(t, 9);
    }
  });
  it('zoom keeps the anchor time under the cursor', () => {
    const anchorX = 200;
    const before = xToTime(anchorX, v);
    const z = zoom(v, 2, anchorX, [0, 1000]);
    expect(xToTime(anchorX, z)).toBeCloseTo(before, 6);
    expect(z.t1 - z.t0).toBeCloseTo(100, 6);
  });
  it('pan clamps to the domain', () => {
    const p = pan(v, 100000, [0, 1000]);
    expect(p.t0).toBeGreaterThanOrEqual(0);
    const p2 = pan(v, -100000, [0, 1000]);
    expect(p2.t1).toBeLessThanOrEqual(1000);
  });
  it('ticks are nice (1/2/5×10ⁿ) and within range', () => {
    const ticks = niceTicks(0, 950, 8);
    expect(ticks.length).toBeGreaterThan(3);
    for (const t of ticks) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(950); }
    const diffs = ticks.slice(1).map((t, i) => t - ticks[i]!);
    for (const d of diffs) expect([100, 200, 500, 1000]).toContain(Math.round(d));
  });
  it('culling returns exactly the intersecting segments (open ends count)', () => {
    const segs = [
      { start: 0, end: 50 }, { start: 150, end: 250 }, { start: 400, end: null }, { start: 20, end: 90 },
    ];
    expect(visibleSegments(segs, v)).toEqual([segs[1]]);
    expect(visibleSegments(segs, { t0: 0, t1: 1000, widthPx: 10 })).toEqual(segs);
  });
});
