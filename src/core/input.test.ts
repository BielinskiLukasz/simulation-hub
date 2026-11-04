import { describe, expect, it } from 'vitest';
import { screenToWorld, worldToScreen, type Viewport } from './input';

describe('screenToWorld / worldToScreen', () => {
  const vp: Viewport = { scale: 1.5, offsetX: 40, offsetY: 12 };
  it('round-trips with scale and offset', () => {
    for (const [wx, wy] of [[0, 0], [400, 300], [799.5, 12.25]] as const) {
      const s = worldToScreen(wx, wy, vp);
      const back = screenToWorld(s.x, s.y, vp);
      expect(back.x).toBeCloseTo(wx, 9);
      expect(back.y).toBeCloseTo(wy, 9);
    }
  });
  it('origin maps to the offset', () => {
    expect(screenToWorld(40, 12, vp)).toEqual({ x: 0, y: 0 });
  });
});
