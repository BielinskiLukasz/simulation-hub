import { describe, expect, it } from 'vitest';
import { Engine } from '../../core/des/engine';
import { assertPlainData, assertReplayEquivalence } from '../../core/des/testing';
import {
  EXAMPLES, compileNetlist, decodeNetlist, encodeNetlist, evaluateCombinational,
  exportNetlistJson, importNetlistJson, truthTable, validateNetlist, verifyAdder, X,
  type Netlist,
} from './model';
import { circuitSim, defaultParams, type CircuitAction, type State } from './sim';
import sim from './index';

describe('circuit logic core', () => {
  it('gate truth tables (2-valued) and X-consensus for AND/OR/XOR', () => {
    const and = compileNetlist({ comps: [
      { id: 1, type: 'switch', x: 0, y: 0, inputs: 0, delay: 1, label: 'A' },
      { id: 2, type: 'switch', x: 0, y: 1, inputs: 0, delay: 1, label: 'B' },
      { id: 3, type: 'and', x: 2, y: 0, inputs: 2, delay: 1, label: 'AND' },
      { id: 4, type: 'led', x: 4, y: 0, inputs: 1, delay: 1, label: 'Y' },
    ], wires: [
      { id: 5, from: 1, to: 3, pin: 0 }, { id: 6, from: 2, to: 3, pin: 1 }, { id: 7, from: 3, to: 4, pin: 0 },
    ], nextId: 8 });
    const table = truthTable(and);
    expect(table.rows.map((r) => r.outputs[0])).toEqual([0, 0, 0, 1]);
    // X consensus: AND(1, X) = X, AND(0, X) = 0 (via evaluator with an unconnected input)
    const open = compileNetlist({ comps: [
      { id: 1, type: 'switch', x: 0, y: 0, inputs: 0, delay: 1, label: 'A' },
      { id: 2, type: 'and', x: 2, y: 0, inputs: 2, delay: 1, label: 'AND' },
    ], wires: [{ id: 3, from: 1, to: 2, pin: 0 }], nextId: 4 });
    const values = new Uint8Array(open.n); values[0] = 1;
    expect(evaluateCombinational(open, values)[1]).toBe(X);
    values[0] = 0;
    expect(evaluateCombinational(open, values)[1]).toBe(0);
  });

  it('validation rejects double drivers, bad pins and oversize netlists', () => {
    const bad: Netlist = { comps: [
      { id: 1, type: 'switch', x: 0, y: 0, inputs: 0, delay: 1, label: 'A' },
      { id: 2, type: 'switch', x: 0, y: 1, inputs: 0, delay: 1, label: 'B' },
      { id: 3, type: 'and', x: 2, y: 0, inputs: 2, delay: 1, label: 'AND' },
    ], wires: [
      { id: 4, from: 1, to: 3, pin: 0 }, { id: 5, from: 2, to: 3, pin: 0 },
    ], nextId: 6 };
    expect(validateNetlist(bad)).toMatch(/two drivers/);
    expect(validateNetlist({ comps: [{ id: 1, type: 'and', x: 0, y: 0, inputs: 2, delay: 1, label: 'A' }], wires: [{ id: 2, from: 1, to: 1, pin: 7 }], nextId: 3 })).toMatch(/out of range/);
  });

  it('codec round-trips examples and random-ish nets; garbage returns null', () => {
    for (const make of Object.values(EXAMPLES)) {
      const net = make();
      expect(decodeNetlist(encodeNetlist(net))).toEqual(net);
      expect(importNetlistJson(exportNetlistJson(net))).toEqual(net);
    }
    expect(decodeNetlist('not-a-netlist!!')).toBeNull();
    expect(decodeNetlist(encodeNetlist(EXAMPLES['half-adder']!()).slice(0, 5))).toBeNull();
    expect(importNetlistJson('{"comps":42}')).toBeNull();
  });

  it('4-bit adder: all 512 combinations verified', () => {
    const compiled = compileNetlist(EXAMPLES['adder-4bit']!());
    const result = verifyAdder(compiled);
    expect(result).toEqual({ ok: true, checked: 512 });
    const tt = truthTable(compileNetlist(EXAMPLES['half-adder']!()));
    expect(tt.rows.length).toBe(4);
  });
});

describe('circuit event simulation', () => {
  it('settles to the topological evaluator on the examples (differential)', () => {
    for (const name of ['half-adder', 'full-adder', 'adder-4bit'] as const) {
      const net = EXAMPLES[name]!();
      const compiled = compileNetlist(net);
      const engine = new Engine(circuitSim, defaultParams, 42, net);
      engine.runToEnd(100000);
      const expected = evaluateCombinational(compiled, new Uint8Array(compiled.n));
      expect(Array.from(engine.state.out)).toEqual(Array.from(expected));
      expect(() => assertPlainData(engine.state)).not.toThrow();
    }
  });

  it('ring oscillator period is exactly 6 ticks (3 NOTs, delay 1)', () => {
    const net = EXAMPLES['ring-oscillator']!();
    const engine = new Engine(circuitSim, defaultParams, 1, net);
    const transitions: number[] = [];
    let last = -1;
    for (let i = 0; i < 200; i++) {
      engine.step();
      const outIdx = engine.shared.indexById.get(net.comps.find((c) => c.label === 'N3')!.id)!;
      const v = engine.state.out[outIdx]!;
      if (v !== last && v !== X) { transitions.push(engine.now); last = v; }
    }
    const diffs = transitions.slice(1).map((t, i) => t - transitions[i]!);
    expect(diffs.length).toBeGreaterThan(4);
    expect(diffs.every((d) => d === 3)).toBe(true); // full period 6 = two transitions of 3
  });

  it('SR latch starts X, sets, holds, resets', () => {
    const net = EXAMPLES['sr-latch']!();
    const engine = new Engine(circuitSim, defaultParams, 1, net);
    engine.runUntil(5, 10000);
    const q = engine.shared.indexById.get(net.comps.find((c) => c.label === 'Q')!.id)!;
    expect(engine.state.out[q]).toBe(X);
    const S = net.comps.find((c) => c.label === 'S')!.id;
    const R = net.comps.find((c) => c.label === 'R')!.id;
    engine.act({ a: 'set', comp: S, value: 1 } as CircuitAction);
    engine.runUntil(engine.now + 20, 10000);
    expect(engine.state.out[q]).toBe(1);
    engine.act({ a: 'set', comp: S, value: 0 } as CircuitAction);
    engine.runUntil(engine.now + 20, 10000);
    expect(engine.state.out[q]).toBe(1); // holds
    engine.act({ a: 'set', comp: R, value: 1 } as CircuitAction);
    engine.runUntil(engine.now + 20, 10000);
    expect(engine.state.out[q]).toBe(0);
  });

  it('replay equivalence with switch toggles', () => {
    for (const seed of [1, 2]) {
      assertReplayEquivalence(sim, defaultParams, seed, {
        events: 160,
        cuts: [0, 50, 159],
        actions: [{ atEvent: 40, make: (s) => {
          const state = s as State;
          void state;
          const net = EXAMPLES['half-adder']!();
          return { a: 'toggle', comp: net.comps.find((c) => c.label === 'A')!.id };
        } }],
      });
    }
  });
});
