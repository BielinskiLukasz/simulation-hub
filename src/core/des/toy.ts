// Shared toy event sim for engine/player tests: ping-pong with seeded delays.
import type { EventSimulation } from '../types';

export interface ToyState { count: number; bonus: number; lastN: number }
export type ToyEvent = { t: 'ping'; n: number } | { t: 'cancelMe'; id: number };
export type ToyAction = { add: number };

export const toySim: EventSimulation<{ cap: number }, ToyState, ToyEvent, ToyAction> = {
  kind: 'event',
  meta: { id: 'toy', title: 'Toy', kind: 'event', category: 'algorithms', description: '', tags: [], difficulty: 'easy', thumbnail: '', accent: '#000' },
  defaultParams: { cap: 100000 },
  paramSchema: { cap: { kind: 'number', label: 'cap' } },
  playback: { unit: 'ms', baseRate: 1000 },
  init: (_params, ctx) => {
    ctx.schedule(5, { t: 'ping', n: 0 });
    return { count: 0, bonus: 0, lastN: -1 };
  },
  handle: (ctx, ev) => {
    if (ev.t === 'ping') {
      ctx.state.count++;
      ctx.state.lastN = ev.n;
      ctx.log({ cat: 'ping', actor: null, text: `ping ${ev.n}` });
      if (ev.n < 100000) ctx.schedule(ctx.rng.int(1, 10), { t: 'ping', n: ev.n + 1 });
    }
  },
  applyAction: (ctx, action) => {
    ctx.state.bonus += action.add;
  },
  describeAction: (a) => `bonus +${a.add}`,
  render: () => undefined,
  isFinished: (s) => s.count > 100000,
  about: { summary: '', bullets: [], invariant: '' },
};
