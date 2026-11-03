import { describe, expect, it } from 'vitest';
import { Runner, FIXED_DT } from './runner';
import type { RenderContext, Simulation } from './types';

const rc: RenderContext = { ctx: null as never, width: 800, height: 600, theme: 'dark' };
const counter: Simulation<{ n: number }, { v: number }> = {
  meta: { id: 'counter', title: 'Counter', category: 'algorithms', description: '', tags: [], difficulty: 'easy', thumbnail: '', accent: '#000' },
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
  it('reset with same seed reproduces the initial state', () => {
    const r = make(); const first = r.state.v; drive(r, 0.5, 60); r.reset(); expect(r.state.v).toBe(first); expect(r.stepCount).toBe(0);
    expect(FIXED_DT).toBe(1 / 60);
  });
});
