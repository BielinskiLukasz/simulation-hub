// ─── Bouncing Balls · render.ts ─────────────────────────────────────────────
// Canvas 2D. Logical 800×600 coordinates only — the shell scales the backing
// store by devicePixelRatio and letterboxes the world into the canvas.

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

function ballColour(state: State, i: number, theme: 'light' | 'dark'): string {
  const b = state.balls[i]!;
  const { palette, color, maxSpeed } = state.params;
  if (palette === 'mono') return color;
  if (palette === 'speed') {
    const speed = Math.hypot(b.vx, b.vy);
    const t = Math.min(speed / Math.max(maxSpeed * 1.6, 1), 1);
    const hue = 222 - t * 222; // calm blue → hot red
    return `hsl(${hue} 90% ${theme === 'dark' ? 62 : 52}%)`;
  }
  return `hsl(${b.hue} 85% ${theme === 'dark' ? 64 : 54}%)`;
}

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';

  // backdrop
  ctx.fillStyle = dark ? '#0b0f17' : '#f4f6fb';
  ctx.fillRect(0, 0, width, height);

  // subtle world grid (every 100 logical px)
  ctx.strokeStyle = dark ? 'rgba(148,163,184,0.09)' : 'rgba(15,23,42,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 100; x < width; x += 100) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); }
  for (let y = 100; y < height; y += 100) { ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); }
  ctx.stroke();

  // world border
  ctx.strokeStyle = dark ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  const r = state.params.radius;
  for (let i = 0; i < state.balls.length; i++) {
    const b = state.balls[i]!;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = ballColour(state, i, theme);
    ctx.fill();
    // specular dot so motion reads at a glance
    ctx.beginPath();
    ctx.arc(b.x - r * 0.32, b.y - r * 0.32, Math.max(r * 0.22, 1), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }
}
