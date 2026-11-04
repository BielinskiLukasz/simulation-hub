import { describe, expect, it } from 'vitest';
import { fitRect, followStep, panBy, toViewport, visibleWorldRect, zoomAt } from './camera';
import { screenToWorld, worldToScreen } from './input';
import type { Camera } from './types';

const size = { w: 800, h: 600 };
const lim = { minZoom: 0.1, maxZoom: 10 };

describe('camera math', () => {
  it('toViewport + screenToWorld round trip at several zooms/centres', () => {
    for (const c of [{ cx: 0, cy: 0, zoom: 1 }, { cx: 100, cy: -40, zoom: 2.5 }, { cx: -400, cy: 900, zoom: 0.2 }] as Camera[]) {
      const vp = toViewport(c, size);
      for (const [wx, wy] of [[0, 0], [12.5, -7], [-300, 42]] as const) {
        const s = worldToScreen(wx, wy, vp);
        const back = screenToWorld(s.x, s.y, vp);
        expect(back.x).toBeCloseTo(wx, 9);
        expect(back.y).toBeCloseTo(wy, 9);
      }
    }
  });

  it('zoomAt keeps the world point under the cursor fixed; limits clamp; in/out returns', () => {
    const c: Camera = { cx: 10, cy: 20, zoom: 1.5 };
    const vp = toViewport(c, size);
    const before = screenToWorld(333, 222, vp);
    const zoomed = zoomAt(c, size, 1.7, 333, 222, lim);
    const after = screenToWorld(333, 222, toViewport(zoomed, size));
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomAt(c, size, 1e9, 400, 300, lim).zoom).toBe(10);
    const back = zoomAt(zoomed, size, 1 / 1.7, 333, 222, lim);
    expect(back.cx).toBeCloseTo(c.cx, 9);
    expect(back.zoom).toBeCloseTo(c.zoom, 9);
  });

  it('panBy moves opposite the drag; fitRect frames with padding; follow converges monotonically', () => {
    const p = panBy({ cx: 100, cy: 50, zoom: 2 }, 40, -20);
    expect(p.cx).toBe(80);
    expect(p.cy).toBe(60);
    const fit = fitRect({ x: 0, y: 0, w: 100, h: 100 }, size, 50, lim);
    expect(fit.cx).toBe(50);
    expect(fit.zoom).toBeCloseTo(5, 9);
    const degenerate = fitRect({ x: 5, y: 5, w: 0, h: 0 }, size, 50, lim);
    expect(Number.isFinite(degenerate.zoom)).toBe(true);
    let c: Camera = { cx: 0, cy: 0, zoom: 1 };
    let last = Infinity;
    for (let i = 0; i < 100; i++) {
      c = followStep(c, { x: 100, y: 50 }, 1 / 60, 0.25);
      const d = Math.hypot(100 - c.cx, 50 - c.cy);
      expect(d).toBeLessThanOrEqual(last + 1e-12);
      last = d;
    }
    expect(last).toBeLessThan(0.2);
  });

  it('visibleWorldRect matches viewport corners', () => {
    const c: Camera = { cx: 10, cy: 20, zoom: 2 };
    const r = visibleWorldRect(c, size);
    expect(r.w).toBe(400);
    expect(r.h).toBe(300);
    expect(r.x).toBe(-190);
    expect(r.y).toBe(-130);
  });
});
