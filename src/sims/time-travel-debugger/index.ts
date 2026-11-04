import type { EventSimulation } from '../../core/types';
import { meta } from './meta';
import {
  applyAction, defaultParams, deriveTimeline, describeAction, handle,
  init, invariants, paramSchema, type Params, type State, type TtAction, type TtEvent,
} from './logic';
import { render } from './render';
import { mountInspector } from './inspector';

const sim: EventSimulation<Params, State, TtEvent, TtAction> = {
  kind: 'event',
  meta,
  defaultParams,
  paramSchema,
  playback: { unit: 'ms', baseRate: 1000 },
  init,
  handle,
  applyAction,
  describeAction,
  deriveTimeline: (log, now, _params) => {
    void _params;
    return deriveTimeline(log, now, lastState ?? emptyState());
  },
  invariants,
  defaultHiddenCategories: ['heartbeat'],
  render: (state, rc, view) => render(state, rc, view),
  extraTabLabel: 'Checkpoints & Branches',
  mountExtraTab: (host, ctx) => mountInspector(host, ctx),
  onCanvasAction: (state, x, y, ev) => {
    for (const node of state.nodes) {
      if (Math.hypot(node.x - x, node.y - y) <= 38) {
        if (ev.shift) {
          return { a: 'partition', groups: state.nodes.map((n) => (n.id === node.id ? 1 : 0)) };
        }
        return node.up ? { a: 'crash', node: node.id } : { a: 'recover', node: node.id };
      }
    }
    return null;
  },
  getActions: (state) => {
    const out: { label: string; action: TtAction }[] = [];
    const leader = state.nodes.find((n) => n.up && n.isLeader);
    if (leader) {
      out.push({ label: `Write SET X = 42 on Leader N${leader.id}`, action: { a: 'write', node: leader.id, key: 'X', value: 42 } });
      out.push({ label: `Write SET Y = 99 on Leader N${leader.id}`, action: { a: 'write', node: leader.id, key: 'Y', value: 99 } });
      out.push({ label: `Crash Leader N${leader.id}`, action: { a: 'crash', node: leader.id } });
    }
    const replica = state.nodes.find((n) => n.up && !n.isLeader);
    if (replica) {
      out.push({ label: `Write SET Z = 77 on Replica N${replica.id}`, action: { a: 'write', node: replica.id, key: 'Z', value: 77 } });
      out.push({ label: `Crash Replica N${replica.id}`, action: { a: 'crash', node: replica.id } });
    }
    const half = Math.floor(state.nodes.length / 2);
    out.push({ label: `Split Cluster Network (${half} | ${state.nodes.length - half})`, action: { a: 'partition', groups: state.nodes.map((n) => (n.id < half ? 0 : 1)) } });
    if (state.partition.some((g) => g !== 0)) {
      out.push({ label: 'Heal Network Partition', action: { a: 'heal' } });
    }
    out.push({ label: 'Corrupt In-Flight Packets (CRC Fault)', action: { a: 'corruptInFlight', key: 'X' } });
    for (const n of state.nodes) {
      if (!n.up) out.push({ label: `Recover N${n.id}`, action: { a: 'recover', node: n.id } });
    }
    return out;
  },
  getStats: (state) => ({
    txns: state.totalTxns,
    revX: `r${state.globalRevisions.X ?? 1}`,
    revY: `r${state.globalRevisions.Y ?? 1}`,
    revZ: `r${state.globalRevisions.Z ?? 1}`,
    packets: state.packets.length,
    dropped: state.droppedPackets,
  }),
  about: {
    summary:
      'A dedicated time-travel inspection studio over a replicated distributed state machine. Every state transition is recorded as a discrete event on an integer millisecond timeline. Scrub history backwards to any event, inspect snapshot memory checkpoints, and inject faults in the past to branch alternate futures.',
    bullets: [
      'Scrub backward through history with the scrubber or step backward with the comma (,) key: state is restored using periodic snapshots + bounded replay.',
      'Branching history: when scrubbed into the past, inject any action (e.g. partition the cluster or crash a leader) to fork into an alternate timeline.',
      'Memory checkpoints: inspect snapshot intervals in the Checkpoints tab, with sub-millisecond seek latency guaranteed by bounded replay.',
      'Verified linearizability and monotonic revision invariants checked after every single event in real time.',
      'Input logging: all interactive user actions are recorded with exact event indices, enabling 100% bit-identical reproduction and URL sharing.',
    ],
    invariant: 'Revisions are monotonic and all healthy replicas at revision R agree on the identical value.',
  },
  concepts:
    '## Time-Travel Concepts\n\n**Snapshot + Bounded Replay.** Storing every single state frame in memory exhausts RAM quickly. Instead, the player stores snapshots every N events and replays at most N events to achieve sub-millisecond seeking to any arbitrary position.\n\n**Integer Simulation Time.** Float time accumulates rounding errors and causes non-deterministic tie-breaking. Simulation Hub uses strict integer simulation units with deterministic (time, id) sequence ordering.\n\n**Branching Semantics.** Acting at event $n < \\text{maxComputed}$ truncates all recorded actions beyond $n$ and creates a new divergent future branch.\n\n**References.** Lamport, *Time, Clocks, and the Ordering of Events in a Distributed System*; Castro & Liskov, *Practical Byzantine Fault Tolerance*; Ongaro & Ousterhout, *Raft Consensus*.',
};

let lastState: State | null = null;
const baseRender = sim.render;
sim.render = (state, rc, view) => {
  lastState = state;
  baseRender(state, rc, view);
};

function emptyState(): State {
  return init(defaultParams, { rng: undefined as never, schedule: () => 0 });
}

export default sim;
