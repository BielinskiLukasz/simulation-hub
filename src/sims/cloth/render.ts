// ─── Cloth · render.ts — strain-bucketed constraint segments ────────────────

import type { RenderContext } from '../../core/types';
import { GROUND_Y, WORLD, type State } from './logic';

const BUCKETS = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185'];

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#07110d' : '#f0fdf6';
  ctx.fillRect(0, 0, width, height);
  const view = rc.view;
  ctx.save();
  if (view) {
    ctx.translate(view.viewport.offsetX, view.viewport.offsetY);
    ctx.scale(view.viewport.scale, view.viewport.scale);
  }
  const px = view ? view.px(1) : 1;

  // ground
  ctx.fillStyle = dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.10)';
  ctx.fillRect(0, GROUND_Y, WORLD.w, WORLD.h - GROUND_Y);
  ctx.strokeStyle = dark ? 'rgba(226,232,240,0.35)' : 'rgba(15,23,42,0.25)';
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(WORLD.w, GROUND_Y); ctx.stroke();

  for (let bucket = 0; bucket < 4; bucket++) {
    ctx.beginPath();
    for (let k = 0; k < state.nc; k++) {
      if (!state.alive[k]) continue;
      const i = state.ca[k]!;
      const j = state.cb[k]!;
      const dx = state.x[j]! - state.x[i]!;
      const dy = state.y[j]! - state.y[i]!;
      const d = Math.sqrt(dx * dx + dy * dy);
      const strain = state.rest[k]! > 0 ? Math.abs(d - state.rest[k]!) / state.rest[k]! : 0;
      const b = !state.params.showStrain ? 0 : strain < 0.03 ? 0 : strain < 0.1 ? 1 : strain < 0.25 ? 2 : 3;
      if (b !== bucket) continue;
      ctx.moveTo(state.x[i]!, state.y[i]!);
      ctx.lineTo(state.x[j]!, state.y[j]!);
    }
    ctx.strokeStyle = BUCKETS[bucket]!;
    ctx.lineWidth = (bucket === 0 ? 1.4 : 1.8) * px;
    ctx.stroke();
  }

  // particles + pins
  for (let i = 0; i < state.n; i++) {
    const pinned = state.invMass[i] === 0;
    ctx.fillStyle = pinned ? '#f43f5e' : dark ? '#e2e8f0' : '#334155';
    ctx.beginPath();
    ctx.arc(state.x[i]!, state.y[i]!, (pinned ? 3.4 : 2.1) * px, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.grab) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.arc(state.grab.tx, state.grab.ty, 10 * px, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = dark ? 'rgba(226,232,240,0.8)' : 'rgba(15,23,42,0.7)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText(`particles ${state.n} · constraints ${state.nc} · torn ${state.torn} · max strain ${(state.maxStrain * 100).toFixed(1)}%`, 10, height - 10);
}
