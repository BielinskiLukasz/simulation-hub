// ─── Game of Life · logic.ts ────────────────────────────────────────────────
// PURE (ESLint-enforced). Conway B3/S23 on a Uint8Array double buffer.
// World is the fixed 800×600 logical stage; cellSize picks the grid
// (80×60 at 10 px). Age array colours long-lived cells.

import type { ParamSchema, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';

export interface Params {
  pattern: string; // 'random' | 'glider' | 'pulsar' | 'gosper-gun' | 'acorn'
  density: number; // random-soup fill probability
  cellSize: number; // px per cell (grid = 800/cellSize × 600/cellSize)
  wrap: boolean; // toroidal edges (live)
}

export const defaultParams: Params = {
  pattern: 'random',
  density: 0.22,
  cellSize: 10,
  wrap: true,
};

export const paramSchema: ParamSchema<Params> = {
  pattern: { kind: 'select', label: 'Starting pattern', options: ['random', 'glider', 'pulsar', 'gosper-gun', 'acorn'], hint: 'Re-inits the grid' },
  density: { kind: 'range', label: 'Soup density', min: 0.05, max: 0.6, step: 0.01, hint: 'Used by random / acorn seeding' },
  cellSize: { kind: 'range', label: 'Cell size', min: 5, max: 25, step: 1, unit: 'px', hint: 'Smaller = larger grid (re-inits)' },
  wrap: { kind: 'boolean', label: 'Wrap edges (torus)', live: true },
};

export const WORLD = { w: 800, h: 600 } as const;

export interface State {
  cols: number;
  rows: number;
  cells: Uint8Array;
  next: Uint8Array;
  age: Uint16Array;
  nextAge: Uint16Array;
  generation: number;
  alive: number;
  rng: Rng;
  params: Params;
  w: number;
  h: number;
}

function place(state: State, patternRows: string[], ox: number, oy: number): void {
  for (let y = 0; y < patternRows.length; y++) {
    const row = patternRows[y]!;
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'O') continue;
      const cx = ox + x;
      const cy = oy + y;
      if (cx >= 0 && cx < state.cols && cy >= 0 && cy < state.rows) {
        state.cells[cy * state.cols + cx] = 1;
        state.age[cy * state.cols + cx] = 1;
      }
    }
  }
}

const GLIDER = ['.O.', '..O', 'OOO'];
const PULSAR = [
  '..OOO...OOO..',
  '.............',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '..OOO...OOO..',
  '.............',
  '..OOO...OOO..',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '.............',
  '..OOO...OOO..',
];
const GUN = [
  '........................O...........',
  '......................O.O...........',
  '............OO......OO............OO',
  '...........O...O....OO............OO',
  'OO........O.....O...OO..............',
  'OO........O...O.O....O.O............',
  '..........O.....O......O............',
  '...........O...O....................',
  '............OO......................',
];
const ACORN = ['.O.....', '...O...', 'OO..OOO'];

export function init(params: Params, rng: Rng): State {
  const cols = Math.max(10, Math.floor(WORLD.w / params.cellSize));
  const rows = Math.max(10, Math.floor(WORLD.h / params.cellSize));
  const state: State = {
    cols, rows,
    cells: new Uint8Array(cols * rows),
    next: new Uint8Array(cols * rows),
    age: new Uint16Array(cols * rows),
    nextAge: new Uint16Array(cols * rows),
    generation: 0, alive: 0, rng, params: { ...params }, w: WORLD.w, h: WORLD.h,
  };

  switch (params.pattern) {
    case 'glider':
      for (const [ox, oy] of [[4, 4], [24, 14], [44, 8], [14, 34], [54, 28]] as const) place(state, GLIDER, ox, oy);
      break;
    case 'pulsar':
      place(state, PULSAR, Math.floor(cols / 2) - 6, Math.floor(rows / 2) - 6);
      place(state, PULSAR, Math.floor(cols / 4) - 6, Math.floor(rows / 4) - 6);
      break;
    case 'gosper-gun':
      place(state, GUN, 2, Math.floor(rows / 2) - 12);
      place(state, GLIDER, Math.floor(cols * 0.6), Math.floor(rows * 0.6));
      break;
    case 'acorn':
      place(state, ACORN, Math.floor(cols / 2) - 3, Math.floor(rows / 2) - 1);
      break;
    default: // random soup (also the base for 'acorn' handled above when chosen alone)
      for (let i = 0; i < state.cells.length; i++) {
        if (rng.next() < params.density) { state.cells[i] = 1; state.age[i] = 1; }
      }
  }
  if (params.pattern === 'acorn') {
    // a light random sprinkle around the acorn makes runs seed-dependent
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i] === 0 && rng.next() < params.density * 0.15) { state.cells[i] = 1; state.age[i] = 1; }
    }
  }
  let alive = 0;
  for (let i = 0; i < state.cells.length; i++) alive += state.cells[i]!;
  state.alive = alive;
  return state;
}

export function step(state: State, _dt: number): State {
  void _dt; // one runner step (fixed 1/60 s) = exactly one generation
  const { cols, rows, cells, next, age, nextAge, params } = state;
  const wrap = params.wrap;
  let alive = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          let nx = x + dx;
          let ny = y + dy;
          if (wrap) {
            nx = (nx + cols) % cols;
            ny = (ny + rows) % rows;
          } else if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
            continue;
          }
          n += cells[ny * cols + nx]!;
        }
      }
      const idx = y * cols + x;
      const aliveNow = cells[idx] === 1;
      const lives = aliveNow ? n === 2 || n === 3 : n === 3;
      next[idx] = lives ? 1 : 0;
      nextAge[idx] = lives ? (aliveNow ? Math.min(age[idx]! + 1, 999) : 1) : 0;
      if (lives) alive++;
    }
  }
  state.cells.set(next);
  state.age.set(nextAge);
  state.alive = alive;
  state.generation++;
  return state;
}

/** Live: edge mode applies instantly; painting keeps working. */
export function applyParams(state: State, params: Params): State {
  state.params = { ...params };
  return state;
}

/** Pointer: paint cells (Shift or right-button erases), drag to draw. */
export function onPointer(state: State, ev: PointerEv): State {
  if (ev.type !== 'down' && !(ev.type === 'move' && ev.pressed)) return state;
  const cs = state.w / state.cols;
  const cx = Math.floor(ev.x / cs);
  const cy = Math.floor(ev.y / (state.h / state.rows));
  if (cx < 0 || cx >= state.cols || cy < 0 || cy >= state.rows) return state;
  const erase = ev.shift || ev.button === 2;
  const idx = cy * state.cols + cx;
  const was = state.cells[idx]!;
  state.cells[idx] = erase ? 0 : 1;
  state.age[idx] = erase ? 0 : 1;
  if (was !== state.cells[idx]) state.alive += erase ? -1 : 1;
  return state;
}
