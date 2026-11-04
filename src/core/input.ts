// ─── core/input.ts — pure pointer math (no DOM) ─────────────────────────────
// DOM events are translated in ui/pointer.ts; everything here is testable
// in node. Coordinates carried by PointerEv are ALWAYS world coordinates.

export interface PointerEv {
  type: 'down' | 'move' | 'up' | 'click';
  x: number; // world
  y: number; // world
  button: number; // 0 left, 1 middle, 2 right
  shift: boolean;
  alt: boolean;
  pressed: boolean; // a button is held (drag painting)
}

export interface Viewport {
  scale: number; // CSS px per world unit
  offsetX: number; // CSS px
  offsetY: number;
}

export function screenToWorld(px: number, py: number, vp: Viewport): { x: number; y: number } {
  return { x: (px - vp.offsetX) / vp.scale, y: (py - vp.offsetY) / vp.scale };
}

export function worldToScreen(wx: number, wy: number, vp: Viewport): { x: number; y: number } {
  return { x: wx * vp.scale + vp.offsetX, y: wy * vp.scale + vp.offsetY };
}
