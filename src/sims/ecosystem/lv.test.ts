import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { calibrateLv, defaultParams, drought, init, releasePredators, runOneEcosystem, step, type Params } from './logic';
import sim from './index';

const P = (o: Partial<Params> = {}): Params => ({ ...defaultParams, ...o });

describe('ecosystem Phase-6 upgrade', () => {
  it('Lotka–Volterra companion is deterministic, bounded and on the sim clock', () => {
    const a = init(P({ plants: 200, herbivores: 80, predators: 20 }), createRng(4));
    const b = init(P({ plants: 200, herbivores: 80, predators: 20 }), createRng(4));
    for (let i = 0; i < 600; i++) { step(a, 1 / 60); step(b, 1 / 60); }
    expect(Array.from(a.lv)).toEqual(Array.from(b.lv));
    expect(a.lv[0]!).toBeGreaterThanOrEqual(0);
    expect(a.lv[1]!).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(a.lv[0]!)).toBe(true);
  });

  it('LV equilibrium is (γ/δ, α/β) and is stationary under RK4', () => {
    const p = P({ alpha: 1.1, beta: 0.04, delta: 0.02, gamma: 0.9, herbivores: 0, predators: 0, plants: 0 });
    const s = init(p, createRng(1));
    s.lv[0] = p.gamma / p.delta;
    s.lv[1] = p.alpha / p.beta;
    const x0 = s.lv[0]!; const y0 = s.lv[1]!;
    for (let i = 0; i < 600; i++) step(s, 1 / 60);
    expect(Math.abs(s.lv[0]! - x0) / x0).toBeLessThan(1e-3);
    expect(Math.abs(s.lv[1]! - y0) / y0).toBeLessThan(1e-3);
  });

  it('calibrate copies populations into the ODE, and drought/release actions work', () => {
    const s = init(P({ herbivores: 60, predators: 8, plants: 300 }), createRng(2));
    for (let i = 0; i < 300; i++) step(s, 1 / 60);
    const before = s.rate.lvResets;
    calibrateLv(s);
    expect(s.rate.lvResets).toBe(before + 1);
    expect(s.lv[0]).toBe(s.counts[1]);
    expect(s.lv[1]).toBe(s.counts[2]);
    expect(s.params.lvMode).toBe('measured');
    expect(Number.isFinite(s.params.alpha)).toBe(true);

    const plantsBefore = s.counts[0]!;
    drought(s);
    expect(s.counts[0]!).toBeLessThan(plantsBefore);
    const predBefore = s.counts[2]!;
    releasePredators(s, 5);
    expect(s.counts[2]!).toBeGreaterThanOrEqual(predBefore + 5 - 1);
    expect(sim.onAction!(s, 'release')).toBe(s);
  });

  it('headless batch runner returns indicators and aligned series', () => {
    const r = runOneEcosystem(P({ plants: 250, herbivores: 70, predators: 16 }), 7, 600);
    expect(r.seriesPrey.length).toBe(10);
    expect(r.extinctPrey === 0 || r.extinctPrey === 1).toBe(true);
    expect(Number.isFinite(r.meanPrey)).toBe(true);
  });

  it('population ledger is exact after compaction', () => {
    const s = init(P(), createRng(9));
    for (let i = 0; i < 400; i++) {
      step(s, 1 / 60);
      expect(s.counts[0]! + s.counts[1]! + s.counts[2]!).toBe(s.n);
      expect(s.counts.every((c) => c >= 0)).toBe(true);
    }
  });
});
