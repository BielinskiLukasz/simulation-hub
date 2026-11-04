import { describe, expect, it } from 'vitest';
import { Engine } from './engine';
import { runHeadless } from './headless';
import { toySim, type ToyEvent } from './toy';
import type { EventCtx, EventSimulation, InitCtx } from '../types';

type MiniSim = EventSimulation<Record<string, never>, { n: number }, { name: string }, never>;
function miniSim(
  init: (p: Record<string, never>, ctx: InitCtx<{ name: string }>) => { n: number },
  handle: (ctx: EventCtx<{ n: number }, { name: string }>, ev: { name: string }) => void,
): MiniSim {
  return {
    kind: 'event', meta: toySim.meta, defaultParams: {}, paramSchema: {},
    playback: toySim.playback, init, handle, render: () => undefined, about: toySim.about,
  };
}

describe('Engine (toy ping-pong sim)', () => {
  it('same seed → identical log; different seed → different log', () => {
    const a = runHeadless(toySim, { cap: 1 }, 42, { maxEvents: 200 });
    const b = runHeadless(toySim, { cap: 1 }, 42, { maxEvents: 200 });
    const c = runHeadless(toySim, { cap: 1 }, 43, { maxEvents: 200 });
    expect(a.log).toEqual(b.log);
    expect(a.log).not.toEqual(c.log);
  });

  it('events at the same time run in schedule order', () => {
    const order: string[] = [];
    const sim = miniSim((_p, ctx) => { ctx.schedule(5, { name: 'first' }); ctx.schedule(5, { name: 'second' }); ctx.schedule(5, { name: 'third' }); return { n: 0 }; },
      (_ctx, ev) => { order.push(ev.name); });
    runHeadless(sim, {}, 1, {});
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('cancel prevents delivery', () => {
    let delivered = 0;
    const sim = miniSim((_p, ctx) => {
        const id = ctx.schedule(5, { name: 'doomed' });
        ctx.schedule(6, { name: 'survivor' });
        // cancel from a scheduled setup event at t=1
        ctx.schedule(1, { name: `cancel:${id}` });
        return { n: 0 };
      },
      (ctx, ev) => {
        if (ev.name.startsWith('cancel:')) ctx.cancel(Number(ev.name.slice(7)));
        else delivered++;
      });
    runHeadless(sim, {}, 1, {});
    expect(delivered).toBe(1);
  });

  it('zero-delay infinite loop triggers the guard instead of hanging', () => {
    const sim = miniSim((_p, ctx) => { ctx.schedule(0, { name: 'loop' }); return { n: 0 }; },
      (ctx, ev) => { ctx.schedule(0, ev); });
    expect(() => runHeadless(sim, {}, 1, { maxEvents: 5000000 })).toThrow(/zero-delay|same time|exceeded/i);
  });

  it('snapshot/restore: continuing after restore reproduces the uninterrupted log', () => {
    const engine = new Engine(toySim, { cap: 1 }, 42);
    for (let i = 0; i < 500; i++) engine.step();
    const snap = engine.snapshot();
    for (let i = 0; i < 500; i++) engine.step();
    const logA = structuredClone(engine.log);
    const stateA = structuredClone(engine.state);

    const engine2 = new Engine(toySim, { cap: 1 }, 42);
    engine2.restore(snap);
    for (let i = 0; i < 500; i++) engine2.step();
    expect(engine2.log).toEqual(logA);
    expect(engine2.state).toEqual(stateA);
    void (null as unknown as ToyEvent);
  });
});
