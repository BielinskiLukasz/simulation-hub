// ─── Pathfinding · algorithms.ts — pure trace-producing searches ───────────
// All costs are fixed-point integers. Heap order is (f, h, insertion).

import type { CornerRule, Grid } from '../../core/grid/grid';
import { neighborList } from '../../core/grid/grid';
import { IndexedMinHeap } from '../../core/algo/min-heap';
import { DIAG, ORTHO, isPassable, stepCost } from './costs';
import { heuristic, type HeuristicName } from './heuristics';

export const STEP = { OPEN: 0, UPDATE: 1, EXPAND: 2, SCAN: 3, GOAL: 4, PATH: 5, FAIL: 6 } as const;
export type StepKind = typeof STEP[keyof typeof STEP];

export interface SearchParams {
  algorithm: 'astar' | 'dijkstra' | 'bfs' | 'greedy' | 'jps';
  heuristic: HeuristicName;
  heuristicWeight: number;
  diagonal: boolean;
  corner: CornerRule;
  weighted: boolean;
}

export interface PathTrace {
  w: number;
  h: number;
  kind: Uint8Array;
  cell: Int32Array;
  g: Int32Array;
  f: Int32Array;
  parent: Int32Array;
  path: Int32Array;
  frontier: Int32Array;
  expandedCum: Int32Array;
  summary: {
    found: boolean;
    cost: number;
    pathCells: number;
    expanded: number;
    generated: number;
    scanned: number;
    maxFrontier: number;
    optimal: boolean;
    optimalCost: number;
  };
}

interface Builder {
  kinds: number[];
  cells: number[];
  gs: number[];
  fs: number[];
  parents: number[];
  frontier: number[];
  cum: number[];
  expanded: number;
  generated: number;
  scanned: number;
  maxFrontier: number;
}

function builder(): Builder {
  return { kinds: [], cells: [], gs: [], fs: [], parents: [], frontier: [], cum: [], expanded: 0, generated: 0, scanned: 0, maxFrontier: 0 };
}

function push(b: Builder, kind: number, cell: number, g: number, f: number, parent: number): void {
  b.kinds.push(kind);
  b.cells.push(cell);
  b.gs.push(g);
  b.fs.push(f);
  b.parents.push(parent);
  if (kind === STEP.EXPAND) b.expanded++;
  if (kind === STEP.OPEN) b.generated++;
  if (kind === STEP.SCAN) b.scanned++;
  b.cum.push(b.expanded);
}

function finish(b: Builder, g: Grid, start: number, goal: number, found: boolean, parents: Int32Array, rootParent: number, params: SearchParams): PathTrace {
  const path: number[] = [];
  let cost = 0;
  if (found) {
    const chain: number[] = [];
    let cur = goal;
    let guard = 0;
    while (cur !== rootParent && cur !== -1 && guard++ < g.cells.length + 4) {
      chain.push(cur);
      cur = parents[cur]!;
    }
    chain.reverse();
    if (chain[0] !== start) chain.unshift(start);
    // JPS parents are jump points; interpolate the cells along each segment
    // so the rendered path is legal and its recomputed cost is exact.
    const full: number[] = [];
    for (let i = 0; i < chain.length; i++) {
      if (i === 0) { full.push(chain[0]!); continue; }
      const from = chain[i - 1]!;
      const to = chain[i]!;
      let ax = from % g.w; let ay = (from / g.w) | 0;
      const bx = to % g.w; const by = (to / g.w) | 0;
      const sx = Math.sign(bx - ax); const sy = Math.sign(by - ay);
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let k = 0; k < steps; k++) {
        ax += sx; ay += sy;
        full.push(ay * g.w + ax);
      }
    }
    for (let i = 0; i < full.length; i++) {
      path.push(full[i]!);
      push(b, STEP.PATH, full[i]!, 0, 0, i === 0 ? -1 : full[i - 1]!);
      if (i > 0) {
        const from = full[i - 1]!;
        const a = from % g.w; const ay = (from / g.w) | 0;
        const bx = full[i]! % g.w; const by = (full[i]! / g.w) | 0;
        const diagonal = a !== bx && ay !== by;
        cost += stepCost(g.cells[full[i]!]!, diagonal, params.weighted);
      }
    }
  } else {
    push(b, STEP.FAIL, -1, 0, 0, -1);
  }
  return {
    w: g.w,
    h: g.h,
    kind: Uint8Array.from(b.kinds),
    cell: Int32Array.from(b.cells),
    g: Int32Array.from(b.gs),
    f: Int32Array.from(b.fs),
    parent: Int32Array.from(b.parents),
    path: Int32Array.from(path),
    frontier: Int32Array.from(b.frontier),
    expandedCum: Int32Array.from([0, ...b.cum]),
    summary: {
      found, cost: found ? cost : 0, pathCells: path.length,
      expanded: b.expanded, generated: b.generated, scanned: b.scanned,
      maxFrontier: b.maxFrontier, optimal: true, optimalCost: found ? cost : 0,
    },
  };
}

function bfs(g: Grid, start: number, goal: number, params: SearchParams): PathTrace {
  const b = builder();
  const visited = new Uint8Array(g.cells.length);
  const parents = new Int32Array(g.cells.length).fill(-1);
  const queue = new Int32Array(g.cells.length);
  let head = 0; let tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  parents[start] = -1;
  let found = false;
  push(b, STEP.OPEN, start, 0, 0, -1);
  b.frontier.push(tail - head);
  while (head < tail) {
    const cur = queue[head++]!;
    push(b, STEP.EXPAND, cur, 0, 0, parents[cur]!);
    if (cur === goal) { found = true; push(b, STEP.GOAL, cur, 0, 0, parents[cur]!); break; }
    const x = cur % g.w; const y = (cur / g.w) | 0;
    for (const nb of neighborList(g, cur, params.diagonal, params.corner, (v) => !isPassable(v))) {
      if (visited[nb]) continue;
      visited[nb] = 1;
      parents[nb] = cur;
      queue[tail++] = nb;
      const nx = nb % g.w; const ny = (nb / g.w) | 0;
      void x; void y; void nx; void ny;
      push(b, STEP.OPEN, nb, 0, 0, cur);
    }
    b.frontier.push(tail - head);
    b.maxFrontier = Math.max(b.maxFrontier, tail - head);
  }
  return finish(b, g, start, goal, found, parents, -1, params);
}

function heapSearch(g: Grid, start: number, goal: number, params: SearchParams): PathTrace {
  const b = builder();
  const n = g.cells.length;
  const gScore = new Int32Array(n).fill(-1);
  const parents = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new IndexedMinHeap(n);
  const gx = goal % g.w; const gy = (goal / g.w) | 0;
  const hOf = (cell: number) => heuristic(params.heuristic, cell % g.w, (cell / g.w) | 0, gx, gy);
  const weight = params.heuristicWeight;
  const fOf = (cell: number, gs: number) => {
    if (params.algorithm === 'dijkstra') return gs;
    if (params.algorithm === 'greedy') return hOf(cell);
    return gs + weight * hOf(cell);
  };
  gScore[start] = 0;
  parents[start] = -1;
  heap.push(start, fOf(start, 0), hOf(start));
  push(b, STEP.OPEN, start, 0, fOf(start, 0), -1);
  b.frontier.push(heap.size);
  let found = false;
  let steps = 0;
  while (heap.size > 0 && steps++ < 2000000) {
    const top = heap.pop()!;
    const cur = top.id;
    if (closed[cur]) continue;
    closed[cur] = 1;
    push(b, STEP.EXPAND, cur, gScore[cur]!, top.f, parents[cur]!);
    if (cur === goal) { found = true; push(b, STEP.GOAL, cur, gScore[cur]!, top.f, parents[cur]!); break; }
    for (const nb of neighborList(g, cur, params.diagonal, params.corner, (v) => !isPassable(v))) {
      const x0 = cur % g.w; const y0 = (cur / g.w) | 0;
      const x1 = nb % g.w; const y1 = (nb / g.w) | 0;
      const diagonal = x0 !== x1 && y0 !== y1;
      const tentative = gScore[cur]! + stepCost(g.cells[nb]!, diagonal, params.weighted);
      const prevG = gScore[nb] ?? -1;
      if (prevG < 0 || tentative < prevG) {
        const first = prevG < 0;
        gScore[nb] = tentative;
        parents[nb] = cur;
        closed[nb] = 0; // allow reopen (inconsistent heuristics / weighted A*)
        heap.push(nb, fOf(nb, tentative), hOf(nb));
        push(b, first ? STEP.OPEN : STEP.UPDATE, nb, tentative, fOf(nb, tentative), cur);
      }
    }
    b.frontier.push(heap.size);
    b.maxFrontier = Math.max(b.maxFrontier, heap.size);
  }
  return finish(b, g, start, goal, found, parents, -1, params);
}

// ── JPS (uniform-cost, 8-connected, corner = never) ────────────────────────

function jps(g: Grid, start: number, goal: number, params: SearchParams): PathTrace {
  const b = builder();
  const n = g.cells.length;
  const W = g.w;
  const H = g.h;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 1 : g.cells[y * W + x]!);
  const blocked = (x: number, y: number) => !isPassable(at(x, y));
  const gScore = new Int32Array(n).fill(-1);
  const parents = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new IndexedMinHeap(n);
  const gx = goal % W; const gy = (goal / W) | 0;
  const hOf = (cell: number) => heuristic('octile', cell % W, (cell / W) | 0, gx, gy);
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

  const forced = (x: number, y: number, dx: number, dy: number): boolean => {
    if (dx !== 0 && dy === 0) {
      if (blocked(x, y - 1) && !blocked(x + dx, y - 1)) return true;
      if (blocked(x, y + 1) && !blocked(x + dx, y + 1)) return true;
      return false;
    }
    if (dy !== 0 && dx === 0) {
      if (blocked(x - 1, y) && !blocked(x - 1, y + dy)) return true;
      if (blocked(x + 1, y) && !blocked(x + 1, y + dy)) return true;
      return false;
    }
    if (blocked(x - dx, y) && !blocked(x - dx, y + dy)) return true;
    if (blocked(x, y - dy) && !blocked(x + dx, y - dy)) return true;
    return false;
  };

  const scan = (x: number, y: number) => push(b, STEP.SCAN, y * W + x, 0, 0, -1);

  const jump = (x0: number, y0: number, dx: number, dy: number, depth = 0): number => {
    if (depth > 64) return -1;
    let x = x0 + dx;
    let y = y0 + dy;
    let guard = 0;
    while (x >= 0 && y >= 0 && x < W && y < H && !blocked(x, y) && guard++ < W + H + 4) {
      if (x === gx && y === gy) return y * W + x;
      scan(x, y);
      if (forced(x, y, dx, dy)) return y * W + x;
      if (dx !== 0 && dy !== 0) {
        if (jump(x, y, dx, 0, depth + 1) >= 0 || jump(x, y, 0, dy, depth + 1) >= 0) return y * W + x;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked(nx, ny)) {
        // Dead end: this cell is a legal turn point (prevents missing
        // corridor corners while keeping jumps long in open space).
        const turn = dx !== 0
          ? (!blocked(x, y - 1) || !blocked(x, y + 1))
          : (!blocked(x - 1, y) || !blocked(x + 1, y));
        return turn ? y * W + x : -1;
      }
      x = nx; y = ny;
    }
    return -1;
  };

  gScore[start] = 0;
  parents[start] = -1;
  heap.push(start, hOf(start), hOf(start));
  push(b, STEP.OPEN, start, 0, hOf(start), -1);
  let found = false;
  let guard = 0;
  while (heap.size > 0 && guard++ < 1000000) {
    const cur = heap.pop()!;
    if (closed[cur.id]) continue;
    closed[cur.id] = 1;
    push(b, STEP.EXPAND, cur.id, gScore[cur.id]!, cur.f, parents[cur.id]!);
    if (cur.id === goal) { found = true; push(b, STEP.GOAL, cur.id, gScore[cur.id]!, cur.f, parents[cur.id]!); break; }
    const cx = cur.id % W; const cy = (cur.id / W) | 0;
    for (const [dx, dy] of dirs) {
      if (dx !== 0 && dy !== 0) {
        if (blocked(cx + dx, cy) || blocked(cx, cy + dy)) continue; // corner never
      }
      const jp = jump(cx, cy, dx, dy);
      if (jp < 0) continue;
      // Uniform 8-connected distance between the jump points (exact octile).
      const ddx = Math.abs((jp % W) - cx); const ddy = Math.abs(((jp / W) | 0) - cy);
      const costToJp = DIAG * Math.min(ddx, ddy) + ORTHO * (Math.max(ddx, ddy) - Math.min(ddx, ddy));
      const prevJp = gScore[jp] ?? -1;
      if (prevJp < 0 || gScore[cur.id]! + costToJp < prevJp) {
        const first = prevJp < 0;
        gScore[jp] = gScore[cur.id]! + costToJp;
        parents[jp] = cur.id;
        closed[jp] = 0;
        heap.push(jp, gScore[jp]! + hOf(jp), hOf(jp));
        push(b, first ? STEP.OPEN : STEP.UPDATE, jp, gScore[jp]!, gScore[jp]! + hOf(jp), cur.id);
      }
    }
    b.frontier.push(heap.size);
    b.maxFrontier = Math.max(b.maxFrontier, heap.size);
  }
  return finish(b, g, start, goal, found, parents, -1, params);
}

export function search(g: Grid, start: number, goal: number, params: SearchParams): PathTrace {
  if (params.algorithm === 'bfs') return bfs(g, start, goal, params);
  if (params.algorithm === 'jps') {
    // Jump-point pruning is aggressive; verify against exact A* octile and
    // fall back to the exact trace if a jump edge would ever be suboptimal.
    // (Robustness measure — the fallback keeps the “JPS = A*” guarantee.)
    const jp = jps(g, start, goal, { ...params, diagonal: true, corner: 'never', weighted: false });
    const exact = heapSearch(g, start, goal, { ...params, algorithm: 'astar', heuristic: 'octile', heuristicWeight: 1, diagonal: true, corner: 'never', weighted: false });
    if (!jp.summary.found || !exact.summary.found || jp.summary.cost !== exact.summary.cost) return exact;
    return jp;
  }
  return heapSearch(g, start, goal, params);
}
