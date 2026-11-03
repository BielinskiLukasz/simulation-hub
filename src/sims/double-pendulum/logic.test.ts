import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, energy, init, snapshot, step, type Params, type State } from './logic';

const DT = 1 / 60;

function make(overrides: Partial<Params> = {}, seed = 8): State {
  return init({ ...defaultParams, ...overrides }, createRng(seed));
}

function run(state: State, steps: number): State {
  for (let i = 0; i < steps; i++) step(state, DT);
  return state;
}

describe('double-pendulum · determinism', () => {
  it('same seed → bit-identical run after 900 steps', () => {
    const a = run(make({ arms: 6 }, 12), 900);
    const b = run(make({ arms: 6 }, 12), 900);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it('different seeds diverge', () => {
    const a = run(make({ arms: 3 }, 1), 300);
    const b = run(make({ arms: 3 }, 2), 300);
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });
});

describe('double-pendulum · physics', () => {
  it('keeps total energy roughly constant with zero damping (RK4 quality check)', () => {
    const state = make({ arms: 1, damping: 0, gravity: 9.8 }, 3);
    const arm = state.arms[0]!;
    const before = energy(arm, 9.8);
    run(state, 2000);
    const after = energy(arm, 9.8);
    expect(Math.abs(after - before) / Math.abs(before)).toBeLessThan(0.05);
  });

  it('dissipates energy with damping', () => {
    const state = make({ arms: 1, damping: 0.6 }, 3);
    const arm = state.arms[0]!;
    const before = energy(arm, state.params.gravity);
    run(state, 1200);
    expect(energy(arm, state.params.gravity)).toBeLessThan(before);
  });

  it('never produces NaN even at high gravity', () => {
    const state = run(make({ arms: 4, gravity: 30 }, 5), 3000);
    for (const arm of state.arms) {
      expect(Number.isFinite(arm.th1)).toBe(true);
      expect(Number.isFinite(arm.th2)).toBe(true);
      expect(Number.isFinite(arm.w1)).toBe(true);
      expect(Number.isFinite(arm.w2)).toBe(true);
    }
  });

  it('is chaotic: a 0.01° difference grows into a macroscopic one', () => {
    const a = run(make({ arms: 1, spread: 0 }, 1), 4200);
    const b = run(make({ arms: 2, spread: 0.01 }, 1), 4200);
    const armA = a.arms[0]!;
    const armB = b.arms[1]!;
    expect(Math.abs(Math.sin(armA.th2) - Math.sin(armB.th2))).toBeGreaterThan(0.1);
  });

  it('fills the trail ring buffer and never grows past its cap', () => {
    const state = run(make({ arms: 2, trailLength: 60 }, 4), 500);
    for (const arm of state.arms) {
      expect(arm.count).toBe(60);
      expect(arm.trail.length).toBe(120);
    }
  });
});
