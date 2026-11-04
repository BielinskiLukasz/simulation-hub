import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { applyParams, defaultParams, init, step, stepBrute, WORLD, type Params, type State } from './logic';

function run(params: Params, seed: number, steps: number, brute = false): State {
  const s = init(params, createRng(seed));
  for (let i = 0; i < steps; i++) (brute ? stepBrute : step)(s, 1 / 60);
  return s;
}
const small: Params = { ...defaultParams, count: 300 };

describe('boids logic', () => {
  it('determinism: same params + seed, 300 steps → identical x arrays', () => {
    const a = run(small, 7, 300);
    const b = run(small, 7, 300);
    expect(Array.from(a.x.subarray(0, a.n))).toEqual(Array.from(b.x.subarray(0, b.n)));
    expect(Array.from(a.vy.subarray(0, a.n))).toEqual(Array.from(b.vy.subarray(0, b.n)));
  });

  it('no NaN/Infinity after 2,000 steps with extreme params', () => {
    const s = run({ ...small, count: 200, separation: 3, alignment: 3, cohesion: 3, perception: 100, predators: 2 }, 3, 2000);
    for (let i = 0; i < s.n; i++) {
      expect(Number.isFinite(s.x[i]!)).toBe(true);
      expect(Number.isFinite(s.vx[i]!)).toBe(true);
    }
  });

  it('speed bound: |v| ≤ maxSpeed + ε after any step', () => {
    const s = run({ ...small, maxSpeed: 120 }, 5, 300);
    for (let i = 0; i < s.n; i++) expect(Math.hypot(s.vx[i]!, s.vy[i]!)).toBeLessThanOrEqual(120.001);
  });

  it('bounds: wrap keeps positions in [0,w)×[0,h); bounce keeps them inside', () => {
    const w = run({ ...small, edges: 'wrap' }, 5, 500);
    for (let i = 0; i < w.n; i++) {
      expect(w.x[i]!).toBeGreaterThanOrEqual(0); expect(w.x[i]!).toBeLessThan(WORLD.w);
      expect(w.y[i]!).toBeGreaterThanOrEqual(0); expect(w.y[i]!).toBeLessThan(WORLD.h);
    }
    const b = run({ ...small, edges: 'bounce' }, 5, 500);
    for (let i = 0; i < b.n; i++) {
      expect(b.x[i]!).toBeGreaterThanOrEqual(0); expect(b.x[i]!).toBeLessThanOrEqual(WORLD.w);
    }
  });

  it('alignment emerges: heading coherence increases with alignment only', () => {
    const coherence = (s: State) => {
      let mx = 0; let my = 0;
      for (let i = 0; i < s.n; i++) { const sp = Math.hypot(s.vx[i]!, s.vy[i]!) || 1; mx += s.vx[i]! / sp; my += s.vy[i]! / sp; }
      return Math.hypot(mx / s.n, my / s.n);
    };
    const s = init({ ...small, count: 250, separation: 0, cohesion: 0, alignment: 1.6 }, createRng(11));
    const before = coherence(s);
    for (let i = 0; i < 600; i++) step(s, 1 / 60);
    expect(coherence(s)).toBeGreaterThan(before + 0.15);
  });

  it('separation works: mean nearest-neighbour distance grows from a dense start', () => {
    const s = init({ ...small, count: 120, separation: 2.5, alignment: 0, cohesion: 0, maxSpeed: 80 }, createRng(2));
    for (let i = 0; i < s.n; i++) { s.x[i] = 400 + (i % 12) * 3; s.y[i] = 300 + Math.floor(i / 12) * 3; }
    const meanNN = (st: State) => {
      let total = 0;
      for (let i = 0; i < st.n; i++) {
        let m = Infinity;
        for (let j = 0; j < st.n; j++) {
          if (j === i) continue;
          const d = Math.hypot(st.x[i]! - st.x[j]!, st.y[i]! - st.y[j]!);
          if (d < m) m = d;
        }
        total += m;
      }
      return total / st.n;
    };
    const before = meanNN(s);
    for (let i = 0; i < 600; i++) step(s, 1 / 60);
    expect(meanNN(s)).toBeGreaterThan(before + 4);
  });

  it('hot update: applyParams changes maxSpeed without moving any boid', () => {
    const s = run(small, 9, 60);
    const before = Array.from(s.x.subarray(0, s.n));
    applyParams(s, { ...s.params, maxSpeed: 90 });
    expect(Array.from(s.x.subarray(0, s.n))).toEqual(before);
    expect(s.params.maxSpeed).toBe(90);
  });

  it('hash step ≈ brute-force step for n = 200 (same trajectory, float-order tolerance)', () => {
    const p = { ...small, count: 200, predators: 1 };
    const a = run(p, 21, 40, false);
    const b = run(p, 21, 40, true);
    let maxDiff = 0;
    for (let i = 0; i < a.n; i++) maxDiff = Math.max(maxDiff, Math.abs(a.x[i]! - b.x[i]!), Math.abs(a.y[i]! - b.y[i]!));
    expect(maxDiff).toBeLessThan(0.75);
  });
});
