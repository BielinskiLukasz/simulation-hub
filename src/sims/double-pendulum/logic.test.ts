import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { applyParams, bobPositions, defaultParams, energy, init, step, PIVOT, type Params, type State } from './logic';

function run(params: Params, seed: number, steps: number): State {
  const s = init(params, createRng(seed));
  for (let i = 0; i < steps; i++) step(s, 1 / 60);
  return s;
}

describe('double-pendulum logic', () => {
  it('determinism: same params + seed → identical angles after 600 steps', () => {
    const a = run(defaultParams, 3, 600);
    const b = run(defaultParams, 3, 600);
    expect(a.main).toEqual(b.main);
    expect(a.ghosts).toEqual(b.ghosts);
  });

  it('energy conserved to <1% over 10 s with damping = 0 (RK4)', () => {
    const s = init(defaultParams, createRng(3));
    const e0 = energy(s.main, s.params);
    for (let i = 0; i < 600; i++) step(s, 1 / 60);
    const e1 = energy(s.main, s.params);
    expect(Math.abs(e1 - e0) / Math.abs(e0)).toBeLessThan(0.01);
  });

  it('damping drains energy monotonically-ish and the pendulum settles downward', () => {
    const s = run({ ...defaultParams, damping: 0.25, ghosts: 0 }, 3, 60 * 45);
    const pos = bobPositions(s.main, s.params);
    expect(pos.y2).toBeGreaterThan(PIVOT.y + 200); // bob hangs near the bottom
    expect(Math.abs(s.main.w1)).toBeLessThan(0.5);
  });

  it('chaos: ghosts perturbed by 0.001 rad diverge from the main pendulum', () => {
    const s = run({ ...defaultParams, ghosts: 5 }, 3, 60 * 25);
    const main = bobPositions(s.main, s.params);
    const distances = s.ghosts.map((g) => {
      const gp = bobPositions(g, s.params);
      return Math.hypot(gp.x2 - main.x2, gp.y2 - main.y2);
    });
    expect(Math.max(...distances)).toBeGreaterThan(80); // fully decorrelated
  });

  it('rest state: hanging straight down with zero velocity stays put', () => {
    const s = run({ ...defaultParams, theta1: 0, theta2: 0, ghosts: 0 }, 3, 300);
    expect(Math.abs(s.main.a1)).toBeLessThan(1e-9);
    expect(Math.abs(s.main.a2)).toBeLessThan(1e-9);
  });

  it('live applyParams: changing gravity does not reset the angles', () => {
    const s = run(defaultParams, 3, 120);
    const before = { ...s.main };
    applyParams(s, { ...s.params, gravity: 400 });
    expect(s.main).toEqual(before);
    expect(s.params.gravity).toBe(400);
  });

  it('no NaN after 5,000 steps at extreme angles', () => {
    const s = run({ ...defaultParams, theta1: 179, theta2: -179 }, 3, 5000);
    expect(Number.isFinite(s.main.a1)).toBe(true);
    expect(Number.isFinite(s.main.w2)).toBe(true);
  });
});
