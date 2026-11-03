import type { RenderContext } from '../../core/types';
import type { Boid, State } from './logic';

export function boidColor(b: Boid, state: State, theme: 'light' | 'dark'): string {
  const light = theme === 'dark' ? 63 : 46;
  switch (state.params.palette) {
    case 'mono':
      return state.params.color;
    case 'velocity': {
      const s = Math.min(Math.hypot(b.vx, b.vy) / Math.max(1, state.params.maxSpeed), 1);
      return `hsl(${(168 - s * 145).toFixed(1)} 86% ${light}%)`;
    }
    case 'heading':
    default: {
      const hue = (Math.atan2(b.vy, b.vx) * 180) / Math.PI + 180;
      return `hsl(${hue.toFixed(1)} 74% ${light}%)`;
    }
  }
}

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? '#0a0e13' : '#f4f6f8';
  ctx.fillRect(0, 0, width, height);

  // perception halo for a handful of boids, so the local rule stays visible
  ctx.strokeStyle = dark ? 'rgba(127,178,255,0.07)' : 'rgba(47,111,208,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < state.boids.length; i += 24) {
    const b = state.boids[i];
    if (!b) continue;
    ctx.moveTo(b.x + state.params.perception, b.y);
    ctx.arc(b.x, b.y, state.params.perception, 0, Math.PI * 2);
  }
  ctx.stroke();

  for (const b of state.boids) {
    const angle = Math.atan2(b.vy, b.vx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const size = 6.4;

    // wake
    ctx.strokeStyle = boidColor(b, state, theme);
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - cos * size * 2.1, b.y - sin * size * 2.1);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // body
    ctx.fillStyle = boidColor(b, state, theme);
    ctx.beginPath();
    ctx.moveTo(b.x + cos * size, b.y + sin * size);
    ctx.lineTo(b.x - cos * size * 0.7 - sin * size * 0.55, b.y - sin * size * 0.7 + cos * size * 0.55);
    ctx.lineTo(b.x - cos * size * 0.7 + sin * size * 0.55, b.y - sin * size * 0.7 - cos * size * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = dark ? 'rgba(77,214,180,0.4)' : 'rgba(13,143,119,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}
