// ─── core/camera.ts — pure pan/zoom/fit/follow math (y-down world) ─────────

import type { Camera, Rect } from './types';
import type { Viewport } from './input';

export interface Size { w: number; h: number }
export interface ZoomLimits { minZoom: number; maxZoom: number }

export function toViewport(c: Camera, size: Size): Viewport {
  return {
    scale: c.zoom,
    offsetX: size.w / 2 - c.cx * c.zoom,
    offsetY: size.h / 2 - c.cy * c.zoom,
  };
}

function clampZoom(zoom: number, lim: ZoomLimits): number {
  return Math.min(lim.maxZoom, Math.max(lim.minZoom, zoom));
}

export function zoomAt(c: Camera, size: Size, factor: number, sx: number, sy: number, lim: ZoomLimits): Camera {
  const before = toViewport(c, size);
  const wx = (sx - before.offsetX) / before.scale;
  const wy = (sy - before.offsetY) / before.scale;
  const zoom = clampZoom(c.zoom * factor, lim);
  return {
    zoom,
    cx: wx - (sx - size.w / 2) / zoom,
    cy: wy - (sy - size.h / 2) / zoom,
  };
}

export function panBy(c: Camera, dxPx: number, dyPx: number): Camera {
  return { ...c, cx: c.cx - dxPx / c.zoom, cy: c.cy - dyPx / c.zoom };
}

export function fitRect(r: Rect, size: Size, paddingPx: number, lim: ZoomLimits): Camera {
  const w = Math.max(1e-9, r.w);
  const h = Math.max(1e-9, r.h);
  const availW = Math.max(1, size.w - paddingPx * 2);
  const availH = Math.max(1, size.h - paddingPx * 2);
  const zoom = clampZoom(Math.min(availW / w, availH / h), lim);
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, zoom };
}

export function followStep(c: Camera, target: { x: number; y: number }, dtSeconds: number, tauSeconds: number): Camera {
  const t = tauSeconds <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dtSeconds) / tauSeconds);
  return { ...c, cx: c.cx + (target.x - c.cx) * t, cy: c.cy + (target.y - c.cy) * t };
}

export function visibleWorldRect(c: Camera, size: Size): Rect {
  const vp = toViewport(c, size);
  return {
    x: -vp.offsetX / vp.scale,
    y: -vp.offsetY / vp.scale,
    w: size.w / vp.scale,
    h: size.h / vp.scale,
  };
}
