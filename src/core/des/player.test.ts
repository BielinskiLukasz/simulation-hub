import { describe, expect, it } from 'vitest';
import { Player } from './player';
import { assertPlainData, assertReplayEquivalence } from './testing';
import { toySim } from './toy';

const PARAMS = { cap: 1 };

describe('Player time-travel (toy sim)', () => {
  it('replay equivalence: seek to cuts and finish → identical log + state (10 seeds)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      assertReplayEquivalence(toySim, PARAMS, seed, {
        events: 400,
        cuts: [0, 37, 137, 399],
        actions: [{ atEvent: 150, make: () => ({ add: 5 }) }],
      });
    }
  });

  it('seek round trip: 1000 → 137 → 1000 reproduces state and log exactly', () => {
    const p = new Player(toySim, PARAMS, 42);
    while (p.head < 1000) p.stepEvent();
    const stateJson = JSON.stringify(p.state);
    const logJson = JSON.stringify(p.log);
    p.seekEvent(137);
    expect(p.head).toBe(137);
    p.seekEvent(1000);
    expect(JSON.stringify(p.state)).toBe(stateJson);
    expect(JSON.stringify(p.log)).toBe(logJson);
  });

  it('actions survive seeking: act at 400, seek to 100, seek to 900 → effect present', () => {
    const p = new Player(toySim, PARAMS, 7);
    while (p.head < 400) p.stepEvent();
    p.act({ add: 33 });
    while (p.head < 900) p.stepEvent();
    const withAction = JSON.stringify(p.state);
    p.seekEvent(100);
    expect(p.state.bonus).toBe(0);
    p.seekEvent(900);
    expect(JSON.stringify(p.state)).toBe(withAction);
    expect(p.state.bonus).toBe(33);
  });

  it('branching: acting in the past discards the old future', () => {
    const p = new Player(toySim, PARAMS, 7);
    while (p.head < 300) p.stepEvent();
    p.act({ add: 1 });
    while (p.head < 600) p.stepEvent();
    const oldFuture = JSON.stringify(p.state);
    p.seekEvent(200);
    const res = p.act({ add: 100 });
    expect(res.branched).toBe(true);
    expect(p.maxComputed).toBe(200);
    while (p.head < 600) p.stepEvent();
    expect(JSON.stringify(p.state)).not.toBe(oldFuture);
    expect(p.state.bonus).toBe(100);
    expect(p.log.some((e) => e.cat === 'action' && e.text.includes('100'))).toBe(true);
  });

  it('snapshot thinning: maxSnapshots=5 over 1000 events still seeks correctly', () => {
    const ref = new Player(toySim, PARAMS, 3);
    while (ref.head < 333) ref.stepEvent();
    const refState = JSON.stringify(ref.state);
    const p = new Player(toySim, PARAMS, 3, { snapshotEvery: 10, maxSnapshots: 5 });
    while (p.head < 1000) p.stepEvent();
    p.seekEvent(333);
    expect(JSON.stringify(p.state)).toBe(refState);
  });

  it('playback guard: a huge wall-clock jump is bounded by maxEvents', () => {
    const p = new Player(toySim, PARAMS, 3);
    p.advance(3600, 1); // an hour at 1× — must not process unbounded events
    expect(p.head).toBeLessThanOrEqual(2001);
  });

  it('stepBack moves exactly one event into the past', () => {
    const p = new Player(toySim, PARAMS, 3);
    while (p.head < 50) p.stepEvent();
    const nowAt50 = p.now;
    p.stepBack();
    expect(p.head).toBe(49);
    expect(p.now).toBeLessThanOrEqual(nowAt50);
  });
});

describe('assertPlainData', () => {
  it('accepts plain data incl. typed arrays; rejects class instances and functions', () => {
    expect(() => assertPlainData({ a: [1, { b: new Float32Array(3) }], c: 'x' })).not.toThrow();
    class Foo { x = 1; }
    expect(() => assertPlainData({ f: new Foo() })).toThrow(/class instance/);
    expect(() => assertPlainData({ fn: () => 1 })).toThrow(/function/);
  });
});
