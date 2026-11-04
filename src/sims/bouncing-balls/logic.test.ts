import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { applyParams, defaultParams, init, kineticEnergy, onPointer, step, WORLD, type Params, type State } from './logic';

function run(params: Params, seed: number, steps: number): State {
  let s = init(params, createRng(seed));
  for (let i = 0; i < steps; i++) s = step(s, 1 / 60);
  return s;
}
const snap = (s: State) => structuredClone({ balls: s.balls, w: s.w, h: s.h });

describe('bouncing-balls logic', () => {
  it('determinism: same params + seed, 600 steps → deep-equal states', () => {
    expect(snap(run(defaultParams, 42, 600))).toEqual(snap(run(defaultParams, 42, 600)));
  });
  it('different seed → different state', () => {
    expect(snap(run(defaultParams, 1, 60))).not.toEqual(snap(run(defaultParams, 2, 60)));
  });
  it('bounds: after 2000 steps every ball stays inside the world', () => {
    const s = run({ ...defaultParams, count: 120, collisions: true }, 9, 2000);
    for (const b of s.balls) {
      expect(b.x).toBeGreaterThanOrEqual(defaultParams.radius - 0.001);
      expect(b.x).toBeLessThanOrEqual(WORLD.w - defaultParams.radius + 0.001);
      expect(b.y).toBeGreaterThanOrEqual(defaultParams.radius - 0.001);
      expect(b.y).toBeLessThanOrEqual(WORLD.h - defaultParams.radius + 0.001);
    }
  });
  it('energy conserved when restitution = 1, gravity = 0, collisions off', () => {
    const p = { ...defaultParams, gravity: 0, restitution: 1, collisions: false };
    let s = init(p, createRng(5)); const e0 = kineticEnergy(s);
    for (let i = 0; i < 1000; i++) s = step(s, 1 / 60);
    expect(Math.abs(kineticEnergy(s) - e0) / e0).toBeLessThan(0.001);
  });
  it('damping: restitution < 1 loses kinetic energy (gravity off)', () => {
    const p = { ...defaultParams, gravity: 0, restitution: 0.5, collisions: false };
    let s = init(p, createRng(5)); const e0 = kineticEnergy(s);
    for (let i = 0; i < 1000; i++) s = step(s, 1 / 60);
    expect(kineticEnergy(s)).toBeLessThan(e0);
  });

  it('v2 applyParams: changing gravity mid-run does not move any ball', () => {
    const s = run(defaultParams, 42, 120);
    const before = s.balls.map((b) => ({ x: b.x, y: b.y }));
    applyParams(s, { ...defaultParams, gravity: 0 });
    expect(s.balls.map((b) => ({ x: b.x, y: b.y }))).toEqual(before);
    expect(s.params.gravity).toBe(0);
  });

  it('v2 onPointer: click spawns a ball at the cursor', () => {
    const s = init(defaultParams, createRng(1));
    const n0 = s.balls.length;
    onPointer(s, { type: 'down', x: 123, y: 234, button: 0, shift: false, alt: false, pressed: true });
    expect(s.balls.length).toBe(n0 + 1);
    expect(s.balls[n0]!.x).toBeCloseTo(123, 1);
    expect(s.balls[n0]!.y).toBeCloseTo(234, 1);
  });
});
