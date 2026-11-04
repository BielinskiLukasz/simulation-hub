import { describe, expect, it } from 'vitest';
import { Runner } from './runner';
import { RunnerGroup } from './runner-group';
import type { RealtimeSimulation, RenderContext } from './types';

const rc: RenderContext = { ctx: null as never, width: 800, height: 600, theme: 'dark' };
interface S { v: number; bonus: number }
const sim: RealtimeSimulation<{ n: number }, S> = {
  kind: 'realtime',
  meta: { id: 'counter', title: 'Counter', kind: 'realtime', category: 'algorithms', description: '', tags: [], difficulty: 'easy', thumbnail: '', accent: '#000' },
  defaultParams: { n: 0 },
  paramSchema: { n: { kind: 'number', label: 'n' } },
  init: () => ({ v: 0, bonus: 0 }),
  step: (s) => { s.v++; return s; },
  render: () => undefined,
  onPointer: (s, ev) => { if (ev.type === 'down') s.bonus += 10; return s; },
  about: { summary: '', bullets: [], invariant: '' },
};

describe('RunnerGroup lockstep compare', () => {
  it('both runners advance identical step counts under any tick pattern', () => {
    const a = new Runner(sim, { n: 0 }, 42, () => rc);
    const b = new Runner(sim, { n: 0 }, 42, () => rc);
    const group = new RunnerGroup([a, b]);
    for (const ts of [0, 8, 25, 41, 100, 260, 1000, 1016, 2500]) group.tick(ts);
    expect(a.stepCount).toBe(b.stepCount);
    expect(a.state).toEqual(b.state);
  });

  it('mirrored pointer input produces bit-identical states', () => {
    const a = new Runner(sim, { n: 0 }, 7, () => rc);
    const b = new Runner(sim, { n: 0 }, 7, () => rc);
    const group = new RunnerGroup([a, b]);
    group.pointer({ type: 'down', x: 1, y: 2, button: 0, shift: false, alt: false, pressed: true });
    for (let i = 0; i < 120; i++) group.stepOnce();
    expect(a.state).toEqual({ v: 120, bonus: 10 });
    expect(b.state).toEqual(a.state);
  });
});
