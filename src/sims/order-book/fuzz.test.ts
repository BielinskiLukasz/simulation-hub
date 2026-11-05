import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { Engine } from '../../core/des/engine';
import { checkBook, createBook, submit, cancel, liveCount } from './book';
import { defaultParams, type MarketAction, type State } from './sim';
import sim from './index';

describe('market fuzz', () => {
  it('all invariants hold after every event over 30 seeds with random shocks', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const engine = new Engine(sim, { ...defaultParams, preset: 'flash-crash' }, seed, undefined);
      const rng = createRng(seed ^ 0x77);
      for (let e = 0; e < 800; e++) {
        if (e % 127 === 0) engine.act({ a: 'shock', side: rng.next() < 0.5 ? 0 : 1, qty: rng.int(20, 120) } as MarketAction);
        if (!engine.step()) break;
        for (const inv of sim.invariants ?? []) expect(inv.check(engine.state)).toBeNull();
        expect(checkBook(engine.state.book)).toBeNull();
      }
    }
  }, 120000);

  it('mutation: stale ids never cancel recycled slots', async () => {
    const b = createBook();
    const first = submit(b, { side: 1, price: 100, qty: 4, trader: 1 }, []);
    expect(cancel(b, first.id)).toBe(true);
    const stale = first.id;
    const next = submit(b, { side: 1, price: 100, qty: 4, trader: 2 }, []);
    expect(next.id).not.toBe(stale);
    expect(cancel(b, stale)).toBe(false);
    expect(liveCount(b)).toBe(1);
    expect(checkBook(b)).toBeNull();
    void (null as unknown as State);
  });
});
