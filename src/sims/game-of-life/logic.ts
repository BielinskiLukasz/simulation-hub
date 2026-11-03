import type { ParamSchema, Rng } from '../../core/types';

export const RULES = {
  life: { label: 'Life B3/S23', birth: [3], survive: [2, 3] },
  highlife: { label: 'HighLife B36/S23', birth: [3, 6], survive: [2, 3] },
  maze: { label: 'Maze B3/S12345', birth: [3], survive: [1, 2, 3, 4, 5] },
  daynight: { label: 'Day & Night B3678/S34678', birth: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] },
  seeds: { label: 'Seeds B2/S', birth: [2], survive: [] },
} as const;

export type RuleId = keyof typeof RULES;

export const RULE_OPTIONS = Object.keys(RULES) as RuleId[];

export interface Params {
  cell: number;
  density: number;
  rule: RuleId;
  rate: number;
  grid: boolean;
  palette: 'mono' | 'age';
  color: string;
}

export const defaultParams: Params = {
  cell: 8,
  density: 0.26,
  rule: 'life',
  rate: 18,
  grid: true,
  palette: 'age',
  color: '#4dd6b4',
};

export const paramSchema: ParamSchema<Params> = {
  cell: { kind: 'range', label: 'Cell size', min: 3, max: 20, step: 1, unit: 'px' },
  density: { kind: 'range', label: 'Seed density', min: 0.02, max: 0.9, step: 0.01 },
  rule: { kind: 'select', label: 'Rule-set', options: RULE_OPTIONS },
  rate: { kind: 'range', label: 'Generations / sec', min: 1, max: 60, step: 1 },
  grid: { kind: 'boolean', label: 'Show grid' },
  palette: { kind: 'select', label: 'Palette', options: ['mono', 'age'] },
  color: { kind: 'color', label: 'Ink (mono palette)' },
};

export const WORLD = { w: 800, h: 600 };
const MAX_TRAIL_AGE = 512;

export interface State {
  cols: number;
  rows: number;
  cells: Uint8Array;
  next: Uint8Array;
  age: Uint16Array;
  acc: number;
  gen: number;
  alive: number;
  t: number;
  params: Params;
  rng: Rng;
}

export function init(params: Params, rng: Rng): State {
  const cell = Math.max(2, Math.round(params.cell));
  const cols = Math.max(4, Math.floor(WORLD.w / cell));
  const rows = Math.max(4, Math.floor(WORLD.h / cell));
  const cells = new Uint8Array(cols * rows);

  let alive = 0;
  for (let i = 0; i < cells.length; i++) {
    const on = rng.next() < params.density ? 1 : 0;
    cells[i] = on;
    alive += on;
  }

  return {
    cols,
    rows,
    cells,
    next: new Uint8Array(cols * rows),
    age: new Uint16Array(cols * rows),
    acc: 0,
    gen: 0,
    alive,
    t: 0,
    params,
    rng,
  };
}

/** One discrete generation. Exported so tests can poke at known patterns. */
export function generation(state: State): void {
  const { cols, rows, cells, next, age, params } = state;
  const rule = RULES[params.rule] ?? RULES.life;

  const born = new Uint8Array(9);
  const survives = new Uint8Array(9);
  for (const n of rule.birth) born[n] = 1;
  for (const n of rule.survive) survives[n] = 1;

  let alive = 0;

  for (let y = 0; y < rows; y++) {
    const up = ((y - 1 + rows) % rows) * cols;
    const mid = y * cols;
    const down = ((y + 1) % rows) * cols;

    for (let x = 0; x < cols; x++) {
      const left = (x - 1 + cols) % cols;
      const right = (x + 1) % cols;

      const n =
        cells[up + left]! +
        cells[up + x]! +
        cells[up + right]! +
        cells[mid + left]! +
        cells[mid + right]! +
        cells[down + left]! +
        cells[down + x]! +
        cells[down + right]!;

      const i = mid + x;
      const wasAlive = cells[i] === 1;
      const isAlive = wasAlive ? survives[n] === 1 : born[n] === 1;
      next[i] = isAlive ? 1 : 0;

      if (isAlive) {
        alive++;
        age[i] = wasAlive ? Math.min(age[i]! + 1, MAX_TRAIL_AGE) : 1;
      } else {
        age[i] = 0;
      }
    }
  }

  // swap buffers
  state.cells = next;
  state.next = cells;
  state.alive = alive;
  state.gen++;
}

export function step(state: State, dt: number): State {
  const rate = Math.max(1, state.params.rate);
  const per = 1 / rate;
  state.acc += dt;

  let guard = 0;
  while (state.acc >= per && guard < 6) {
    generation(state);
    state.acc -= per;
    guard++;
  }
  if (state.acc > per * 6) state.acc = 0;

  state.t += dt;
  return state;
}

/** Test helper: clear the grid (tests then set cells directly). */
export function clear(state: State): void {
  state.cells.fill(0);
  state.age.fill(0);
  state.alive = 0;
}
