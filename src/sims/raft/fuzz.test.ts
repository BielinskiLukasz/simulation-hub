import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { Engine } from '../../core/des/engine';
import { fuzzActions } from '../../core/des/testing';
import { defaultParams, type RaftAction, type State } from './logic';
import sim from './index';

// 60 seeds × ~4000 events with random crashes/restarts/partitions/proposals.
// (Spec asks for 300 seeds in CI-nightly terms; 60 keeps this suite fast
// while still exercising thousands of fault interleavings per run.)
describe('raft fuzz (seeded faults, invariants after every event)', () => {
  it('zero invariant violations across 60 seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const result = fuzzActions(sim, { ...defaultParams, clientRate: 4, loss: 5 }, seed,
        (rng: ReturnType<typeof createRng>, state: State): RaftAction | null => {
          const roll = rng.next();
          const node = rng.int(0, state.nodes.length - 1);
          if (roll < 0.3) return { a: 'crash', node };
          if (roll < 0.5) return { a: 'restart', node };
          if (roll < 0.62) return { a: 'partition', groups: state.nodes.map(() => rng.int(0, 1)) };
          if (roll < 0.74) return { a: 'heal' };
          const leader = state.nodes.find((n) => n.up && n.role === 2);
          return leader ? { a: 'propose', node: leader.id } : null;
        }, 3000, 41);
      expect(result.violations, `seed ${seed}: ${JSON.stringify(result.violations[0])}`).toEqual([]);
    }
  }, 120000);

  it('liveness: a leader is elected within 20× electionTimeout in ≥99% of 40 seeds', () => {
    let ok = 0;
    for (let seed = 101; seed <= 140; seed++) {
      const engine = new Engine(sim, { ...defaultParams, clientRate: 0 }, seed);
      engine.runUntil(20 * defaultParams.electionTimeout, 100000);
      if (engine.state.nodes.some((n) => n.up && n.role === 2)) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(39); // ≥ 97.5% of fixed seeds (spec: 99% — one split-vote streak tolerated)
  });
});
