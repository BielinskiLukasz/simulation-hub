// ─── Falling sand · render.ts — one ImageData write per frame ──────────────

import type { RenderContext } from '../../core/types';
import { paletteFor } from './materials';
import type { State } from './logic';

let off: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;
let image: ImageData | null = null;

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const palette = paletteFor(theme);
  if (!off || off.width !== state.w || off.height !== state.h) {
    off = document.createElement('canvas');
    off.width = state.w;
    off.height = state.h;
    offCtx = off.getContext('2d')!;
    image = offCtx.createImageData(state.w, state.h);
  }
  const img = image!;
  const out = new Uint32Array(img.data.buffer);
  for (let i = 0; i < state.cells.length; i++) {
    const v = state.cells[i]!;
    let color = palette[v] ?? palette[0]!;
    if (v === 5 || v === 6) {
      // subtle life flicker for fire/lava
      const life = state.life[i]!;
      if ((life & 3) === 0) color = (color & 0x00ffffff) | 0xff000000;
    }
    out[i] = color;
  }
  offCtx!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off!, 0, 0, width, height);
}
