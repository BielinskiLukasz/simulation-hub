import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { Runner } from '../../core/runner';
import { assertFrameRateIndependence, hashFloat64 } from '../../core/testing';
import { defaultParams, diagnostics, init, jamTravelDirection, step, type Params } from './logic';
import sim from './index';

function run(over: Partial<Params>, seed: number, steps: number) {
  const s = init({ ...defaultParams, ...over }, createRng(seed));
  for (let i = 0; i < steps; i++) step(s, 1 / 60);
  return s;
}

describe('traffic IDM', () => {
  it('free road: speeds converge to desired speed and stay collision-free', () => {
    const s = run({ vehicles: 4, ringM: 2000, polarize: false, noise: 0 }, 3, 900);
    for (let i = 0; i < s.n; i++) expect(s.vel[i]!).toBeGreaterThan(s.v0[i]! * 0.85);
    for (let i = 0; i < s.n; i++) {
      const lead = (i + 1) % s.n;
      const gap = (lead === 0 ? s.pos[0]! + s.ring : s.pos[lead]!) - s.pos[i]! - s.len[lead]!;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(s.vel[i]!).toBeGreaterThanOrEqual(0);
    }
  });

  it('ring invariants: count constant, positions in range, deterministic', () => {
    const a = run({}, 5, 200);
    const b = run({}, 5, 200);
    expect(a.n).toBe(22);
    expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
    for (let i = 0; i < a.n; i++) { expect(a.pos[i]!).toBeGreaterThanOrEqual(0); expect(a.pos[i]!).toBeLessThan(a.ring); }
  });

  it('phantom jam: perturbation grows at the Sugiyama density and the wave travels backwards', () => {
    const s = init({ ...defaultParams, polarize: true, heterogeneity: 0, truckFraction: 0 }, createRng(1));
    for (let i = 0; i < 800; i++) step(s, 1 / 60);
    const d = diagnostics(s);
    expect(d.speedSd).toBeGreaterThan(1.5);
    expect(d.minSpeed).toBeLessThan(5);
    const dirs: number[] = [];
    for (let i = 0; i < 40; i++) { step(s, 1 / 60); const d2 = jamTravelDirection(s); if (Number.isFinite(d2)) dirs.push(d2); }
    const backwards = dirs.filter((d2) => d2 < 0).length;
    expect(dirs.length).toBeGreaterThan(20);
    expect(backwards / dirs.length).toBeGreaterThan(0.7);
    expect(dirs.reduce((a, b) => a + b, 0) / dirs.length).toBeLessThan(-2);
  });

  it('frame-rate independence for the ring', () => {
    const p = { ...defaultParams, vehicles: 12, ringM: 400, noise: 0.2 };
    const direct = init(p, createRng(9));
    const hashes = new Map<number, number>();
    hashes.set(0, hashFloat64([direct.pos, direct.vel]));
    for (let i = 1; i <= 60; i++) { step(direct, 1 / 60); hashes.set(i, hashFloat64([direct.pos, direct.vel])); }
    let current: Runner<Params, typeof direct> | null = null;
    assertFrameRateIndependence({
      directHashAt: (n) => hashes.get(n)!,
      makeRunner: () => { current = new Runner({ ...sim, render: () => undefined }, p, 9, () => ({ ctx: null as never, width: 800, height: 600, theme: 'dark' })); return current; },
      hashRunner: () => hashFloat64([current!.state.pos, current!.state.vel]),
      maxSteps: 60,
    });
  });
});
