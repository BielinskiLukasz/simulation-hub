import { describe, expect, it } from 'vitest';
import { Runner, FIXED_DT } from './runner';
import type { RenderContext, Simulation } from './types';

const rc: RenderContext = { ctx: null as never, width: 800, height: 600, theme: 'dark' };
const counter: Simulation<{ n: number }, { v: number }> = {
  kind: 'realtime',
  meta: { id: 'counter', title: 'Counter', kind: 'realtime', category: 'algorithms', description: '', tags: [], difficulty: 'easy', thumbnail: '', accent: '#000' },
  defaultParams: { n: 0 },
  paramSchema: { n: { kind: 'number', label: 'n' } },
  init: () => ({ v: 0 }),
  step: (s) => { s.v += 1; return s; },
  render: () => undefined,
  about: { summary: '', bullets: [], invariant: '' },
};
const make = () => new Runner(counter, { n: 0 }, 42, () => rc);
function drive(runner: Runner<{ n: number }, { v: number }>, seconds: number, hz: number) {
  const frames = Math.round(seconds * hz);
  runner.tick(0); // establishes lastTs, like the first real rAF frame
  for (let i = 1; i <= frames; i++) runner.tick((i * 1000) / hz);
}

describe('Runner — fixed timestep', () => {
  it('1 s at 60 Hz → ~60 steps', () => { const r = make(); drive(r, 1, 60); expect(r.stepCount).toBeGreaterThanOrEqual(59); expect(r.stepCount).toBeLessThanOrEqual(61); });
  it('1 s at 144 Hz → STILL ~60 steps (frame-rate independence)', () => { const r = make(); drive(r, 1, 144); expect(r.stepCount).toBeGreaterThanOrEqual(59); expect(r.stepCount).toBeLessThanOrEqual(61); });
  it('speed = 2 → ~120 steps/s; paused → 0', () => {
    const r = make(); r.speed = 2; drive(r, 1, 60); expect(r.stepCount).toBeGreaterThanOrEqual(118);
    const p = make(); p.paused = true; drive(p, 1, 60); expect(p.stepCount).toBe(0);
  });
  it('5 s gap → at most MAX_STEPS_PER_FRAME steps (no spiral of death)', () => {
    const r = make(); r.tick(0); r.tick(5000); expect(r.stepCount).toBeLessThanOrEqual(8);
  });
  it('stepOnce advances exactly one step while paused', () => { const r = make(); r.paused = true; r.stepOnce(); r.stepOnce(); expect(r.stepCount).toBe(2); expect(r.state.v).toBe(2); });
  it('stats with a fake clock: 16.67 ms deltas → ≈60 fps', () => {
    let t = 0;
    const clockSim: Simulation<{ n: number }, { v: number }> = {
      ...counter,
      step: (s) => { t += 2; s.v += 1; return s; }, // each step "costs" 2 ms
      render: () => { t += 1; }, // render "costs" 1 ms
    };
    const r = new Runner(clockSim, { n: 0 }, 1, () => rc, { now: () => t });
    r.tick(0);
    for (let i = 1; i <= 120; i++) r.tick(i * (1000 / 60));
    expect(r.stats.fps).toBeGreaterThan(55);
    expect(r.stats.fps).toBeLessThan(65);
    expect(r.stats.stepCount).toBe(r.stepCount);
  });

  it('pointer events are queued and applied before stepping, in order', () => {
    const appliedAt: number[] = [];
    const order: string[] = [];
    const sim: Simulation<{ n: number }, { v: number }> = {
      ...counter,
      onPointer: (s, ev) => { appliedAt.push(s.v); order.push(ev.type); return s; },
    };
    const r = new Runner(sim, { n: 0 }, 1, () => rc);
    r.pointer({ type: 'down', x: 1, y: 2, button: 0, shift: false, alt: false, pressed: true });
    r.pointer({ type: 'click', x: 1, y: 2, button: 0, shift: false, alt: false, pressed: false });
    expect(order).toEqual([]); // nothing applied until the next tick
    r.tick(0); r.tick(1000 / 60);
    expect(order).toEqual(['down', 'click']);
    expect(appliedAt[0]).toBe(0); // applied BEFORE the first step ran
  });

  it('pointer events while paused are applied immediately', () => {
    let applied = 0;
    const sim: Simulation<{ n: number }, { v: number }> = { ...counter, onPointer: (s) => { applied++; return s; } };
    const r = new Runner(sim, { n: 0 }, 1, () => rc);
    r.paused = true;
    r.pointer({ type: 'down', x: 0, y: 0, button: 0, shift: false, alt: false, pressed: true });
    expect(applied).toBe(1);
  });

  it('reset with same seed reproduces the initial state', () => {
    const r = make(); const first = r.state.v; drive(r, 0.5, 60); r.reset(); expect(r.state.v).toBe(first); expect(r.stepCount).toBe(0);
    expect(FIXED_DT).toBe(1 / 60);
  });
});
