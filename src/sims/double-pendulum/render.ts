// ─── Double Pendulum · render.ts — trail, ghosts, main linkage ─────────────

import type { RenderContext } from '../../core/types';
import { PIVOT, bobPositions, type State } from './logic';

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#0d0a12' : '#faf7fb';
  ctx.fillRect(0, 0, width, height);

  const p = state.params;

  // trail (oldest → newest, fading)
  if (p.trail && state.trailCount > 1) {
    ctx.lineWidth = 1.6;
    const n = state.trailCount;
    for (let i = 1; i < n; i++) {
      const idxA = (state.trailHead - i + state.trailX.length * 2) % state.trailX.length;
      const idxB = (state.trailHead - i - 1 + state.trailX.length * 2) % state.trailX.length;
      const t = 1 - i / n;
      ctx.strokeStyle = `hsla(340 85% ${dark ? 65 : 55}% / ${t * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(state.trailX[idxB]!, state.trailY[idxB]!);
      ctx.lineTo(state.trailX[idxA]!, state.trailY[idxA]!);
      ctx.stroke();
    }
  }

  // ghosts: faint rods + bobs — watch them diverge from the main pendulum
  for (const g of state.ghosts) {
    const pos = bobPositions(g, p);
    ctx.strokeStyle = dark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PIVOT.x, PIVOT.y);
    ctx.lineTo(pos.x1, pos.y1);
    ctx.lineTo(pos.x2, pos.y2);
    ctx.stroke();
    ctx.fillStyle = dark ? 'rgba(226,232,240,0.5)' : 'rgba(71,85,105,0.5)';
    ctx.beginPath(); ctx.arc(pos.x2, pos.y2, 4, 0, Math.PI * 2); ctx.fill();
  }

  // main linkage
  const pos = bobPositions(state.main, p);
  ctx.strokeStyle = dark ? '#e2e8f0' : '#334155';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(PIVOT.x, PIVOT.y);
  ctx.lineTo(pos.x1, pos.y1);
  ctx.lineTo(pos.x2, pos.y2);
  ctx.stroke();

  ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
  ctx.beginPath(); ctx.arc(PIVOT.x, PIVOT.y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fb7185';
  ctx.beginPath(); ctx.arc(pos.x1, pos.y1, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath(); ctx.arc(pos.x2, pos.y2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.arc(pos.x1 - 3, pos.y1 - 3, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(pos.x2 - 2.5, pos.y2 - 2.5, 2.4, 0, Math.PI * 2); ctx.fill();
}
