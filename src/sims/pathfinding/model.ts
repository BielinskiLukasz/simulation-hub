// ─── Pathfinding · model.ts — trace-sim definition (pure) ──────────────────
// Conventions: ORTHO = 1000, DIAG = 1415; entering a cell costs
// base × terrainMultiplier(destination). Fixed-point integers everywhere.

import type { CornerRule, Grid } from '../../core/grid/grid';
import { cloneGrid, createGrid } from '../../core/grid/grid';
import { decodeGrid, encodeGrid } from '../../core/grid/codec';
import { generateMaze, randomObstacles, type MazeKind } from '../../core/grid/mazes';
import { applyTerrainNoise } from '../../core/grid/noise';
import { createRng } from '../../core/rng';
import type { InputSpec, ParamSchema, Rng, TraceResult } from '../../core/types';
import { search, type PathTrace, type SearchParams } from './algorithms';
import { isAdmissible, type HeuristicName } from './heuristics';
import { meta } from './meta';

export interface Input { grid: Grid; start: number; goal: number }

export interface Params extends SearchParams {
  algorithm: 'astar' | 'dijkstra' | 'bfs' | 'greedy' | 'jps';
}

export const defaultParams: Params = {
  algorithm: 'astar',
  heuristic: 'octile',
  heuristicWeight: 1,
  diagonal: true,
  corner: 'never',
  weighted: false,
};

export const paramSchema: ParamSchema<Params> = {
  algorithm: { kind: 'select', label: 'Algorithm', options: ['astar', 'dijkstra', 'bfs', 'greedy', 'jps'] },
  heuristic: { kind: 'select', label: 'Heuristic', options: ['octile', 'manhattan', 'euclidean', 'chebyshev', 'zero'] },
  heuristicWeight: { kind: 'range', label: 'Heuristic weight (weighted A*)', min: 1, max: 5, step: 0.5 },
  diagonal: { kind: 'boolean', label: '8-connected (diagonals)' },
  corner: { kind: 'select', label: 'Corner-cutting rule', options: ['never', 'oneBlocked', 'always'] },
  weighted: { kind: 'boolean', label: 'Use terrain costs', hint: 'JPS requires uniform cost and disables this' },
};

function sanitize(p: Params): Params {
  if (p.algorithm === 'jps') return { ...p, weighted: false, diagonal: true, corner: 'never' };
  return p;
}

export function inputInitial(seed: number): Input {
  const grid = generateMaze('backtracker', 41, 25, createRng(seed));
  return { grid, start: 1 * 41 + 1, goal: 23 * 41 + 39 };
}

export const input: InputSpec<Input> = {
  initial: (seed) => inputInitial(seed),
  codec: {
    encode(value) {
      return encodeGrid(value.grid, value.start, value.goal);
    },
    decode(text) {
      const doc = decodeGrid(text);
      if (!doc) return null;
      return { grid: { w: doc.w, h: doc.h, cells: doc.cells }, start: doc.start, goal: doc.goal };
    },
  },
  generators: [
    {
      id: 'maze', label: 'Maze',
      paramSchema: {
        kind: { kind: 'select', label: 'Generator', options: ['backtracker', 'prim', 'kruskal', 'division'] },
        width: { kind: 'number', label: 'Width (odd)', min: 11, max: 101, step: 2 },
        height: { kind: 'number', label: 'Height (odd)', min: 9, max: 61, step: 2 },
        seed: { kind: 'number', label: 'Seed', min: 0, step: 1 },
      },
      defaults: { kind: 'backtracker', width: 41, height: 25, seed: 42 },
      generate(current, params, rng: Rng) {
        void current; void rng;
        const w = Number(params.width) || 41;
        const h = Number(params.height) || 25;
        const grid = generateMaze(String(params.kind) as MazeKind, w, h, createRng(Number(params.seed) || 42));
        return { grid, start: 1 * grid.w + 1, goal: (grid.h - 2) * grid.w + (grid.w - 2) };
      },
    },
    {
      id: 'obstacles', label: 'Random obstacles',
      paramSchema: { density: { kind: 'range', label: 'Density', min: 5, max: 50, step: 1, unit: '%' }, seed: { kind: 'number', label: 'Seed', min: 0, step: 1 } },
      defaults: { density: 22, seed: 7 },
      generate(current, params) {
        const grid = cloneGrid(current.grid);
        randomObstacles(grid, Number(params.density) || 22, createRng(Number(params.seed) || 7));
        grid.cells[current.start] = 0; grid.cells[current.goal] = 0;
        return { ...current, grid };
      },
    },
    {
      id: 'terrain', label: 'Terrain noise',
      paramSchema: {
        scale: { kind: 'range', label: 'Scale', min: 2, max: 20, step: 1 },
        grass: { kind: 'range', label: 'Grass threshold', min: 0.2, max: 0.8, step: 0.05 },
        mud: { kind: 'range', label: 'Mud threshold', min: 0.4, max: 0.9, step: 0.05 },
        water: { kind: 'range', label: 'Water threshold', min: 0.5, max: 0.95, step: 0.05 },
        seed: { kind: 'number', label: 'Seed', min: 0, step: 1 },
      },
      defaults: { scale: 7, grass: 0.55, mud: 0.75, water: 0.88, seed: 3 },
      generate(current, params) {
        const grid = cloneGrid(current.grid);
        applyTerrainNoise(grid, {
          scale: Number(params.scale) || 7,
          grass: Number(params.grass) || 0.55,
          mud: Number(params.mud) || 0.75,
          water: Number(params.water) || 0.88,
        }, createRng(Number(params.seed) || 3));
        return { ...current, grid };
      },
    },
    {
      id: 'clear', label: 'Clear',
      paramSchema: {},
      defaults: {},
      generate(current) {
        return { ...current, grid: createGrid(current.grid.w, current.grid.h) };
      },
    },
  ],
  editor: {
    palette: [
      { value: 0, label: 'Floor', color: 0xf8fafc, hint: 'Cost ×1' },
      { value: 1, label: 'Wall', color: 0x334155, hint: 'Impassable' },
      { value: 2, label: 'Grass', color: 0x86efac, hint: 'Cost ×2' },
      { value: 5, label: 'Mud', color: 0xb45309, hint: 'Cost ×5' },
      { value: 10, label: 'Water', color: 0x60a5fa, hint: 'Cost ×10' },
    ],
    tools: ['brush', 'line', 'rect', 'fill', 'eraser'],
    eraseValue: 0,
    target: (i: Input) => i.grid,
    markers: [
      { id: 'start', label: 'S', color: 0x22c55e },
      { id: 'goal', label: 'G', color: 0xf43f5e },
    ],
    undo: true,
  },
};

/** Pure run: search + a Dijkstra reference for the “Optimal?” badge. */
export interface PathSummary extends Record<string, number | string | boolean> {
  found: boolean; cost: number; pathCells: number; expanded: number; generated: number;
  scanned: number; maxFrontier: number; optimal: boolean; optimalCost: number; admissible: boolean;
}

export function runPathfinding(inputValue: Input, paramsRaw: Params): TraceResult<PathTrace> & { summary: PathSummary } {
  const params = sanitize(paramsRaw);
  const trace = search(inputValue.grid, inputValue.start, inputValue.goal, params);
  const refParams: Params = { ...params, algorithm: 'dijkstra', heuristic: 'zero', heuristicWeight: 1 };
  const ref = search(inputValue.grid, inputValue.start, inputValue.goal, refParams);
  const optimal = trace.summary.found === ref.summary.found && trace.summary.cost === ref.summary.cost;
  const summary = {
    ...trace.summary,
    optimal,
    optimalCost: ref.summary.cost,
    admissible: isAdmissible(params.heuristic, params.diagonal, params.heuristicWeight),
  };
  trace.summary.optimal = optimal;
  trace.summary.optimalCost = ref.summary.cost;
  return {
    length: trace.kind.length,
    summary: summary as PathSummary,
    work: { label: 'expansions', cumulative: trace.expandedCum },
    data: trace,
  };
}

export const pathfindingSim = {
  kind: 'trace',
  meta,
  defaultParams,
  paramSchema,
  input,
  run: runPathfinding,
  about: {
    summary:
      'Five pathfinders on the same editable weighted grid. Every expansion, open, update and scan is recorded as an integer-cost step, so playback can scrub backwards exactly — including searches that reopen closed nodes (inconsistent heuristics).',
    bullets: [
      'Yellow = final path · indigo = expanded/closed · blue = frontier · faint cyan = scanned (JPS jumps).',
      'Paint walls, grass (×2), mud (×5) and water (×10); drag S/G. Toggle “Use terrain costs” to see why BFS is not cost-optimal.',
      'The admissibility badge explains Manhattan + diagonals: it overestimates, so the “Optimal?” badge can go red — compare against Dijkstra in Compare mode.',
      'JPS forces uniform cost, 8-connected, corner=never: few expansions, many scans. That contrast is the point.',
      'Race A* against Dijkstra synchronised by expansions (work), not raw steps.',
    ],
    invariant: 'Dijkstra, A*(zero/octile) and JPS agree on cost; every path is legal and its recomputed cost matches.',
  },
};

export type { PathTrace, SearchParams, CornerRule, Grid, HeuristicName };
