// ─── JVM GC · render.ts — the cell grid heap view ──────────────────────────
// 64 columns; each heap cell one square. Colours: young greens (by age),
// old blues, large objects magenta-tinted, free = background. The grid IS
// the fragmentation view: free cells are literally the holes.

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

const COLS = 64;

export function render(state: State, rc: RenderContext, view: { now: number }): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  const h = state.heap;
  ctx.fillStyle = dark ? '#0a0f0d' : '#f3f7f4';
  ctx.fillRect(0, 0, width, height);

  const rows = Math.ceil(h.cells / COLS);
  const gridTop = 64;
  const cellW = (width - 32) / COLS;
  const cellH = Math.min(cellW, (height - gridTop - 92) / rows);
  const generational = state.collectorId === 'generational';

  // headers
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.fillText(
    generational ? `Generational heap — young [0, ${h.youngCells}) · old [${h.youngCells}, ${h.cells})` : 'Mark-sweep heap (single space)',
    16, 26,
  );
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  const usedPct = Math.round((usedCount(h) / h.cells) * 100);
  ctx.fillText(`${h.cells} cells · ${usedPct}% used · t=${(view.now / 1_000_000).toFixed(1)}s`, 16, 46);
  if (view.now < h.blockedUntil) {
    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(`⏸ STOP-THE-WORLD · ${h.stats.lastKind} · resumes in ${((h.blockedUntil - view.now) / 1000).toFixed(1)} ms`, 430, 46);
  }
  if (h.oom) {
    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillText('💥 OutOfMemoryError — heap exhausted (see Event log)', 430, 46);
  }

  for (let c = 0; c < h.cells; c++) {
    const owner = h.cellOwner[c]!;
    if (owner === -1) continue;
    const x = 16 + (c % COLS) * cellW;
    const y = gridTop + Math.floor(c / COLS) * cellH;
    const young = c < h.youngCells;
    const size = h.size[owner]!;
    let fill: string;
    if (size >= 16) fill = dark ? '#c026d3' : '#a21caf'; // large / humongous-ish
    else if (generational && young) {
      const ageT = Math.min(h.age[owner]! / 8, 1);
      fill = `hsl(${150 - ageT * 30} 65% ${dark ? 55 - ageT * 18 : 46 - ageT * 12}%)`;
    } else if (generational) fill = dark ? '#2563eb' : '#1d4ed8';
    else fill = dark ? '#0ea5e9' : '#0284c7';
    ctx.fillStyle = fill;
    ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
  }

  // young/old boundary
  if (generational) {
    const bx = 16 + (h.youngCells % COLS) * cellW;
    const by = gridTop + Math.floor(h.youngCells / COLS) * cellH;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, by);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx, by + cellH);
    ctx.lineTo(width - 16, by + cellH);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // legend + KPIs
  const ly = gridTop + rows * cellH + 18;
  ctx.font = '10.5px "JetBrains Mono", monospace';
  const items: [string, string][] = generational
    ? [['#22c55e', 'eden/young'], ['#15803d', 'survivor (aged)'], ['#2563eb', 'old'], ['#c026d3', 'large'], ['transparent', 'free']]
    : [['#0ea5e9', 'live'], ['#c026d3', 'large'], ['transparent', 'free']];
  let lx = 16;
  for (const [color, label] of items) {
    if (color !== 'transparent') { ctx.fillStyle = color; ctx.fillRect(lx, ly - 9, 10, 10); }
    else { ctx.strokeStyle = dark ? '#475569' : '#94a3b8'; ctx.strokeRect(lx, ly - 9, 10, 10); }
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.fillText(label, lx + 14, ly);
    lx += 14 + ctx.measureText(label).width + 18;
  }
  const s = h.stats;
  const elapsed = Math.max(h.nowUs, 1);
  ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
  ctx.font = 'bold 11.5px "JetBrains Mono", monospace';
  ctx.fillText(
    `throughput ${(100 * (1 - s.totalPauseUs / elapsed)).toFixed(1)}% · GCs minor ${s.minorGc} / full ${s.fullGc} / ms ${s.markSweepGc} · promoted ${(s.promotedCells / 1000).toFixed(1)}k cells · allocated ${(s.allocatedCells / 1000).toFixed(0)}k cells`,
    16, ly + 22,
  );
}

function usedCount(h: State['heap']): number {
  let n = 0;
  for (let c = 0; c < h.cells; c++) if (h.cellOwner[c] !== -1) n++;
  return n;
}
