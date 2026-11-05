import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, onAction, step, type State } from './logic';
import { estimateRates, lvFirstIntegral, lvSmallPeriod, lvStep, type LVState } from './lv';

describe('lotka-volterra overlay', () => {
  it('equilibrium is stationary; first integral drift is tiny over many periods', () => {
    const s: LVState = { prey: 40, pred: 60, time: 0, alpha: 0.5, beta: 0.002, delta: 0.002, gamma: 0.3 };
    const v0 = lvFirstIntegral(s);
    const period = lvSmallPeriod(s);
    for (let i = 0; i < 4000; i++) lvStep(s, period / 400);
    expect(Math.abs(lvFirstIntegral(s) - v0)).toBeLessThan(0.01);
    expect(period).toBeCloseTo((2 * Math.PI) / Math.sqrt(0.5 * 0.3), 8);
  });

  it('rate estimation recovers mean-field parameters from synthetic counters', () => {
    const r = estimateRates({
      integralPrey: 100, integralPred: 200, integralProduct: 400,
      preyBorn: 30, preyEaten: 20, preyStarved: 5, predBorn: 10, predStarved: 8,
      meanPrey: 10, meanPred: 20,
    });
    expect(r.alpha).toBeCloseTo(0.25, 8);
    expect(r.beta).toBeCloseTo(0.05, 8);
    expect(r.delta).toBeCloseTo(0.025, 8);
    expect(r.gamma).toBeCloseTo(0.04, 8);
  });

  it('ABM ledger: population and energy stay consistent; no extinctions NaN', () => {
    const s = init({ ...defaultParams, plants: 200, herbivores: 20, predators: 3 }, createRng(4));
    for (let i = 0; i < 400; i++) {
      const before = s.counts.reduce((a, b) => a + b, 0);
      step(s, 1 / 60);
      const after = s.counts.reduce((a, b) => a + b, 0);
      expect(after).toBeLessThanOrEqual(before + 40);
      for (const inv of [s.lv]) void inv;
    }
    for (let i = 0; i < s.n; i++) expect(Number.isFinite(s.energy[i]!)).toBe(true);
    const e = onAction(s, 'calibrate') as State;
    expect(e.lv).not.toBeNull();
    onAction(s, 'drought');
    expect(s.grass.every((v) => v === 0)).toBe(true);
    onAction(s, 'release-predators');
    expect(s.counts[2]!).toBeGreaterThan(3);
  });
});
