// ─── N-body · render.ts — world-space bodies, trails, launch vector ─────────

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#050914' : '#eef4ff';
  ctx.fillRect(0, 0, width, height);
  const view = rc.view;
  ctx.save();
  if (view) {
    ctx.translate(view.viewport.offsetX, view.viewport.offsetY);
    ctx.scale(view.viewport.scale, view.viewport.scale);
  }
  const wr = view?.worldRect ?? { x: -400, y: -300, w: 800, h: 600 };
  const px = view ? view.px(1) : 1;

  // trails
  if (state.params.trails && state.n <= 200 && state.trailCount > 1) {
    const len = Math.max(20, Math.round(state.params.trailLength));
    ctx.lineWidth = 1.2 * px;
    for (let i = 0; i < state.n; i++) {
      ctx.beginPath();
      for (let k = state.trailCount - 1; k >= 0; k--) {
        const slot = (state.trailHead - 1 - k + len * 2) % len;
        const base = (slot * state.n + i) * 2;
        const x = state.trail[base]!;
        const y = state.trail[base + 1]!;
        if (k === state.trailCount - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = dark ? 'rgba(125,211,252,0.28)' : 'rgba(2,132,199,0.25)';
      ctx.stroke();
    }
  }

  // bodies (culled)
  for (let bucket = 0; bucket < 4; bucket++) {
    ctx.beginPath();
    for (let i = 0; i < state.n; i++) {
      const x = state.pos[i * 2]!;
      const y = state.pos[i * 2 + 1]!;
      if (x < wr.x - 20 || x > wr.x + wr.w + 20 || y < wr.y - 20 || y > wr.y + wr.h + 20) continue;
      const speed = Math.sqrt(state.vel[i * 2]! * state.vel[i * 2]! + state.vel[i * 2 + 1]! * state.vel[i * 2 + 1]!);
      const b = Math.min(3, Math.floor(speed * 1.4));
      if (b !== bucket) continue;
      const r = Math.max(1.6 * px, Math.cbrt(Math.max(0.001, state.mass[i]!)) * 1.7 * px);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = ['#38bdf8', '#22d3ee', '#fbbf24', '#fb7185'][bucket]!;
    ctx.fill();
  }

  if (state.launch) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.moveTo(state.launch.x, state.launch.y);
    ctx.lineTo(state.launch.cx, state.launch.cy);
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(state.launch.x, state.launch.y, 4 * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = dark ? 'rgba(226,232,240,0.8)' : 'rgba(15,23,42,0.7)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText(`t=${state.simTime.toFixed(2)} · bodies ${state.n} · ${state.params.integrator} · ${state.params.forceMethod}`, 10, height - 10);
}
