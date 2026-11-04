// ─── Boids · render.ts ──────────────────────────────────────────────────────
// One beginPath() per colour BUCKET (12 heading / 8 speed / 1 mono), never
// per boid. Triangles are computed from the velocity direction with a single
// precomputed inverse speed per boid.

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#070b12' : '#eef2f8';
  ctx.fillRect(0, 0, width, height);

  const { x, y, vx, vy, n, params } = state;
  const mode = params.colorBy;
  const buckets = mode === 'heading' ? 12 : mode === 'speed' ? 8 : 1;

  for (let b = 0; b < buckets; b++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(vx[i]!, vy[i]!) || 1;
      let bucket = 0;
      if (mode === 'heading') {
        let ang = Math.atan2(vy[i]!, vx[i]!);
        if (ang < 0) ang += Math.PI * 2;
        bucket = Math.floor((ang / (Math.PI * 2)) * 12) % 12;
      } else if (mode === 'speed') {
        bucket = Math.min(7, Math.floor((sp / params.maxSpeed) * 8));
      }
      if (bucket !== b) continue;
      const inv = 1 / sp;
      const dx = vx[i]! * inv; const dy = vy[i]! * inv;
      const px = -dy; const py = dx;
      const cx = x[i]!; const cy = y[i]!;
      ctx.moveTo(cx + dx * 7, cy + dy * 7);
      ctx.lineTo(cx - dx * 5 + px * 3.2, cy - dy * 5 + py * 3.2);
      ctx.lineTo(cx - dx * 5 - px * 3.2, cy - dy * 5 - py * 3.2);
      ctx.closePath();
    }
    if (mode === 'heading') ctx.fillStyle = `hsl(${b * 30} 85% ${dark ? 62 : 50}%)`;
    else if (mode === 'speed') ctx.fillStyle = `hsl(${222 - b * 30} 88% ${dark ? 62 : 50}%)`;
    else ctx.fillStyle = dark ? '#7dd3fc' : '#0369a1';
    ctx.fill();
  }

  // obstacles
  if (state.obstacles.length > 0) {
    ctx.beginPath();
    for (const o of state.obstacles) { ctx.moveTo(o.x + o.r, o.y); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); }
    ctx.fillStyle = dark ? 'rgba(148,163,184,0.35)' : 'rgba(71,85,105,0.30)';
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(226,232,240,0.5)' : 'rgba(51,65,85,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // predators: larger red triangles
  ctx.beginPath();
  for (const p of state.predators) {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const dx = p.vx / sp; const dy = p.vy / sp;
    const px = -dy; const py = dx;
    ctx.moveTo(p.x + dx * 13, p.y + dy * 13);
    ctx.lineTo(p.x - dx * 9 + px * 6, p.y - dy * 9 + py * 6);
    ctx.lineTo(p.x - dx * 9 - px * 6, p.y - dy * 9 - py * 6);
    ctx.closePath();
  }
  if (state.predators.length > 0) { ctx.fillStyle = '#ef4444'; ctx.fill(); }
}
