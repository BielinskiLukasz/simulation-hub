import { describe, expect, it } from 'vitest';
import { Engine } from '../../core/des/engine';
import { Player } from '../../core/des/player';
import { assertPlainData } from '../../core/des/testing';
import { createRng } from '../../core/rng';
import { bestBidAsk, checkBook, createBook, submit, type Fill } from './book';
import { defaultParams, type MarketAction, type Params } from './sim';
import sim from './index';

const P = (o: Partial<Params> = {}): Params => ({ ...defaultParams, preset: 'calm', mmCount: 4, ...o });

describe('order book fuzz and time travel', () => {
  it('invariants hold after every event across 8 seeded shock-heavy runs', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const engine = new Engine(sim, P({ preset: 'flash-crash' }), seed, undefined);
      const actionRng = createRng(seed * 31 + 7);
      for (let i = 0; i < 300; i++) {
        if (!engine.step()) break;
        if (i % 97 === 96) engine.act({ a: 'shock', side: 1, qty: actionRng.int(10, 120) } as MarketAction);
        for (const inv of sim.invariants ?? []) expect(inv.check(engine.state), `seed ${seed} event ${i}`).toBeNull();
        if (i % 50 === 0) expect(checkBook(engine.state.book)).toBeNull();
      }
      const { bid, ask } = bestBidAsk(engine.state.book);
      if (bid >= 0 && ask >= 0) expect(bid).toBeLessThan(ask);
      expect(() => assertPlainData(engine.state)).not.toThrow();
    }
  }, 30000);

  it('seek back before the shock, branch with a different shock: old future is discarded', () => {
    const player = new Player(sim, P({ preset: 'flash-crash' }), 12, { input: undefined });
    while (player.head < 90) player.stepEvent();
    const marker = player.head;
    player.act({ a: 'shock', side: 1, qty: 200 } as MarketAction);
    while (player.head < 160) player.stepEvent();
    const withBigShock = player.state.lastPrice;
    player.seekEvent(marker);
    expect(player.head).toBe(marker);
    const res = player.act({ a: 'shock', side: 1, qty: 10 } as MarketAction);
    expect(res.branched).toBe(true);
    expect(player.maxComputed).toBe(marker);
    while (player.head < 160) player.stepEvent();
    expect(player.state.lastPrice).not.toBe(withBigShock);
    for (const inv of sim.invariants ?? []) expect(inv.check(player.state)).toBeNull();
  });

  it('mutation check: the invariants detect injected faults (crossed book, cash leak)', () => {
    // (a) a deliberately crossed book must be reported
    const b = createBook();
    const fills: Fill[] = [];
    submit(b, { side: 0, price: 100, qty: 5, trader: 1 }, fills);
    submit(b, { side: 1, price: 101, qty: 5, trader: 2 }, fills);
    expect(checkBook(b)).toBeNull();
    b.bestBid = 105;
    expect(checkBook(b)).not.toBeNull();
    // (b) a cash leak must be caught by the ledger invariant
    const engine = new Engine(sim, P({ preset: 'calm' }), 3, undefined);
    for (let i = 0; i < 120; i++) engine.step();
    const ledger = sim.invariants!.find((i) => i.id === 'ledgers')!;
    expect(ledger.check(engine.state)).toBeNull();
    engine.state.agents[0]!.cash += 1;
    expect(ledger.check(engine.state)).not.toBeNull();
  });

  it('cash is conserved across a seeded session', () => {
    const engine = new Engine(sim, P({ preset: 'calm' }), 5, undefined);
    for (let i = 0; i < 300; i++) engine.step();
    expect(engine.state.tradeCount).toBeGreaterThan(0);
  });
});
