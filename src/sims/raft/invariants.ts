// ─── Raft · invariants.ts — pure safety checks over plain state ─────────────
// Run after every event in fuzz tests and live in the UI badge. Each check
// is formulated over current state (+ history the state itself records:
// leaderByTerm and the global committed record).

import type { Invariant } from '../../core/types';
import type { State } from './logic';

function entryEq(a: { term: number; cmd: number } | undefined, b: { term: number; cmd: number } | undefined): boolean {
  return !!a && !!b && a.term === b.term && a.cmd === b.cmd;
}

export const raftInvariants: Invariant<State>[] = [
  {
    id: 'election-safety',
    label: 'Election safety (≤1 leader per term)',
    check(state) {
      const seen = new Map<number, number>();
      for (const n of state.nodes) {
        if (!n.up || n.role !== 2) continue;
        const prev = seen.get(n.currentTerm);
        if (prev !== undefined && prev !== n.id) return `term ${n.currentTerm}: leaders N${prev} and N${n.id}`;
        seen.set(n.currentTerm, n.id);
        const recorded = state.leaderByTerm[n.currentTerm];
        if (recorded !== undefined && recorded !== n.id) return `term ${n.currentTerm} recorded leader N${recorded}, found N${n.id}`;
      }
      return null;
    },
  },
  {
    id: 'log-matching',
    label: 'Log matching (same index+term ⇒ same prefix)',
    check(state) {
      const nodes = state.nodes;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!.log;
          const b = nodes[j]!.log;
          const min = Math.min(a.length, b.length);
          for (let k = 0; k < min; k++) {
            if (a[k]!.term === b[k]!.term) {
              for (let m = 0; m <= k; m++) {
                if (!entryEq(a[m], b[m])) return `N${i}/N${j} logs share term at index ${k + 1} but differ at ${m + 1}`;
              }
            }
          }
        }
      }
      return null;
    },
  },
  {
    id: 'state-machine-safety',
    label: 'State machine safety (applied = committed prefix)',
    check(state) {
      for (const n of state.nodes) {
        for (let i = 0; i < n.applied.length; i++) {
          const committed = state.committed[i];
          if (!committed || committed.cmd !== n.applied[i]) {
            return `N${n.id} applied cmd ${n.applied[i]} at index ${i + 1}, committed record says ${committed?.cmd ?? '∅'}`;
          }
          if (!entryEq(n.log[i], committed)) return `N${n.id} log[${i + 1}] differs from the committed record`;
        }
      }
      return null;
    },
  },
  {
    id: 'leader-completeness',
    label: 'Leader completeness (committed ⊆ higher-term leaders’ logs)',
    check(state) {
      // Paper formulation: an entry committed in an earlier term must be
      // present in every leader of a HIGHER term. A stale same/lower-term
      // leader (e.g. partitioned, not yet stepped down) is exempt.
      for (const n of state.nodes) {
        if (!n.up || n.role !== 2) continue;
        for (let i = 0; i < state.committed.length; i++) {
          if (n.currentTerm <= state.committed[i]!.term) continue;
          if (!entryEq(n.log[i], state.committed[i])) {
            return `leader N${n.id} (term ${n.currentTerm}) is missing committed entry ${i + 1}`;
          }
        }
      }
      return null;
    },
  },
  {
    id: 'apply-consistency',
    label: 'Apply consistency (lastApplied = |applied| ≤ commitIndex ≤ |log|)',
    check(state) {
      for (const n of state.nodes) {
        if (n.lastApplied !== n.applied.length) return `N${n.id}: lastApplied ${n.lastApplied} ≠ applied ${n.applied.length}`;
        if (n.commitIndex > n.log.length) return `N${n.id}: commitIndex ${n.commitIndex} beyond log ${n.log.length}`;
        if (n.lastApplied > n.commitIndex) return `N${n.id}: applied beyond commitIndex`;
      }
      return null;
    },
  },
];
