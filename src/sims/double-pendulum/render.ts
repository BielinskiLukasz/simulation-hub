import type { RenderContext } from '../../core/types';
import { bob2, energy, type Arm, type State } from './logic';

export function armColor(index: number, total: number, arm: Arm, state: State, theme: 'light' | 'dark'): string {
  const light = theme === 'dark' ? 62 : 47;
  switch (state.params.palette) {
    case 'mono':
      return state.params.color;
    case 'energy': {
      const e = Math.min(Math.abs(energy(arm, state.params.gravity)) / 40, 1);
      return `hsl(${(168 - e * 145).toFixed(1)} 88% ${light}%)`;
    }
    case 'fan':
    default: {
      const hue = total > 1 ? 12 + (index / (total - 1)) * 190 : 22;
      return `hsl(${hue.toFixed(1)} 86% ${light}%)`;
    }
  }
}

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  const { params } = state;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? '#0a0e13' : '#f4f6f8';
  ctx.fillRect(0, 0, width, height);

  const pivotX = width / 2;
  const pivotY = height * 0.34;
  const scale = params.length;
  const total = state.arms.length;

  // pivot cross-hair
  ctx.strokeStyle = dark ? 'rgba(233,238,243,0.16)' : 'rgba(16,24,32,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pivotX - 26, pivotY);
  ctx.lineTo(pivotX + 26, pivotY);
  ctx.moveTo(pivotX, pivotY - 26);
  ctx.lineTo(pivotX, pivotY + 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, scale * 2, 0, Math.PI * 2);
  ctx.strokeStyle = dark ? 'rgba(233,238,243,0.07)' : 'rgba(16,24,32,0.07)';
  ctx.stroke();

  state.arms.forEach((arm, i) => {
    const color = armColor(i, total, arm, state, theme);

    if (params.trail && arm.count > 2) {
      const cap = arm.trail.length / 2;
      const CHUNKS = 5;
      for (let c = 0; c < CHUNKS; c++) {
        const from = Math.floor((arm.count * c) / CHUNKS);
        const to = Math.floor((arm.count * (c + 1)) / CHUNKS);
        ctx.globalAlpha = 0.05 + (c / CHUNKS) * 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 + c * 0.28;
        ctx.beginPath();
        for (let k = from; k < to; k++) {
          const idx = ((arm.head - arm.count + k + cap * 2) % cap) * 2;
          const x = pivotX + arm.trail[idx]! * scale;
          const y = pivotY + arm.trail[idx + 1]! * scale;
          if (k === from) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const x1 = pivotX + Math.sin(arm.th1) * scale;
    const y1 = pivotY + Math.cos(arm.th1) * scale;
    const bob = bob2(arm);
    const x2 = pivotX + bob.x * scale;
    const y2 = pivotY + bob.y * scale;

    ctx.strokeStyle = color;
    ctx.globalAlpha = total > 16 ? 0.5 : 0.85;
    ctx.lineWidth = total > 16 ? 1 : 1.8;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const r = total > 16 ? 2.4 : 4.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x2, y2, r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = dark ? 'rgba(255,138,61,0.45)' : 'rgba(217,86,12,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}
