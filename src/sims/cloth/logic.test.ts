import { describe, expect, it } from 'vitest';
import { Runner } from '../../core/runner';
import { assertFrameRateIndependence, hashFloat64 } from '../../core/testing';
import { createRng } from '../../core/rng';
import { buildCloth, defaultParams, init, onPointer, step, type Params, type State } from './logic';
import sim from './index';

const run = (p: Partial<Params>, seed: number, steps: number): State => {
  const s = init({ ...defaultParams, ...p }, createRng(seed));
  for (let i = 0; i < steps; i++) step(s, 1 / 60);
  return s;
};

describe('cloth', () => {
  it('determinism incl. wind: same seed + steps → identical positions', () => {
    const a = run({ windStrength: 180 }, 42, 300);
    const b = run({ windStrength: 180 }, 42, 300);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
  });

  it('free fall follows the discrete Verlet trajectory', () => {
    const s = init({ ...defaultParams, object: 'rope', gravity: 900, damping: 0, windStrength: 0 }, createRng(1));
    // unpin everything and remove constraints by using a single free particle state
    s.invMass.fill(1);
    s.alive.fill(0);
    const y0 = s.y[5]!;
    for (let i = 0; i < 60; i++) step(s, 1 / 60);
    // position Verlet with h=dt/substeps: y ≈ y0 + 0.5*g*t² (within a few %)
    const expected = y0 + 0.5 * 900 * 1 * 1;
    expect(s.y[5]!).toBeGreaterThan(expected * 0.9);
    expect(s.y[5]!).toBeLessThan(expected * 1.1 + 20);
  });

  it('pins never move under wind and iterations', () => {
    const s = run({ windStrength: 300, iterations: 30 }, 3, 240);
    const fresh = init({ ...defaultParams, windStrength: 300, iterations: 30 }, createRng(3));
    for (let i = 0; i < s.n; i++) {
      if (s.invMass[i] === 0) {
        expect(s.x[i]).toBe(fresh.x[i]);
        expect(s.y[i]).toBe(fresh.y[i]);
      }
    }
  });

  it('stability sweep: finite everywhere; more iterations → lower max strain; settles at 20', () => {
    const strains: Record<number, number> = {};
    for (const iterations of [1, 5, 20, 40]) {
      const s = run({ iterations, windStrength: 0 }, 5, 600);
      for (let i = 0; i < s.n; i++) { expect(Number.isFinite(s.x[i]!)).toBe(true); expect(Number.isFinite(s.y[i]!)).toBe(true); }
      strains[iterations] = s.maxStrain;
    }
    expect(strains[20]!).toBeLessThan(strains[1]!);
    const settled = run({ iterations: 24, windStrength: 0 }, 5, 900);
    expect(settled.maxVelocity).toBeLessThan(90);
    expect(settled.maxStrain).toBeLessThan(0.6);
  }, 30000);

  it('tear removes overstretched constraints and stays stable; cut removes crossed ones', () => {
    const s = init({ ...defaultParams, clothW: 6, clothH: 4, tearRatio: 1.3, windStrength: 0 }, createRng(2));
    // yank the bottom-right particle far away
    const idx = s.n - 1;
    s.x[idx] = s.x[idx]! + 500;
    step(s, 1 / 60);
    expect(s.torn).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) step(s, 1 / 60);
    for (let i = 0; i < s.n; i++) expect(Number.isFinite(s.x[i]!)).toBe(true);

    const c = init({ ...defaultParams, clothW: 5, clothH: 5, windStrength: 0 }, createRng(2));
    const before = c.alive.reduce((a, v) => a + v, 0);
    onPointer(c, { type: 'down', x: c.x[0]!, y: c.y[0]!, button: 2, shift: false, alt: false, pressed: true });
    onPointer(c, { type: 'move', x: c.x[c.n - 1]!, y: c.y[c.n - 1]!, button: 0, shift: false, alt: true, pressed: true });
    expect(c.alive.reduce((a, v) => a + v, 0)).toBeLessThan(before);
  });

  it('grab moves the particle to the pointer; ground collision holds', () => {
    const s = init({ ...defaultParams, windStrength: 0 }, createRng(4));
    const i = 30;
    onPointer(s, { type: 'down', x: s.x[i]!, y: s.y[i]!, button: 0, shift: false, alt: false, pressed: true });
    onPointer(s, { type: 'move', x: 500, y: 200, button: 0, shift: false, alt: false, pressed: true });
    step(s, 1 / 60);
    expect(Math.hypot(s.x[i]! - 500, s.y[i]! - 200)).toBeLessThan(2);
    const fallen = run({ object: 'blob', windStrength: 0 }, 4, 600);
    for (let k = 0; k < fallen.n; k++) expect(fallen.y[k]!).toBeLessThanOrEqual(560.001);
  });

  it('builders: cloth constraint counts match closed form; rope/blob connected', () => {
    const s = buildCloth({ ...defaultParams, clothW: 4, clothH: 3 }, createRng(1));
    // structural: (W-1)H + W(H-1) = 9+8=17; shear 2*(W-1)(H-1)=12; bend (W-2)H + W(H-2)=6+4=10
    expect(s.nc).toBe(17 + 12 + 10);
    const blob = init({ ...defaultParams, object: 'blob', blobs: 1 }, createRng(1));
    expect(blob.n).toBe(15);
    expect(blob.nc).toBeGreaterThan(20);
  });

  it('frame-rate independence across tick patterns', () => {
    const p = { ...defaultParams, clothW: 12, clothH: 8, windStrength: 120 };
    const direct = init(p, createRng(11));
    const hashes = new Map<number, number>();
    hashes.set(0, hashFloat64([direct.x, direct.y]));
    for (let i = 1; i <= 90; i++) { step(direct, 1 / 60); hashes.set(i, hashFloat64([direct.x, direct.y])); }
    let current: Runner<Params, State> | null = null;
    assertFrameRateIndependence({
      directHashAt: (n) => hashes.get(n)!,
      makeRunner: () => { current = new Runner({ ...sim, render: () => undefined }, p, 11, () => ({ ctx: null as never, width: 800, height: 600, theme: 'dark' })); return current; },
      hashRunner: () => hashFloat64([current!.state.x, current!.state.y]),
      maxSteps: 90,
    });
  });
});
