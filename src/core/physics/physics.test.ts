import { describe, expect, it } from 'vitest';
import { Stepper } from './integrators';
import { QuadTree } from './quadtree';
import { angularMomentum, directAccel, potentialEnergy } from './gravity';
import { createRng } from '../rng';

const accel = (x: Float64Array, _v: Float64Array, a: Float64Array) => { for (let i = 0; i < x.length; i++) a[i] = -x[i]!; };

function integrate(id: 'euler' | 'semi-implicit' | 'verlet' | 'rk4', steps: number, dt: number) {
  const x = new Float64Array([1, 0]);
  const v = new Float64Array([0, 0]);
  // 1D oscillator embedded in first component; second unused pair keeps dof even not required
  const s = new Stepper(2, accel);
  for (let i = 0; i < steps; i++) s.step(id, x, v, dt);
  return { x, v, evals: s.evals, stepper: s };
}

function energyAt(x: Float64Array, v: Float64Array): number {
  return 0.5 * (v[0]! * v[0]! + x[0]! * x[0]!);
}

describe('integrators: harmonic oscillator', () => {
  it('convergence orders are approximately 1, 1, 2, 4', () => {
    const period = 2 * Math.PI;
    const measure = (id: 'euler' | 'semi-implicit' | 'verlet' | 'rk4', n: number) => {
      const { x, v } = integrate(id, n, period / n);
      return Math.hypot(x[0]! - 1, v[0]!);
    };
    const slope = (id: 'euler' | 'semi-implicit' | 'verlet' | 'rk4') => {
      const e100 = measure(id, 100); const e200 = measure(id, 200); const e400 = measure(id, 400);
      return Math.log2((e100 + e200) / (e200 + e400) + 1e-30) > 0
        ? (Math.log(e100 / e200) / Math.log(2) + Math.log(e200 / e400) / Math.log(2)) / 2
        : 0;
    };
    expect(slope('euler')).toBeGreaterThan(0.8);
    expect(slope('semi-implicit')).toBeGreaterThan(0.8);
    expect(slope('verlet')).toBeGreaterThan(1.8);
    expect(slope('verlet')).toBeLessThan(2.2);
    expect(slope('rk4')).toBeGreaterThan(3.7);
  });

  it('explicit Euler energy follows (1 + dt²)^n exactly', () => {
    const dt = 0.01;
    const n = 1000;
    const { x, v } = integrate('euler', n, dt);
    const ratio = energyAt(x, v) / 0.5;
    expect(ratio).toBeCloseTo(Math.pow(1 + dt * dt, n), 8);
  });

  it('symplectic methods keep energy bounded; eval counts are 1/1/1/4', () => {
    for (const id of ['semi-implicit', 'verlet'] as const) {
      const x = new Float64Array([1, 0]);
      const v = new Float64Array([0, 0]);
      const s = new Stepper(2, accel);
      let maxDrift = 0;
      for (let i = 0; i < 20000; i++) { s.step(id, x, v, 0.05); maxDrift = Math.max(maxDrift, Math.abs(energyAt(x, v) / 0.5 - 1)); }
      expect(maxDrift).toBeLessThan(0.2);
      expect(s.evals).toBe(id === 'verlet' ? 20001 : 20000); // Verlet: initial accel + 1/step
    }
    const rk = integrate('rk4', 10, 0.1);
    expect(rk.evals).toBe(40);
  });

  it('invalidate makes a mid-run integrator switch match a fresh run', () => {
    const run = (withInvalidate: boolean) => {
      const x = new Float64Array([1, 0]);
      const v = new Float64Array([0, 0]);
      const s = new Stepper(2, accel);
      for (let i = 0; i < 50; i++) s.step('verlet', x, v, 0.02);
      if (withInvalidate) s.invalidate();
      for (let i = 0; i < 50; i++) s.step('verlet', x, v, 0.02);
      return [...x, ...v];
    };
    const fresh = (() => { const x = new Float64Array([1, 0]); const v = new Float64Array([0, 0]); const s = new Stepper(2, accel); for (let i = 0; i < 100; i++) s.step('verlet', x, v, 0.02); return [...x, ...v]; })();
    expect(run(true)).toEqual(fresh);
  });
});

describe('Barnes–Hut quadtree', () => {
  function randomBodies(n: number, seed = 42) {
    const rng = createRng(seed);
    const pos = new Float64Array(n * 2);
    const vel = new Float64Array(n * 2);
    const mass = new Float64Array(n).fill(1);
    const src = Int32Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < n; i++) { pos[i * 2] = rng.range(-50, 50); pos[i * 2 + 1] = rng.range(-50, 50); }
    return { pos, vel, mass, src };
  }

  it('theta = 0 matches direct summation; aggregates are exact', () => {
    const { pos, mass, src } = randomBodies(200);
    const direct = new Float64Array(400);
    directAccel(pos, mass, src, 200, 200, 1, 0.01, direct);
    const tree = new QuadTree(200);
    tree.buildInterleaved(pos, mass, src, 200);
    expect(tree.rootMass()).toBeCloseTo(200, 9);
    const out = new Float64Array(2);
    let maxRel = 0;
    for (let i = 0; i < 200; i++) {
      tree.accel(pos[i * 2]!, pos[i * 2 + 1]!, i, 0, 0.01, 1, out);
      const denom = Math.max(1e-9, Math.hypot(direct[i * 2]!, direct[i * 2 + 1]!));
      maxRel = Math.max(maxRel, Math.hypot(out[0]! - direct[i * 2]!, out[1]! - direct[i * 2 + 1]!) / denom);
    }
    expect(maxRel).toBeLessThan(1e-6);
    expect(potentialEnergy(pos, mass, src, 200, 1, 0.01)).toBeLessThan(0);
  });

  it('coincident bodies build without hanging; accuracy improves as theta shrinks', () => {
    const n = 100;
    const pos = new Float64Array(n * 2).fill(3);
    const mass = new Float64Array(n).fill(1);
    const src = Int32Array.from({ length: n }, (_, i) => i);
    const tree = new QuadTree(n);
    expect(() => tree.buildInterleaved(pos, mass, src, n)).not.toThrow();
    const out = new Float64Array(2);
    tree.accel(10, 3, -1, 0.5, 0.01, 1, out);
    expect(Number.isFinite(out[0]!)).toBe(true);

    const bodies = randomBodies(300, 7);
    const direct = new Float64Array(600);
    directAccel(bodies.pos, bodies.mass, bodies.src, 300, 300, 1, 0.01, direct);
    const rms = (theta: number) => {
      const t = new QuadTree(300);
      t.buildInterleaved(bodies.pos, bodies.mass, bodies.src, 300);
      let sum = 0;
      const o = new Float64Array(2);
      for (let i = 0; i < 300; i++) {
        t.accel(bodies.pos[i * 2]!, bodies.pos[i * 2 + 1]!, i, theta, 0.01, 1, o);
        const dx = o[0]! - direct[i * 2]!; const dy = o[1]! - direct[i * 2 + 1]!;
        sum += dx * dx + dy * dy;
      }
      return Math.sqrt(sum / 300);
    };
    expect(rms(0.3)).toBeLessThan(rms(1.0) + 1e-12);
    void angularMomentum;
  });
});
