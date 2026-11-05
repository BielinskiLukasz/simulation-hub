import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { Engine } from '../../core/des/engine';
import { runHeadless } from '../../core/des/headless';
import { assertPlainData, assertReplayEquivalence } from '../../core/des/testing';
import { validateGraph } from '../../core/graph/graph';
import { compileEpidemic, defaultParams, finalSizePrediction, transmissibility, type Params } from './sim';
import sim from './index';

const P = (over: Partial<Params> = {}): Params => ({ ...defaultParams, nodes: 300, graphSeed: 77, ...over });

describe('epidemic', () => {
  it('graph compile: valid simple graph, deterministic given seed, rescaled by graphSeed', () => {
    const a = compileEpidemic(P(), undefined, 5);
    const b = compileEpidemic(P(), undefined, 5);
    expect(validateGraph(a.graph)).toBeNull();
    expect(Array.from(a.graph.adj)).toEqual(Array.from(b.graph.adj));
    expect(a.removed.reduce((x, y) => x + y, 0)).toBe(Math.floor((P().vaccinated / 100) * P().nodes));
    const noVax = compileEpidemic(P({ vaccination: 'none', vaccinated: 0 }), undefined, 5);
    expect(noVax.rEarly).toBeCloseTo(transmissibility(P().beta, P().gamma) * (noVax.moments.k2 - noVax.moments.k1) / noVax.moments.k1, 9);
  });

  it('determinism and replay equivalence with infect/vaccinate actions', () => {
    const a = runHeadless(sim, P(), 3, { input: {}, maxEvents: 20000 });
    const b = runHeadless(sim, P(), 3, { input: {}, maxEvents: 20000 });
    expect(a.head).toBe(b.head);
    expect(Array.from(a.state.status)).toEqual(Array.from(b.state.status));
    expect(() => assertPlainData(a.state)).not.toThrow();
    for (const seed of [1, 2]) {
      assertReplayEquivalence(sim, P({ nodes: 120, vaccines: 0 } as never), seed, {
        events: 80,
        cuts: [0, 20, 60],
        actions: [{ atEvent: 10, make: () => ({ a: 'vaccinate', node: 3 }) }],
      });
    }
  });

  it('invariants hold after every event and vaccinated nodes never get infected', () => {
    const engine = new Engine(sim, P({ nodes: 200, vaccinated: 25 }), 9, undefined);
    let guard = 0;
    while (guard++ < 20000) {
      if (!engine.step()) break;
      for (const inv of sim.invariants ?? []) expect(inv.check(engine.state)).toBeNull();
    }
    const shared = engine.shared;
    for (let i = 0; i < shared.graph.n; i++) if (shared.removed[i]) expect(engine.state.status[i]).toBe(4);
    expect(guard).toBeLessThan(20000);
  });

  it('single edge: P(B infected) ≈ transmissibility over many runs', () => {
    const p: Params = { ...defaultParams, nodes: 2, topology: 'erdos-renyi', meanDegree: 1, graphSeed: 5, vaccination: 'none', vaccinated: 0, seeds: 1, model: 'SIR', beta: 0.8, gamma: 0.4 };
    let infected = 0;
    const N = 300;
    for (let s = 0; s < N; s++) {
      const engine = new Engine({ ...sim, compile: () => {
        // force a single edge, node 0 seed
        const shared = compileEpidemic({ ...p, nodes: 3, meanDegree: 2, graphSeed: 1 }, undefined, 1);
        return { ...shared, graph: { n: 2, m: 1, offsets: Int32Array.from([0, 1, 1]), adj: Int32Array.from([1, 0]) }, removed: new Uint8Array(2), vaccinatedCount: 0 };
      } }, p, s, undefined);
      // seed is chosen randomly; force node 0
      engine.state.status.fill(0); engine.state.counts = [2, 0, 0, 0, 0];
      engine.act({ a: 'infect', node: 0 });
      let guard = 0;
      while (guard++ < 2000 && engine.step()) { /* run */ }
      if (engine.state.status[1] === 3) infected++;
    }
    const T = transmissibility(p.beta, p.gamma);
    expect(infected / N).toBeGreaterThan(T - 0.10);
    expect(infected / N).toBeLessThan(T + 0.10);
  }, 30000);

  it('vaccination: degree strategy removes top degrees; final size theory sane', () => {
    const p = P({ nodes: 400, vaccination: 'degree', vaccinated: 20, graphSeed: 12 });
    const shared = compileEpidemic(p, undefined, 12);
    expect(shared.vaccinatedCount).toBe(Math.floor(0.2 * 400));
    const ds = Array.from({ length: shared.graph.n }, (_, i) => shared.graph.offsets[i + 1]! - shared.graph.offsets[i]!);
    const removedDegrees = ds.filter((_, i) => shared.removed[i]);
    const keptDegrees = ds.filter((_, i) => !shared.removed[i]);
    expect(Math.min(...removedDegrees)).toBeGreaterThanOrEqual(Math.max(...keptDegrees) - 0);
    const regular = [0, 0, 0, 1];
    expect(finalSizePrediction(regular, 1)).toBeCloseTo(1, 6);
    expect(finalSizePrediction(regular, 0)).toBeCloseTo(0, 6);
    void createRng;
  });
});
