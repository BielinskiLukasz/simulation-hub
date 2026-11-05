import { describe, expect, it } from 'vitest';
import { Engine } from '../../core/des/engine';
import { assertPlainData, assertReplayEquivalence } from '../../core/des/testing';
import { checkBook } from './book';
import { defaultParams, marketSim, type Params } from './sim';
import sim from './index';

const P = (over: Partial<Params> = {}): Params => ({ ...defaultParams, preset: 'flash-crash', ...over });

describe('market simulation', () => {
  it('determinism + invariants after every event', () => {
    const a = new Engine(sim, P(), 4, undefined);
    const b = new Engine(sim, P(), 4, undefined);
    for (let i = 0; i < 600; i++) {
      a.step(); b.step();
      for (const inv of sim.invariants ?? []) expect(inv.check(a.state)).toBeNull();
      expect(checkBook(a.state.book)).toBeNull();
    }
    expect(a.state.tradeCount).toBe(b.state.tradeCount);
    expect(a.state.lastPrice).toBe(b.state.lastPrice);
    expect(a.state.volume).toBe(b.state.volume);
    expect(() => assertPlainData(a.state)).not.toThrow();
  });

  it('replay equivalence with a shock action and a seek branch', () => {
    for (const seed of [1, 2]) {
      assertReplayEquivalence(sim, P({ preset: 'calm' }), seed, {
        events: 160, cuts: [0, 60, 159],
        actions: [{ atEvent: 40, make: () => ({ a: 'shock', side: 1, qty: 120 }) }],
      });
    }
  });

  it('market makers exist and seeded book starts uncrossed', () => {
    const e = new Engine(sim, P({ preset: 'calm' }), 1, undefined);
    e.runUntil(1, 10000);
    expect(e.state.agents.filter((a) => a.type === 1).length).toBeGreaterThan(0);
    expect(checkBook(e.state.book)).toBeNull();
    expect(marketSim.isFinished!(e.state)).toBe(false);
  });
});
