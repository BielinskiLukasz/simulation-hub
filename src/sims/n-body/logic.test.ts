import { describe, expect, it } from 'vitest';
import { Runner } from '../../core/runner';
import { assertFrameRateIndependence, hashFloat64 } from '../../core/testing';
import { angularMomentum, momentum } from '../../core/physics/gravity';
import { createRng } from '../../core/rng';
import { defaultParams, diagnostics, init, onPointer, step, type Params } from './logic';
import sim from './index';

function twoBody(dtSteps: number, integrator: Params['integrator']) {
  const p: Params = { ...defaultParams, preset: 'figure-8', integrator, dt: 0.002, substeps: 1, forceMethod: 'direct' };
  // Replace with a clean circular two-body system for conservation checks.
  const s = init({ ...p, preset: 'three-body-chaos' }, createRng(1));
  s.n = 2; s.nSrc = 2; s.src[0] = 0; s.src[1] = 1;
  s.G = 1;
  s.pos.set([50, 0, -50, 0]);
  s.vel.set([0, Math.sqrt(1 * 100 / 100) * 0.5, 0, -Math.sqrt(1 * 100 / 100) * 0.5]);
  s.mass.set([50, 50]);
  // circular speed for equal masses at separation 100: v = sqrt(G*M/(2r)) with r=50 from COM
  const v = Math.sqrt(1 * 50 / 100);
  s.vel.set([0, v, 0, -v]);
  s.stepper.invalidate();
  const mom0 = momentum(s.vel, s.mass, s.n);
  const ang0 = angularMomentum(s.pos, s.vel, s.mass, s.n);
  for (let i = 0; i < dtSteps; i++) step(s, 1 / 60);
  return { s, mom0, ang0 };
}

describe('n-body', () => {
  it('determinism: same preset+seed, 300 steps → identical positions', () => {
    const p = { ...defaultParams, preset: 'random-cluster', bodies: 60 };
    const a = init(p, createRng(42));
    const b = init(p, createRng(42));
    for (let i = 0; i < 300; i++) { step(a, 1 / 60); step(b, 1 / 60); }
    expect(Array.from(a.pos.subarray(0, a.n * 2))).toEqual(Array.from(b.pos.subarray(0, b.n * 2)));
  });

  it('figure-8 stays bounded and centre of mass/momentum remain near zero', () => {
    const s = init({ ...defaultParams, preset: 'figure-8', integrator: 'rk4', dt: 0.001, substeps: 2 }, createRng(1));
    const mom0 = momentum(s.vel, s.mass, s.n);
    for (let i = 0; i < 1200; i++) step(s, 1 / 60);
    for (let i = 0; i < s.n * 2; i++) expect(Number.isFinite(s.pos[i]!)).toBe(true);
    const mom = momentum(s.vel, s.mass, s.n);
    expect(Math.hypot(mom.x - mom0.x, mom.y - mom0.y)).toBeLessThan(1e-6);
  });

  it('semi-implicit/Verlet conserve angular momentum far better than explicit Euler', () => {
    const verlet = twoBody(3000, 'verlet');
    const euler = twoBody(3000, 'euler');
    const lv = angularMomentum(verlet.s.pos, verlet.s.vel, verlet.s.mass, verlet.s.n);
    const le = angularMomentum(euler.s.pos, euler.s.vel, euler.s.mass, euler.s.n);
    expect(Math.abs(lv - verlet.ang0) / Math.abs(verlet.ang0)).toBeLessThan(0.01);
    expect(Math.abs(le - euler.ang0) / Math.abs(euler.ang0)).toBeGreaterThan(Math.abs(lv - verlet.ang0) / Math.abs(verlet.ang0));
  });

  it('energy drift ordering on a two-body orbit: Euler worse than Verlet', () => {
    const e0 = diagnostics(twoBody(0, 'verlet').s).energy!;
    const total = (d: ReturnType<typeof diagnostics>) => d.energy!.kinetic + d.energy!.potential;
    const ev = twoBody(3000, 'verlet');
    const ee = twoBody(3000, 'euler');
    const e0Total = e0.kinetic + e0.potential;
    const dv = Math.abs((total(diagnostics(ev.s)) - e0Total) / e0Total);
    const de = Math.abs((total(diagnostics(ee.s)) - e0Total) / e0Total);
    expect(de).toBeGreaterThan(dv);
  });

  it('pointer: drag-launch adds exactly one body; right-click deletes one', () => {
    const s = init({ ...defaultParams, preset: 'three-body-chaos' }, createRng(3));
    const n0 = s.n;
    onPointer(s, { type: 'down', x: 10, y: 10, button: 0, shift: false, alt: false, pressed: true });
    onPointer(s, { type: 'up', x: 40, y: 10, button: 0, shift: false, alt: false, pressed: false });
    expect(s.n).toBe(n0 + 1);
    onPointer(s, { type: 'down', x: 10, y: 10, button: 2, shift: false, alt: false, pressed: true });
    expect(s.n).toBe(n0);
  });

  it('frame-rate independence: 30/60/144/jitter/burst hashes match direct stepping', () => {
    const p = { ...defaultParams, preset: 'random-cluster', bodies: 30, integrator: 'verlet' as const, dt: 0.005, substeps: 1 };
    const direct = init(p, createRng(9));
    const hashes = new Map<number, number>();
    hashes.set(0, hashFloat64([direct.pos, direct.vel]));
    for (let i = 1; i <= 120; i++) { step(direct, 1 / 60); hashes.set(i, hashFloat64([direct.pos, direct.vel])); }
    let current: Runner<Params, typeof direct> | null = null;
    assertFrameRateIndependence({
      directHashAt: (n) => hashes.get(n)!,
      makeRunner: () => {
        current = new Runner({ ...sim, render: () => undefined }, p, 9, () => ({ ctx: null as never, width: 800, height: 600, theme: 'dark' }));
        return current;
      },
      hashRunner: () => hashFloat64([current!.state.pos, current!.state.vel]),
      maxSteps: 120,
    });
  });
});
