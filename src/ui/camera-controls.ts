// ─── ui/camera-controls.ts — pan/zoom/pinch gestures → camera ──────────────

import { panBy, toViewport, zoomAt, type Size } from '../core/camera';
import type { Camera } from '../core/types';
import { screenToWorld } from '../core/input';

export interface CameraControlsOptions {
  getCamera(): Camera;
  setCamera(c: Camera): void;
  size(): Size;
  minZoom: number;
  maxZoom: number;
  usesRightClick?: boolean;
  onChange?(): void;
}

export interface CameraControls {
  getCamera(): Camera;
  setCamera(c: Camera): void;
  viewport(): ReturnType<typeof toViewport>;
  worldAt(clientX: number, clientY: number): { x: number; y: number };
  dispose(): void;
}

export function attachCameraControls(canvas: HTMLCanvasElement, opts: CameraControlsOptions): CameraControls {
  const pointers = new Map<number, { x: number; y: number }>();
  let panning: { id: number; lastX: number; lastY: number } | null = null;
  let spaceDown = false;
  let pinch: { d: number; cx: number; cy: number } | null = null;

  const local = (e: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    const size = opts.size();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * size.w,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * size.h,
      rect,
    };
  };

  const commit = (c: Camera) => { opts.setCamera(c); opts.onChange?.(); };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    commit(zoomAt(opts.getCamera(), opts.size(), factor, p.x, p.y, opts));
  };

  const down = (e: PointerEvent) => {
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinch = { d: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y), cx: (pts[0]!.x + pts[1]!.x) / 2, cy: (pts[0]!.y + pts[1]!.y) / 2 };
      return;
    }
    const shouldPan = e.button === 1 || (e.button === 2 && !opts.usesRightClick) || (e.button === 0 && spaceDown);
    if (shouldPan) {
      panning = { id: e.pointerId, lastX: p.x, lastY: p.y };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y });
    if (pinch && pointers.size === 2) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const cx = (pts[0]!.x + pts[1]!.x) / 2;
      const cy = (pts[0]!.y + pts[1]!.y) / 2;
      let cam = panBy(opts.getCamera(), cx - pinch.cx, cy - pinch.cy);
      cam = zoomAt(cam, opts.size(), pinch.d > 0 ? d / pinch.d : 1, cx, cy, opts);
      pinch = { d, cx, cy };
      commit(cam);
      return;
    }
    if (panning && panning.id === e.pointerId) {
      commit(panBy(opts.getCamera(), p.x - panning.lastX, p.y - panning.lastY));
      panning.lastX = p.x;
      panning.lastY = p.y;
    }
  };

  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (panning?.id === e.pointerId) panning = null;
    if (pointers.size < 2) pinch = null;
  };

  const key = (e: KeyboardEvent) => {
    if (e.code === 'Space') spaceDown = e.type === 'keydown';
  };
  const menu = (e: Event) => { if (!opts.usesRightClick) e.preventDefault(); };

  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', menu);
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);

  return {
    getCamera: opts.getCamera,
    setCamera: commit,
    viewport: () => toViewport(opts.getCamera(), opts.size()),
    worldAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const size = opts.size();
      const sx = ((clientX - rect.left) / Math.max(1, rect.width)) * size.w;
      const sy = ((clientY - rect.top) / Math.max(1, rect.height)) * size.h;
      return screenToWorld(sx, sy, toViewport(opts.getCamera(), size));
    },
    dispose() {
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
    },
  };
}
