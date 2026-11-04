// ─── ui/pointer.ts — DOM Pointer Events → world-space PointerEv ─────────────
// Uses CSS pixels (getBoundingClientRect), setPointerCapture for drags,
// suppresses the context menu, and sets touch-action: none so drags paint
// instead of scrolling. Returns dispose() — callers must not leak listeners.

import { screenToWorld, type PointerEv } from '../core/input';

export function bindPointer(
  canvas: HTMLCanvasElement,
  world: { w: number; h: number },
  onEvent: (ev: PointerEv) => void,
  getViewport?: () => { scale: number; offsetX: number; offsetY: number } | null,
): () => void {
  const prevTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';

  const toEvent = (e: PointerEvent, type: PointerEv['type']): PointerEv => {
    const rect = canvas.getBoundingClientRect();
    const vp = getViewport?.();
    if (vp) {
      const sx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * world.w;
      const sy = ((e.clientY - rect.top) / Math.max(1, rect.height)) * world.h;
      const p = screenToWorld(sx, sy, vp);
      return { type, x: p.x, y: p.y, button: e.button, shift: e.shiftKey, alt: e.altKey, pressed: e.buttons > 0 };
    }
    const scale = rect.width > 0 ? rect.width / world.w : 1;
    const p = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { scale, offsetX: 0, offsetY: 0 });
    return {
      type,
      x: p.x,
      y: p.y,
      button: e.button,
      shift: e.shiftKey,
      alt: e.altKey,
      pressed: e.buttons > 0,
    };
  };

  const down = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    onEvent(toEvent(e, 'down'));
  };
  const move = (e: PointerEvent) => onEvent(toEvent(e, 'move'));
  const up = (e: PointerEvent) => onEvent(toEvent(e, 'up'));
  const click = (e: PointerEvent) => onEvent(toEvent(e, 'click'));
  const menu = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('click', click);
  canvas.addEventListener('contextmenu', menu);

  return () => {
    canvas.style.touchAction = prevTouchAction;
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('click', click);
    canvas.removeEventListener('contextmenu', menu);
  };
}
