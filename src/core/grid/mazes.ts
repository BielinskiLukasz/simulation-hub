// ─── core/grid/mazes.ts — seeded perfect-maze generators (spanning trees) ──

import type { Rng } from '../types';
import { createGrid, type Grid } from './grid';

export type MazeKind = 'backtracker' | 'prim' | 'kruskal' | 'division';

function odd(n: number): number {
  return Math.max(5, n % 2 === 1 ? n : n - 1);
}

export function generateMaze(kind: MazeKind, wIn: number, hIn: number, rng: Rng): Grid {
  const w = odd(wIn);
  const h = odd(hIn);
  const grid = createGrid(w, h, 1);
  if (kind === 'division') return division(grid, rng);
  if (kind === 'kruskal') return kruskal(grid, rng);
  if (kind === 'prim') return prim(grid, rng);
  return backtracker(grid, rng);
}

function carve(g: Grid, x: number, y: number): void {
  g.cells[y * g.w + x] = 0;
}

function backtracker(g: Grid, rng: Rng): Grid {
  const stack: [number, number][] = [[1, 1]];
  carve(g, 1, 1);
  const dirs: [number, number][] = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]!;
    const options = dirs.filter(([dx, dy]) => {
      const nx = x + dx; const ny = y + dy;
      return nx > 0 && ny > 0 && nx < g.w - 1 && ny < g.h - 1 && g.cells[ny * g.w + nx] === 1;
    });
    if (!options.length) { stack.pop(); continue; }
    const [dx, dy] = options[rng.int(0, options.length - 1)]!;
    carve(g, x + dx / 2, y + dy / 2);
    carve(g, x + dx, y + dy);
    stack.push([x + dx, y + dy]);
  }
  return g;
}

function prim(g: Grid, rng: Rng): Grid {
  carve(g, 1, 1);
  const frontier: [number, number, number, number][] = [];
  const push = (x: number, y: number) => {
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
      const nx = x + dx; const ny = y + dy;
      if (nx > 0 && ny > 0 && nx < g.w - 1 && ny < g.h - 1 && g.cells[ny * g.w + nx] === 1) {
        frontier.push([nx, ny, x + dx / 2, y + dy / 2]);
      }
    }
  };
  push(1, 1);
  while (frontier.length) {
    const k = rng.int(0, frontier.length - 1);
    const [x, y, wx, wy] = frontier.splice(k, 1)[0]!;
    if (g.cells[y * g.w + x] !== 1) continue;
    carve(g, wx, wy);
    carve(g, x, y);
    push(x, y);
  }
  return g;
}

function kruskal(g: Grid, rng: Rng): Grid {
  const cw = (g.w - 1) / 2;
  const ch = (g.h - 1) / 2;
  const parent = Array.from({ length: cw * ch }, (_, i) => i);
  const find = (a: number): number => {
    let x = a;
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
    return x;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a); const rb = find(b);
    if (ra === rb) return false;
    parent[ra] = rb;
    return true;
  };
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) carve(g, cx * 2 + 1, cy * 2 + 1);
  const cellId = (cx: number, cy: number) => cy * cw + cx;
  const edges: [number, number, number, number][] = [];
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const x = cx * 2 + 1; const y = cy * 2 + 1;
      if (cx + 1 < cw) edges.push([cellId(cx, cy), cellId(cx + 1, cy), x + 1, y]);
      if (cy + 1 < ch) edges.push([cellId(cx, cy), cellId(cx, cy + 1), x, y + 1]);
    }
  }
  for (let i = edges.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [edges[i], edges[j]] = [edges[j]!, edges[i]!];
  }
  for (const [a, b, wx, wy] of edges) {
    if (union(a, b)) carve(g, wx, wy);
  }
  return g;
}

/**
 * Recursive division on the CELL LATTICE (not raw pixels): every split adds
 * a wall line between cells with exactly one gap, recursing down to 1×1
 * blocks — so the preserved passages form a spanning tree (perfect maze).
 */
function division(g: Grid, rng: Rng): Grid {
  const cw = (g.w - 1) / 2;
  const ch = (g.h - 1) / 2;
  const cellOpen = new Uint8Array(cw * ch);
  const carvedCell = (cx: number, cy: number) => { cellOpen[cy * cw + cx] = 1; carve(g, cx * 2 + 1, cy * 2 + 1); };
  const passage = (cx0: number, cy0: number, cx1: number, cy1: number) => {
    carve(g, cx0 * 2 + 1, cy0 * 2 + 1);
    carve(g, cx1 * 2 + 1, cy1 * 2 + 1);
    carve(g, cx0 * 2 + 1 + (cx1 - cx0), cy0 * 2 + 1 + (cy1 - cy0));
  };
  const split = (x0: number, y0: number, x1: number, y1: number) => {
    const w = x1 - x0 + 1; const h = y1 - y0 + 1;
    if (w === 1 && h === 1) { carvedCell(x0, y0); return; }
    if (w >= h) {
      const splitAt = x0 + rng.int(0, w - 2); // wall between splitAt and splitAt+1
      const gapY = y0 + rng.int(0, h - 1);
      passage(splitAt, gapY, splitAt + 1, gapY);
      split(x0, y0, splitAt, y1);
      split(splitAt + 1, y0, x1, y1);
    } else {
      const splitAt = y0 + rng.int(0, h - 2);
      const gapX = x0 + rng.int(0, w - 1);
      passage(gapX, splitAt, gapX, splitAt + 1);
      split(x0, y0, x1, splitAt);
      split(x0, splitAt + 1, x1, y1);
    }
  };
  split(0, 0, cw - 1, ch - 1);
  void cellOpen;
  return g;
}

export function randomObstacles(g: Grid, densityPct: number, rng: Rng): Grid {
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i] !== 0) continue;
    if (rng.next() * 100 < densityPct) g.cells[i] = 1;
  }
  return g;
}
