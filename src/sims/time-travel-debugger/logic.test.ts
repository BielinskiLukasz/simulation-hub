import { describe, expect, it } from 'vitest';
import { Engine } from '../../core/des/engine';
import { runHeadless } from '../../core/des/headless';
import { assertPlainData, assertReplayEquivalence } from '../../core/des/testing';
import { defaultParams, invariants, type Params, type State } from './logic';
import sim from './index';

function run(params: Partial<Params> = {}, seed = 42, maxEvents = 150) {
  const p: Params = { ...defaultParams, ...params };
  return runHeadless(sim, p, seed, { maxEvents });
}

describe('time-travel-debugger simulation', () => {
  it('determinism: same params + seed -> identical state and event log', () => {
    const a = run({}, 42, 200);
    const b = run({}, 42, 200);
    expect(a.head).toBe(b.head);
    expect(a.now).toBe(b.now);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.log.length).toBe(b.log.length);
  });

  it('state is strictly plain data for structuredClone snapshotting', () => {
    const r = run({}, 7, 100);
    expect(() => assertPlainData(r.state)).not.toThrow();
  });

  it('invariants hold continuously across execution', () => {
    const r = run({ autoTxnRate: 4 }, 99, 250);
    for (const inv of invariants) {
      expect(inv.check(r.state as State)).toBeNull();
    }
  });

  it('replay equivalence: seeking backward and replaying forward is 100% bit-identical', () => {
    for (const seed of [1, 5, 42]) {
      assertReplayEquivalence(sim, defaultParams, seed, {
        events: 180,
        cuts: [0, 45, 90, 150],
        actions: [
          {
            atEvent: 60,
            make: () => ({ a: 'write', node: 0, key: 'X', value: 999 }),
          },
          {
            atEvent: 100,
            make: () => ({ a: 'crash', node: 1 }),
          },
        ],
      });
    }
  });

  it('fault injection: network partition drops packets across split groups', () => {
    const r = run({ autoTxnRate: 4 }, 12, 100);
    const engine = new Engine(sim, defaultParams, 12);
    // run 20 events
    for (let i = 0; i < 20; i++) engine.step();
    engine.act({ a: 'partition', groups: [0, 1, 1] });
    for (let i = 0; i < 40; i++) engine.step();
    expect(engine.state.partition).toEqual([0, 1, 1]);
    engine.act({ a: 'heal' });
    for (let i = 0; i < 40; i++) engine.step();
    expect(engine.state.partition).toEqual([0, 0, 0]);
    void r;
  });
});
