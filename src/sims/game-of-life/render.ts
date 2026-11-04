// ─── Game of Life · render.ts — age-tinted cells on the 800×600 stage ──────

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#08110b' : '#f0f7f1';
  ctx.fillRect(0, 0, width, height);

  const cw = width / state.cols;
  const ch = height / state.rows;

  // faint grid at larger cell sizes
  if (cw >= 8) {
    ctx.strokeStyle = dark ? 'rgba(148,197,163,0.08)' : 'rgba(21,101,52,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < state.cols; x++) { ctx.moveTo(x * cw + 0.5, 0); ctx.lineTo(x * cw + 0.5, height); }
    for (let y = 1; y < state.rows; y++) { ctx.moveTo(0, y * ch + 0.5); ctx.lineTo(width, y * ch + 0.5); }
    ctx.stroke();
  }

  const inset = cw >= 7 ? 1 : 0;
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const idx = y * state.cols + x;
      if (state.cells[idx] !== 1) continue;
      const age = state.age[idx]!;
      // newborns flare bright; elders settle to deep green
      const t = Math.min(age / 24, 1);
      const hue = 142 - t * 18;
      const light = dark ? 68 - t * 26 : 52 - t * 16;
      ctx.fillStyle = `hsl(${hue} 72% ${light}%)`;
      ctx.fillRect(x * cw + inset, y * ch + inset, cw - inset * 2, ch - inset * 2);
    }
  }
}
