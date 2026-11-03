import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, snapshot, step, type Params, type State } from './logic';

const DT = 1 / 60;

function make(overrides: Partial<Params> = {}, seed = 17): State {
  return init({ ...defaultParams, ...overrides }, createRng(seed));
}

function run(state: State, seconds: number): State {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) step(state, DT);
  return state;
}

describe('predator-prey · determinism', () => {
  it('same seed + params → identical populations and agent footage', () => {
    const a = run(make({}, 5), 10);
    const b = run(make({}, 5), 10);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.preyAgents.map((p) => p.x)).toEqual(b.preyAgents.map((p) => p.x));
  });

  it('different seeds give identical populations but different agent footage', () => {
    // sample early: later in the cycle the prey crash empties the agent pool
    const a = run(make({}, 1), 1);
    const b = run(make({}, 2), 1);
    expect(a.preyAgents.length).toBeGreaterThan(0);
    // the ODE is seed-independent — only the visualisation uses the rng
    expect(a.prey).toBeCloseTo(b.prey, 9);
    expect(a.preyAgents.map((p) => p.x)).not.toEqual(b.preyAgents.map((p) => p.x));
  });
});

describe('predator-prey · analytic invariants', () => {
  it('with no predation, prey grows exactly exponentially', () => {
    const state = run(make({ prey0: 10, pred0: 0, beta: 0, alpha: 1.1, wander: false }), 1);
    const expected = 10 * Math.exp(1.1 * state.t);
    expect(Math.abs(state.prey - expected) / expected).toBeLessThan(0.01);
    expect(state.pred).toBe(0);
  });

  it('with no prey, predators decay exponentially', () => {
    const state = run(make({ prey0: 0, pred0: 20, gamma: 0.4, wander: false }), 2);
    const expected = 20 * Math.exp(-0.4 * state.t);
    expect(Math.abs(state.pred - expected) / expected).toBeLessThan(0.01);
  });

  it('populations stay finite and non-negative through a full boom-bust cycle', () => {
    const state = run(make({}, 9), 40);
    expect(state.prey).toBeGreaterThanOrEqual(0);
    expect(state.pred).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(state.prey)).toBe(true);
    expect(Number.isFinite(state.pred)).toBe(true);
    expect(state.peakPrey).toBeGreaterThanOrEqual(state.prey);
  });

  it('the cycle really oscillates (not a fixed point)', () => {
    const state = make({}, 9);
    const samples: number[] = [];
    for (let i = 0; i < 60 * 20; i++) {
      step(state, DT);
      if (i % 60 === 0) samples.push(state.prey);
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max / Math.max(min, 1e-6)).toBeGreaterThan(2);
  });

  it('never draws more agents than maxAgents', () => {
    const state = run(make({ maxAgents: 80 }, 4), 12);
    expect(state.preyAgents.length).toBeLessThanOrEqual(80);
    expect(state.predAgents.length).toBeLessThanOrEqual(80);
  });
});
