import type { RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import { applyParams, defaultParams, init, leaderOf, onPointer, paramSchema, step, type Params, type State } from './logic';
import { render } from './render';

const sim: RealtimeSimulation<Params, State> = {
  kind: 'realtime',
  meta,
  defaultParams,
  paramSchema,
  init,
  step,
  render,
  applyParams,
  onPointer,
  getStats: (s) => {
    const leader = leaderOf(s);
    return {
      tick: s.tick,
      leader: leader ? `N${leader.id}` : '—',
      term: leader?.term ?? Math.max(0, ...s.nodes.map((n) => n.term)),
      committed: leader?.commitIndex ?? 0,
      elections: s.electionsWon,
      inFlight: s.messages.length,
    };
  },
  about: {
    summary:
      'Raft elects one leader per term using randomised election timeouts, then replicates a log from that leader to followers, committing an entry once a majority holds it. This sim runs the real message flow — RequestVote, AppendEntries with nextIndex backtracking, majority commit — through a deterministic in-state message queue with configurable delay and seeded packet loss.',
    bullets: [
      'Click any node to crash it; click again to revive. Kill the leader (gold) and the cluster notices within one election timeout, promotes a candidate, and the new leader heals lagging logs via AppendEntries retries.',
      'Shift+click a node to force its election timer to fire next tick (a leader steps down first).',
      'Log strips under each node: filled squares are committed, hollow ones replicated-but-uncommitted. Watch commitIndex chase the leader after every write.',
      'Crank message drop rate to 30–40%: elections take longer and commit stalls, but safety holds — there is never more than one leader per term (asserted in tests).',
      'Everything is seeded: the same URL reproduces the same elections, drops and commits, tick for tick.',
    ],
    invariant: 'At most one leader per term at any tick, and after writes stop every live node converges to the leader’s log (logic.test.ts).',
  },
};

export default sim;
