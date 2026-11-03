import type { RenderContext } from '../../core/types';
import type { State } from './logic';

function agentColor(kind: 'prey' | 'pred', state: State, theme: 'light' | 'dark'): string {
  if (state.params.palette === 'mono') return kind === 'prey' ? state.params.color : '#ff8a3d';
  const light = theme === 'dark' ? 60 : 45;
  return kind === 'prey' ? `hsl(168 74% ${light}%)` : `hsl(24 92% ${theme === 'dark' ? 62 : 50}%)`;
}

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? '#0a0e13' : '#f4f6f8';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = dark ? 'rgba(233,238,243,0.045)' : 'rgba(16,24,32,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < width; x += 40) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 40; y < height; y += 40) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  // prey
  const preyFill = agentColor('prey', state, theme);
  ctx.fillStyle = state.params.palette === 'phase' && dark ? preyFill : preyFill;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  for (const a of state.preyAgents) {
    ctx.moveTo(a.x + 2.6, a.y);
    ctx.arc(a.x, a.y, 2.6, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;

  // predators as darts
  ctx.fillStyle = agentColor('pred', state, theme);
  for (const a of state.predAgents) {
    const angle = Math.atan2(a.vy, a.vx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(a.x + cos * 5.4, a.y + sin * 5.4);
    ctx.lineTo(a.x - cos * 3.4 - sin * 3.2, a.y - sin * 3.4 + cos * 3.2);
    ctx.lineTo(a.x - cos * 3.4 + sin * 3.2, a.y - sin * 3.4 - cos * 3.2);
    ctx.closePath();
    ctx.fill();
  }

  // population meters (part of the render, not a UI component)
  const barW = 150;
  const preyFrac = Math.min(state.prey / state.peakPrey, 1);
  const predFrac = Math.min(state.pred / state.peakPred, 1);
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';

  const meter = (y: number, label: string, frac: number, value: number, color: string): void => {
    ctx.fillStyle = dark ? 'rgba(233,238,243,0.55)' : 'rgba(16,24,32,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText(label, 18, y);
    ctx.fillStyle = dark ? 'rgba(233,238,243,0.10)' : 'rgba(16,24,32,0.10)';
    ctx.fillRect(74, y - 4, barW, 8);
    ctx.fillStyle = color;
    ctx.fillRect(74, y - 4, Math.max(2, barW * frac), 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = dark ? 'rgba(233,238,243,0.8)' : 'rgba(16,24,32,0.8)';
    ctx.fillText(value.toFixed(1), 74 + barW + 54, y);
  };

  meter(28, 'prey', preyFrac, state.prey, agentColor('prey', state, theme));
  meter(48, 'predators', predFrac, state.pred, agentColor('pred', state, theme));

  ctx.strokeStyle = dark ? 'rgba(255,127,174,0.35)' : 'rgba(194,56,111,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}
