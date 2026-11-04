// ─── Circuit · render.ts — components and routed wires on the canvas ───────

import type { RenderContext } from '../../core/types';
import type { Compiled } from './model';
import type { State } from './sim';
import { X } from './model';

export const CELL = 42;
export const ORIGIN = { x: 36, y: 84 };

export function compXY(comp: { x: number; y: number }): { x: number; y: number } {
  return { x: ORIGIN.x + comp.x * CELL, y: ORIGIN.y + comp.y * CELL };
}

export function routeWire(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
  const midX = from.x + Math.max(18, (to.x - from.x) / 2);
  return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
}

export function render(state: State, rc: RenderContext, view: { now: number }, compiled?: Compiled): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#0a0f16' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  if (!compiled) {
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText('Compiling circuit…', 24, 40);
    return;
  }

  // grid dots
  ctx.fillStyle = dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.10)';
  for (let x = ORIGIN.x; x < width; x += CELL) for (let y = ORIGIN.y; y < height - 30; y += CELL) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); }

  // wires
  for (const wire of compiled.net.wires) {
    const fromDense = compiled.indexById.get(wire.from)!;
    const toDense = compiled.indexById.get(wire.to)!;
    const fromComp = compiled.net.comps[fromDense]!;
    const toComp = compiled.net.comps[toDense]!;
    const a = compXY(fromComp);
    const b = compXY(toComp);
    const start = { x: a.x + 30, y: a.y };
    const end = { x: b.x - 30, y: b.y + (wire.pin - (toComp.inputs - 1) / 2) * 10 };
    const pts = routeWire(start, end);
    const v = state.out[fromDense]!;
    ctx.strokeStyle = v === 1 ? '#22c55e' : v === 0 ? (dark ? '#475569' : '#94a3b8') : '#a8a29e';
    ctx.setLineDash(v === X ? [5, 4] : []);
    ctx.lineWidth = v === 1 ? 2.4 : 1.6;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // components
  ctx.textAlign = 'center';
  compiled.net.comps.forEach((comp, dense) => {
    const { x, y } = compXY(comp);
    const v = state.out[dense]!;
    const feedback = compiled.feedback.has(dense);
    ctx.beginPath();
    ctx.roundRect(x - 30, y - 17, 60, 34, 8);
    ctx.fillStyle = comp.type === 'led'
      ? (v === 1 ? '#facc15' : v === 0 ? (dark ? '#334155' : '#e2e8f0') : '#a8a29e')
      : dark ? '#111c2b' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = feedback ? 3 : 1.6;
    ctx.strokeStyle = feedback ? '#fb7185' : v === 1 ? '#22c55e' : dark ? 'rgba(226,232,240,0.55)' : 'rgba(15,23,42,0.35)';
    ctx.stroke();
    ctx.fillStyle = comp.type === 'led' && v === 1 ? '#713f12' : dark ? '#e2e8f0' : '#1e293b';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText((comp.label || comp.type).slice(0, 9), x, y - 1);
    ctx.font = '8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.fillText(`${comp.type} · ${v === X ? 'X' : v}`, x, y + 10);
    if (feedback) {
      ctx.fillStyle = '#fb7185';
      ctx.font = 'bold 7.5px Inter, sans-serif';
      ctx.fillText('feedback loop', x, y - 23);
    }
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText(`t=${Math.floor(view.now)} ticks · click a switch to toggle · waveforms below`, 16, height - 12);
}
