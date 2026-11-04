// ─── core/grid/grid.ts — typed-array grid + neighbour math (no DOM) ────────

export interface Grid {
  w: number;
  h: number;
  cells: Uint8Array;
}

export const idx = (g: { w: number }, x: number, y: number): number => y * g.w + x;

export type CornerRule = 'never' | 'oneBlocked' | 'always';

export function createGrid(w: number, h: number, fill = 0): Grid {
  const cells = new Uint8Array(w * h);
  if (fill) cells.fill(fill);
  return { w, h, cells };
}

export function cloneGrid(g: Grid): Grid {
  return { w: g.w, h: g.h, cells: g.cells.slice() };
}

export function inBounds(g: { w: number; h: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.w && y < g.h;
}

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const DIAGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * Write neighbours of index `i` into `out`, return count. Allocation-free.
 * Diagonal corner rules: never → both orthogonals must be free;
 * oneBlocked → at most one may be blocked; always → squeeze allowed.
 */
export function neighbors(
  g: Grid,
  i: number,
  diagonal: boolean,
  corner: CornerRule,
  isBlocked: (value: number) => boolean,
  out: Int32Array,
): number {
  const x = i % g.w;
  const y = (i / g.w) | 0;
  let n = 0;
  for (const [dx, dy] of ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(g, nx, ny)) continue;
    if (isBlocked(g.cells[ny * g.w + nx]!)) continue;
    if (n < out.length) out[n++] = ny * g.w + nx;
  }
  if (diagonal) {
    for (const [dx, dy] of DIAGS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(g, nx, ny)) continue;
      if (isBlocked(g.cells[ny * g.w + nx]!)) continue;
      if (corner !== 'always') {
        const bx = isBlocked(g.cells[y * g.w + (x + dx)]!);
        const by = isBlocked(g.cells[(y + dy) * g.w + x]!);
        if (corner === 'never' && (bx || by)) continue;
        if (corner === 'oneBlocked' && bx && by) continue;
      }
      if (n < out.length) out[n++] = ny * g.w + nx;
    }
  }
  return n;
}

export function* neighborList(
  g: Grid,
  i: number,
  diagonal: boolean,
  corner: CornerRule,
  isBlocked: (value: number) => boolean,
): Generator<number> {
  const x = i % g.w;
  const y = (i / g.w) | 0;
  for (const [dx, dy] of ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(g, nx, ny) && !isBlocked(g.cells[ny * g.w + nx]!)) yield ny * g.w + nx;
  }
  if (!diagonal) return;
  for (const [dx, dy] of DIAGS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(g, nx, ny) || isBlocked(g.cells[ny * g.w + nx]!)) continue;
    if (corner !== 'always') {
      const bx = isBlocked(g.cells[y * g.w + (x + dx)]!);
      const by = isBlocked(g.cells[(y + dy) * g.w + x]!);
      if (corner === 'never' && (bx || by)) continue;
      if (corner === 'oneBlocked' && bx && by) continue;
    }
    yield ny * g.w + nx;
  }
}

/** Incremental is the movement diagonal? (for path costs) */
export function isDiagonal(from: number, to: number, w: number): boolean {
  const fx = from % w;
  const fy = (from / w) | 0;
  const tx = to % w;
  const ty = (to / w) | 0;
  return fx !== tx && fy !== ty;
}
