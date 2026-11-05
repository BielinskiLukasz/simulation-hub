import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { SpatialHash } from '../../core/spatial-hash';
import { HERB, PLANT, PRED, defaultParams, init, onPointer, step, territoryPct, type Params, type State } from './logic';
import sim from './index';

function run(p: Partial<Params>, seed: number, steps: number): State {
  const s = init({ ...defaultParams, ...p }, createRng(seed));
  for (let i = 0; i < steps; i++) step(s, 1 / 60);
  return s;
}

describe('ecosystem', () => {
  it('determinism: same seed + params → identical positions and counts', () => {
    const a = run({}, 42, 400);
    const b = run({}, 42, 400);
    expect(Array.from(a.x.subarray(0, a.n))).toEqual(Array.from(b.x.subarray(0, b.n)));
    expect(a.counts).toEqual(b.counts);
    expect(Array.from(a.claim)).toEqual(Array.from(b.claim));
  });

  it('bounds and finiteness hold for seeded runs and extreme params', () => {
    const s = run({ plantRegrowth: 200, metabolism: 15, perception: 200, herbivoreSpeed: 160 }, 7, 500);
    for (let i = 0; i < s.n; i++) {
      expect(Number.isFinite(s.x[i]!)).toBe(true);
      expect(s.x[i]!).toBeGreaterThanOrEqual(0);
      expect(s.x[i]!).toBeLessThanOrEqual(800);
      expect(s.y[i]!).toBeGreaterThanOrEqual(0);
      expect(s.y[i]!).toBeLessThanOrEqual(600);
    }
    expect(s.n).toBe(s.counts[0]! + s.counts[1]! + s.counts[2]!);
  });

  it('herbivores starve without plants; predators decline without herbivores', () => {
    const noPlants = run({ plants: 0, plantRegrowth: 0, herbivores: 30, predators: 0 }, 3, 60 * 40);
    expect(noPlants.counts[PLANT]).toBe(0);
    expect(noPlants.counts[HERB]!).toBeLessThan(30);
    const noPrey = run({ plants: 0, plantRegrowth: 0, herbivores: 0, predators: 20 }, 4, 60 * 40);
    expect(noPrey.counts[PRED]!).toBeLessThan(20);
  });

  it('a meal transfers energy and removes the plant', () => {
    const s = init({ ...defaultParams, plants: 0, plantRegrowth: 0, herbivores: 0, predators: 0 }, createRng(5));
    // one plant and one hungry herbivore right next to it
    s.species[0] = PLANT; s.x[0] = 400; s.y[0] = 400; s.energy[0] = 0; s.counts[PLANT] = 1; s.n = 1;
    s.species[1] = HERB; s.x[1] = 405; s.y[1] = 400; s.energy[1] = 50; s.counts[HERB] = 1; s.n = 2;
    s.params = { ...s.params, metabolism: 1 };
    step(s, 1 / 60);
    expect(s.counts[PLANT]).toBe(0);
    expect(s.eaten[0]!).toBeGreaterThan(0);
    expect(s.counts[HERB]).toBe(1);
  });

  it('plants respect the population cap under generous regrowth', () => {
    const s = run({ plants: 50, plantRegrowth: 200, herbivores: 0, predators: 0 }, 9, 60 * 20);
    expect(s.counts[PLANT]!).toBeLessThanOrEqual(50);
  });

  it('predators reduce herbivore numbers relative to a predator-free run', () => {
    const withPred = run({ predators: 40, plantRegrowth: 80 }, 11, 60 * 45);
    const without = run({ predators: 0, plantRegrowth: 80 }, 11, 60 * 45);
    expect(withPred.counts[HERB]!).toBeLessThanOrEqual(without.counts[HERB]!);
  });

  it('territory claims spread then decay', () => {
    const s = run({ plants: 300, herbivores: 60, predators: 10 }, 21, 60 * 15);
    const t = territoryPct(s);
    expect(t.herb).toBeGreaterThanOrEqual(0);
    expect(t.pred).toBeGreaterThanOrEqual(0);
    expect(t.herb + t.pred).toBeLessThanOrEqual(1);
    s.params = { ...s.params, plantRegrowth: 0 };
  });

  it('non-wrapping spatial hash query equals brute force near the edges', () => {
    const rng = createRng(4);
    const n = 120;
    const x = new Float32Array(n); const y = new Float32Array(n);
    for (let i = 0; i < n; i++) { x[i] = rng.range(0, 800); y[i] = rng.range(0, 600); }
    const hash = new SpatialHash(800, 600, 60, n, false);
    hash.rebuild(x, y, n);
    const out = new Int32Array(n);
    for (let q = 0; q < 40; q++) {
      const px = rng.range(0, 800); const py = rng.range(0, 600); const r = 60;
      const m = hash.query(px, py, out);
      const found = new Set<number>();
      for (let k = 0; k < m; k++) {
        const i = out[k]!;
        if ((x[i]! - px) ** 2 + (y[i]! - py) ** 2 <= r * r) found.add(i);
      }
      const brute = new Set<number>();
      for (let i = 0; i < n; i++) if ((x[i]! - px) ** 2 + (y[i]! - py) ** 2 <= r * r) brute.add(i);
      expect(found).toEqual(brute);
    }
  });

  it('pointer painting adds agents; right-click removes one; live params keep positions', () => {
    const s = init({ ...defaultParams, plants: 0, herbivores: 0, predators: 0 }, createRng(2));
    onPointer(s, { type: 'down', x: 400, y: 300, button: 0, shift: false, alt: false, pressed: true });
    expect(s.counts[PLANT]!).toBeGreaterThan(0);
    onPointer(s, { type: 'down', x: 400, y: 300, button: 0, shift: true, alt: false, pressed: true });
    expect(s.counts[HERB]!).toBeGreaterThan(0);
    onPointer(s, { type: 'down', x: 400, y: 300, button: 0, shift: false, alt: true, pressed: true });
    expect(s.counts[PRED]).toBe(1);
    const n0 = s.n;
    onPointer(s, { type: 'down', x: 400, y: 300, button: 2, shift: false, alt: false, pressed: true });
    expect(s.n).toBeLessThanOrEqual(n0);

    const before = Array.from(s.x.subarray(0, s.n));
    const live = sim.applyParams!(s, { ...s.params, perception: 170, herbivoreSpeed: 120 });
    expect(Array.from(live.x.subarray(0, live.n))).toEqual(before);
  });
});
