import type { EventSimulation } from '../../core/types';
import { meta } from './meta';
import { deriveTimeline, raftSim, type Params, type RaftAction, type RaftEvent, type State } from './logic';
import { raftInvariants } from './invariants';
import { render } from './render';

const sim: EventSimulation<Params, State, RaftEvent, RaftAction> = {
  ...raftSim,
  meta: { ...meta, kind: 'event' },
  invariants: raftInvariants,
  defaultHiddenCategories: ['role'],
  render: (state, rc, view) => render(state, rc, view),
  deriveTimeline: (log, now, _params) => {
    void _params;
    return deriveTimeline(log, now, lastState ?? emptyState());
  },
  onCanvasAction: (state, x, y, ev) => {
    for (const node of state.nodes) {
      if (Math.hypot(node.x - x, node.y - y) > 38) continue;
      if (ev.shift) {
        return { a: 'partition', groups: state.nodes.map((n) => (n.id === node.id ? 1 : 0)) };
      }
      return node.up ? { a: 'crash', node: node.id } : { a: 'restart', node: node.id };
    }
    return null;
  },
  getActions: (state) => {
    const out: { label: string; action: RaftAction }[] = [];
    const leader = state.nodes.find((n) => n.up && n.role === 2);
    if (leader) {
      out.push({ label: `Crash leader N${leader.id}`, action: { a: 'crash', node: leader.id } });
      out.push({ label: `Isolate leader N${leader.id}`, action: { a: 'partition', groups: state.nodes.map((n) => (n.id === leader.id ? 1 : 0)) } });
      out.push({ label: `Propose command via N${leader.id}`, action: { a: 'propose', node: leader.id } });
    }
    const half = Math.floor(state.nodes.length / 2);
    out.push({ label: `Split cluster ${half}|${state.nodes.length - half}`, action: { a: 'partition', groups: state.nodes.map((n) => (n.id < half ? 0 : 1)) } });
    if (state.partition.some((g) => g !== 0)) out.push({ label: 'Heal partition', action: { a: 'heal' } });
    for (const n of state.nodes) if (!n.up) out.push({ label: `Restart N${n.id}`, action: { a: 'restart', node: n.id } });
    return out;
  },
  about: {
    summary:
      'Raft as a discrete-event system: elections, votes, AppendEntries replication and majority commit are events on an integer-millisecond timeline. Crash nodes, partition the cluster, scrub back through an election, then branch and crash someone else — while five safety invariants are checked after every event.',
    bullets: [
      'Split-brain prevention you can watch: isolate the leader (Actions tab), it keeps appending but can never commit; heal, and its conflicting entries are truncated by the new leader’s log.',
      'The invariant badge is green only while election safety, log matching, state-machine safety, leader completeness and apply consistency all hold. Set “Injected bug” to doubleVote or commitOldTermByCount and fuzz — the badge catches it.',
      'Vote for the timeline: lanes show each node’s role over time; commit markers land when a leader’s commitIndex advances.',
      'Figure-8 rule included: a leader commits an old-term entry only indirectly, through a current-term entry.',
      'Scenarios (leader-crash, isolate-leader, split-2-3, flaky-network) are deterministic scripts in the event stream, so they replay and time-travel exactly.',
    ],
    invariant: 'At most one leader per term, and committed entries are never lost — fuzzed over hundreds of seeds with crashes, partitions and 30% message loss.',
  },
  concepts:
    '## Concepts\n\n**Why one leader per term is the whole ballgame.** If two leaders could commit different entries at the same index, replicas diverge permanently. Raft’s election restriction (a candidate needs a majority, and majorities intersect) makes two leaders in one term impossible — the first invariant in the badge checks exactly this.\n\n**Figure 8.** A leader must not commit a previous term’s entry by counting replicas: that entry could still be overwritten. It commits only once an entry from its own term is committed on top of it.\n\n**Terms as logical clocks.** Terms detect stale leaders and stale RPCs without any wall-clock agreement — which is why this sim needs no global clock, only integer event times.\n\n**References.** Ongaro & Ousterhout, *In Search of an Understandable Consensus Algorithm* (USENIX ATC 2014); Ongaro’s PhD dissertation (2014); raft.github.io.\n\n*Teaching model, not production consensus: no membership changes, compaction, PreVote, or linearizable reads.*',
};

// deriveTimeline needs live state; render() (called every frame by the
// shell before timeline refreshes) keeps the latest one here.
let lastState: State | null = null;
const baseRender = sim.render;
sim.render = (state, rc, view) => {
  lastState = state;
  baseRender(state, rc, view);
};

function emptyState(): State {
  return {
    nodes: [], partition: [], inFlight: [], nextMsgId: 1, nextCmd: 1, committed: [],
    leaderByTerm: {}, stats: { elections: 0, leaderChanges: 0, dropped: 0 },
    scenarioStage: 0, scenarioNode: -1, params: raftSim.defaultParams, w: 800, h: 600,
  };
}

export default sim;
