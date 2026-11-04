import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { fuzzActions } from '../../core/des/testing';
import { findCommitAdvance, logUpToDate } from './logic';
import { defaultParams, type RaftAction, type State } from './logic';
import sim from './index';

// Mutation testing: deliberately broken rules MUST be caught — by the pure
// rule tests directly, and by the invariant fuzz for the behavioural ones.
// If a bug here ever stops being caught, the invariants are too weak.
describe('mutation: injected bugs are caught', () => {
  it('commitOldTermByCount commits what the correct rule refuses (unit)', () => {
    const log = [{ term: 1, cmd: 7 }];
    expect(findCommitAdvance(log, [1, 1, 1, 0, 0], 0, 5, 2, 0, 'commitOldTermByCount')).toBe(1);
    expect(findCommitAdvance(log, [1, 1, 1, 0, 0], 0, 5, 2, 0, 'none')).toBe(0);
  });

  it('ignoreLogUpToDate grants votes the correct rule denies (unit)', () => {
    expect(logUpToDate(1, 1, 1, 9, 'ignoreLogUpToDate')).toBe(true);
    expect(logUpToDate(1, 1, 1, 9, 'none')).toBe(false);
  });

  it('doubleVote and skipTruncate produce invariant violations under fuzz', () => {
    for (const bugMode of ['doubleVote', 'skipTruncate'] as const) {
      let found = 0;
      for (let seed = 1; seed <= 14 && found === 0; seed++) {
        const result = fuzzActions(sim, { ...defaultParams, clientRate: 5, bugMode }, seed,
          (rng: ReturnType<typeof createRng>, state: State): RaftAction | null => {
            const roll = rng.next();
            const node = rng.int(0, state.nodes.length - 1);
            if (roll < 0.35) return { a: 'crash', node };
            if (roll < 0.55) return { a: 'restart', node };
            if (roll < 0.7) return { a: 'partition', groups: state.nodes.map(() => rng.int(0, 1)) };
            if (roll < 0.8) return { a: 'heal' };
            const leader = state.nodes.find((n) => n.up && n.role === 2);
            return leader ? { a: 'propose', node: leader.id } : null;
          }, 3500, 29);
        found = result.violations.length;
      }
      expect(found, `bug ${bugMode} was NOT caught by the invariants`).toBeGreaterThan(0);
    }
  }, 180000);
});
