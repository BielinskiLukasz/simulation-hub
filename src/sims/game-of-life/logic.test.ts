import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, generation, init, step, type Params, type State } from './logic';

function make(overrides: Partial<Params> = {}, seed = 99): State {
  return init({ ...defaultParams, ...overrides }, createRng(seed));
}

function aliveSet(state: State): number[] {
  const out: number[] = [];
  state.cells.forEach((v, i) => {
    if (v === 1) out.push(i);
  });
  return out;
}

function set(state: State, x: number, y: number, v = 1): void {
  state.cells[y * state.cols + x] = v;
}
function get(state: State, x: number, y: number): number {
  return state.cells[y * state.cols + x]!;
}

describe('game-of-life · determinism', () => {
  it('same seed + params → identical grid after 120 generations', () => {
    const a = make({ cell: 10 }, 5);
    const b = make({ cell: 10 }, 5);
    for (let i = 0; i < 120; i++) {
      generation(a);
      generation(b);
    }
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
    expect(a.gen).toBe(b.gen);
  });

  it('different seeds diverge', () => {
    const a = make({}, 1);
    const b = make({}, 2);
    for (let i = 0; i < 20; i++) {
      generation(a);
      generation(b);
    }
    expect(Array.from(a.cells)).not.toEqual(Array.from(b.cells));
  });

  it('cell size decides the grid dimensions', () => {
    expect(make({ cell: 8 }).cols).toBe(100);
    expect(make({ cell: 8 }).rows).toBe(75);
  });
});

describe('game-of-life · B3/S23 invariants', () => {
  it('an empty grid stays empty', () => {
    const state = make({ density: 0.02 }, 3);
    state.cells.fill(0);
    generation(state);
    expect(state.alive).toBe(0);
  });

  it('a block is a still life', () => {
    const state = make({}, 3);
    state.cells.fill(0);
    set(state, 10, 10);
    set(state, 11, 10);
    set(state, 10, 11);
    set(state, 11, 11);
    generation(state);
    expect(aliveSet(state)).toEqual([10 + 10 * state.cols, 11 + 10 * state.cols, 10 + 11 * state.cols, 11 + 11 * state.cols].sort((p, q) => p - q));
  });

  it('a blinker has period 2', () => {
    const state = make({}, 3);
    state.cells.fill(0);
    set(state, 10, 9);
    set(state, 10, 10);
    set(state, 10, 11);
    generation(state);
    expect([get(state, 9, 10), get(state, 10, 10), get(state, 11, 10)]).toEqual([1, 1, 1]);
    expect(state.alive).toBe(3);
    generation(state);
    expect([get(state, 10, 9), get(state, 10, 10), get(state, 10, 11)]).toEqual([1, 1, 1]);
  });

  it('a lone cell dies of loneliness', () => {
    const state = make({}, 3);
    state.cells.fill(0);
    set(state, 20, 20);
    generation(state);
    expect(get(state, 20, 20)).toBe(0);
  });

  it('alive count always stays inside [0, cols*rows] and never goes NaN', () => {
    const state = make({ density: 0.5, rule: 'highlife' }, 21);
    for (let i = 0; i < 200; i++) {
      step(state, 1 / 60);
      expect(state.alive).toBeGreaterThanOrEqual(0);
      expect(state.alive).toBeLessThanOrEqual(state.cols * state.rows);
      expect(Number.isFinite(state.acc)).toBe(true);
    }
  });

  it('wraps around the torus instead of dying at the border', () => {
    const state = make({}, 3);
    state.cells.fill(0);
    const y = 0;
    set(state, state.cols - 1, y);
    set(state, 0, y);
    set(state, 1, y);
    generation(state);
    // the wrapped horizontal blinker must flip to vertical at all three columns
    expect(get(state, 0, state.rows - 1)).toBe(1);
    expect(get(state, 0, 1)).toBe(1);
  });
});

describe('game-of-life · timing', () => {
  it('emits whole generations only, at the configured rate', () => {
    const state = make({ rate: 10 }, 4);
    step(state, 1 / 60); // 16 ms of a 100 ms generation
    expect(state.gen).toBe(0);
    step(state, 0.1);
    expect(state.gen).toBe(1);
  });
});
