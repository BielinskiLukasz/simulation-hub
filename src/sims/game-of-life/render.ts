import type { RenderContext } from '../../core/types';
import type { State } from './logic';

export function cellColor(age: number, state: State, theme: 'light' | 'dark'): string {
  if (state.params.palette === 'mono') return state.params.color;
  // newborn = cool mint, ancient = hot orange
  const a = Math.min(age / 90, 1);
  const hue = 168 - a * 140;
  const light = theme === 'dark' ? 58 - a * 4 : 44 - a * 6;
  return `hsl(${hue.toFixed(1)} 84% ${light.toFixed(1)}%)`;
}

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  const { cols, rows, cells, age, params } = state;
  const cw = width / cols;
  const ch = height / rows;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? '#0a0e13' : '#f4f6f8';
  ctx.fillRect(0, 0, width, height);

  // batch cells by colour bucket so we issue a handful of paths, not thousands
  const BUCKETS = 10;
  const paths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D());
  const gap = params.grid && cw >= 4 ? Math.min(1, cw * 0.14) : 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (cells[i] !== 1) continue;
      const bucket = Math.min(Math.floor((age[i]! / 90) * BUCKETS), BUCKETS - 1);
      paths[bucket]!.rect(x * cw + gap / 2, y * ch + gap / 2, cw - gap, ch - gap);
    }
  }

  for (let b = 0; b < BUCKETS; b++) {
    ctx.fillStyle = cellColor((b / BUCKETS) * 90 + 1, state, theme);
    ctx.fill(paths[b]!);
  }

  if (params.grid && cw >= 5) {
    ctx.strokeStyle = dark ? 'rgba(233,238,243,0.05)' : 'rgba(16,24,32,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < cols; x++) {
      ctx.moveTo(Math.round(x * cw) + 0.5, 0);
      ctx.lineTo(Math.round(x * cw) + 0.5, height);
    }
    for (let y = 1; y < rows; y++) {
      ctx.moveTo(0, Math.round(y * ch) + 0.5);
      ctx.lineTo(width, Math.round(y * ch) + 0.5);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = dark ? 'rgba(242,209,78,0.4)' : 'rgba(169,122,5,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}
