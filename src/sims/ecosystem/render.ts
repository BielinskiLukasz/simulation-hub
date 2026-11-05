// ─── Ecosystem · render.ts — territory heat, plants, agents (culled) ───────

import type { RenderContext } from '../../core/types';
import { HERB, PLANT, PRED, TERRITORY_COLS, TERRITORY_ROWS, WORLD, type State } from './logic';

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#06120c' : '#f2fbf4';
  ctx.fillRect(0, 0, width, height);
  const view = rc.view;
  ctx.save();
  if (view) {
    ctx.translate(view.viewport.offsetX, view.viewport.offsetY);
    ctx.scale(view.viewport.scale, view.viewport.scale);
  }
  const px = view ? view.px(1) : 1;
  const wr = view?.worldRect ?? { x: 0, y: 0, w: WORLD.w, h: WORLD.h };

  if (state.params.territory) {
    const cw = WORLD.w / TERRITORY_COLS;
    const ch = WORLD.h / TERRITORY_ROWS;
    for (let y = 0; y < TERRITORY_ROWS; y++) {
      for (let x = 0; x < TERRITORY_COLS; x++) {
        const v = state.claim[y * TERRITORY_COLS + x]!;
        if (Math.abs(v) < 0.02) continue;
        ctx.fillStyle = v > 0 ? `rgba(34,197,94,${Math.min(0.28, v * 0.5)})` : `rgba(244,63,94,${Math.min(0.28, -v * 0.5)})`;
        ctx.fillRect(x * cw, y * ch, cw + 0.6, ch + 0.6);
      }
    }
  }

  for (const species of [PLANT, HERB, PRED]) {
    ctx.beginPath();
    for (let i = 0; i < state.n; i++) {
      if (state.species[i] !== species) continue;
      const x = state.x[i]!;
      const y = state.y[i]!;
      if (x < wr.x - 10 || x > wr.x + wr.w + 10 || y < wr.y - 10 || y > wr.y + wr.h + 10) continue;
      const r = (species === PLANT ? 2.6 : species === HERB ? 3.6 : 5) * px;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = species === PLANT ? '#4ade80' : species === HERB ? '#38bdf8' : '#f43f5e';
    ctx.fill();
  }

  ctx.restore();
  ctx.fillStyle = dark ? 'rgba(226,232,240,0.85)' : 'rgba(15,23,42,0.7)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText(
    `plants ${state.counts[PLANT]} · herbivores ${state.counts[HERB]} · predators ${state.counts[PRED]} · t=${state.time.toFixed(1)}s`,
    10, height - 10,
  );
}
