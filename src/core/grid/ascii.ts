// ─── core/grid/ascii.ts — test/fixture helper ───────────────────────────────
// Legend: '#' wall (1), '.' floor (0), digits 2-9 = terrain cost class,
// 'S' start, 'G' goal. Start/goal are floor cells.

import { createGrid, type Grid } from './grid';

export interface AsciiGrid {
  grid: Grid;
  start: number;
  goal: number;
  legend: string[];
}

export function parseGrid(text: string): AsciiGrid {
  const rows = text.replace(/\r/g, '').split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const grid = createGrid(w, h);
  let start = -1;
  let goal = -1;
  const legend = new Set<string>();
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '#';
      const i = y * w + x;
      if (ch === 'S') { start = i; grid.cells[i] = 0; legend.add('S start'); }
      else if (ch === 'G') { goal = i; grid.cells[i] = 0; legend.add('G goal'); }
      else if (ch === '#') { grid.cells[i] = 1; legend.add('# wall'); }
      else if (ch === '.') { grid.cells[i] = 0; }
      else if (ch >= '2' && ch <= '9') { grid.cells[i] = ch.charCodeAt(0) - 48; legend.add(`${ch} cost ×${ch}`); }
      else throw new Error(`parseGrid: unknown char '${ch}' at ${x},${y}`);
    }
  });
  if (start < 0) start = 0;
  if (goal < 0) goal = w * h - 1;
  return { grid, start, goal, legend: [...legend].sort() };
}

export function formatGrid(g: Grid, start = 0, goal = g.w * g.h - 1): string {
  const lines: string[] = [];
  for (let y = 0; y < g.h; y++) {
    let line = '';
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (i === start) line += 'S';
      else if (i === goal) line += 'G';
      else {
        const v = g.cells[i]!;
        line += v === 0 ? '.' : v === 1 ? '#' : String(v);
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}
