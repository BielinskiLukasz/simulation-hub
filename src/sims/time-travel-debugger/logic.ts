// ─── Time-Travel Debugger · logic.ts ─────────────────────────────────────────
// Replicated distributed state machine specifically instrumented for
// time-travel inspection: memory checkpoints, branching tree tracking,
// linearizable register safety invariants, and fault injection.

import type { EventCtx, InitCtx, Invariant, LogEntry, ParamSchema, TimelineData } from '../../core/types';

export interface Params {
  nodes: number;
  autoTxnRate: number; // transactions/sec
  msgDelay: number; // ms
  packetDropPct: number; // %
  snapshotInterval: number; // events
}

export const defaultParams: Params = {
  nodes: 3,
  autoTxnRate: 2,
  msgDelay: 35,
  packetDropPct: 0,
  snapshotInterval: 50,
};

export const paramSchema: ParamSchema<Params> = {
  nodes: { kind: 'range', label: 'Cluster nodes', min: 3, max: 5, step: 1, hint: 'Re-inits' },
  autoTxnRate: { kind: 'range', label: 'Auto write rate', min: 0, max: 8, step: 0.5, unit: 'tx/s', live: true },
  msgDelay: { kind: 'range', label: 'Network latency', min: 10, max: 120, step: 5, unit: 'ms', live: true },
  packetDropPct: { kind: 'range', label: 'Network packet drop', min: 0, max: 40, step: 1, unit: '%', live: true },
  snapshotInterval: { kind: 'range', label: 'Snapshot interval', min: 25, max: 150, step: 25, unit: 'events', live: true },
};

export const WORLD = { w: 800, h: 600 } as const;

export interface KVRecord {
  value: number;
  revision: number;
  committed: boolean;
}

export interface NodeState {
  id: number;
  up: boolean;
  isLeader: boolean;
  term: number;
  store: Record<string, KVRecord>; // key -> record
  txCount: number;
  x: number;
  y: number;
}

export interface InFlightPacket {
  id: number;
  from: number;
  to: number;
  key: string;
  value: number;
  revision: number;
  term: number;
  sentAt: number;
  deliverAt: number;
  corrupted?: boolean;
}

export interface SnapshotMeta {
  eventIndex: number;
  timeMs: number;
  bytesEst: number;
}

export interface State {
  nodes: NodeState[];
  partition: number[]; // group ID per node
  packets: InFlightPacket[];
  nextPacketId: number;
  globalRevisions: Record<string, number>; // key -> highest committed rev
  globalValues: Record<string, number>; // key -> highest committed value
  snapshotsTaken: SnapshotMeta[];
  branchPoints: number[]; // event indices where branching occurred
  totalTxns: number;
  droppedPackets: number;
  params: Params;
  w: number;
  h: number;
}

export type TtEvent =
  | { t: 'clientTxn' }
  | { t: 'deliver'; id: number }
  | { t: 'heartbeat'; node: number };

export type TtAction =
  | { a: 'write'; node: number; key: string; value: number }
  | { a: 'crash'; node: number }
  | { a: 'recover'; node: number }
  | { a: 'partition'; groups: number[] }
  | { a: 'heal' }
  | { a: 'corruptInFlight'; key: string }
  | { a: 'markBranch'; atEvent: number };

type Ctx = EventCtx<State, TtEvent>;

const KEYS = ['X', 'Y', 'Z'] as const;

function sendSync(ctx: Ctx, from: number, to: number, key: string, value: number, rev: number, term: number): void {
  const p = ctx.state.params;
  if (ctx.rng.next() * 100 < p.packetDropPct) {
    ctx.state.droppedPackets++;
    return;
  }
  const delay = Math.max(5, p.msgDelay + ctx.rng.int(-10, 10));
  const pkt: InFlightPacket = {
    id: ctx.state.nextPacketId++,
    from,
    to,
    key,
    value,
    revision: rev,
    term,
    sentAt: ctx.now,
    deliverAt: ctx.now + delay,
  };
  ctx.state.packets.push(pkt);
  ctx.schedule(delay, { t: 'deliver', id: pkt.id });
}

function commitToNode(node: NodeState, key: string, val: number, rev: number): void {
  const rec = node.store[key] ?? { value: 0, revision: 0, committed: false };
  if (rev >= rec.revision) {
    node.store[key] = { value: val, revision: rev, committed: true };
    node.txCount++;
  }
}

export function init(params: Params, ctx: InitCtx<TtEvent>): State {
  const n = Math.max(3, Math.min(5, Math.round(params.nodes)));
  const nodes: NodeState[] = [];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    nodes.push({
      id: i,
      up: true,
      isLeader: i === 0,
      term: 1,
      store: {
        X: { value: 10, revision: 1, committed: true },
        Y: { value: 20, revision: 1, committed: true },
        Z: { value: 0, revision: 1, committed: true },
      },
      txCount: 3,
      x: 400 + 210 * Math.cos(ang),
      y: 265 + 175 * Math.sin(ang),
    });
  }

  if (params.autoTxnRate > 0) {
    ctx.schedule(Math.round(1000 / params.autoTxnRate), { t: 'clientTxn' });
  }

  return {
    nodes,
    partition: new Array(n).fill(0),
    packets: [],
    nextPacketId: 1,
    globalRevisions: { X: 1, Y: 1, Z: 1 },
    globalValues: { X: 10, Y: 20, Z: 0 },
    snapshotsTaken: [{ eventIndex: 0, timeMs: 0, bytesEst: 1420 }],
    branchPoints: [],
    totalTxns: 3,
    droppedPackets: 0,
    params: { ...params },
    w: WORLD.w,
    h: WORLD.h,
  };
}

export function handle(ctx: Ctx, ev: TtEvent): void {
  const state = ctx.state;
  switch (ev.t) {
    case 'clientTxn': {
      if (state.params.autoTxnRate > 0) {
        ctx.schedule(Math.round(1000 / state.params.autoTxnRate), { t: 'clientTxn' });
      }
      const leader = state.nodes.find((nd) => nd.up && nd.isLeader);
      if (!leader) return;

      const key = ctx.rng.pick(KEYS);
      const curr = leader.store[key] ?? { value: 0, revision: 0, committed: true };
      const nextRev = curr.revision + 1;
      const nextVal = curr.value + ctx.rng.int(1, 10);

      commitToNode(leader, key, nextVal, nextRev);
      state.globalRevisions[key] = nextRev;
      state.globalValues[key] = nextVal;
      state.totalTxns++;

      ctx.log({
        cat: 'txn',
        actor: leader.id,
        text: `SET ${key} = ${nextVal} (rev ${nextRev}) at leader N${leader.id}`,
        data: { key, val: nextVal, rev: nextRev },
      });

      // Broadcast replication
      for (const other of state.nodes) {
        if (other.id !== leader.id) {
          sendSync(ctx, leader.id, other.id, key, nextVal, nextRev, leader.term);
        }
      }
      return;
    }

    case 'deliver': {
      const idx = state.packets.findIndex((p) => p.id === ev.id);
      if (idx === -1) return;
      const [pkt] = state.packets.splice(idx, 1);
      if (!pkt) return;

      const target = state.nodes[pkt.to];
      if (!target || !target.up) {
        state.droppedPackets++;
        return;
      }

      // Check partition boundaries at delivery
      if (state.partition[pkt.from] !== state.partition[pkt.to]) {
        state.droppedPackets++;
        ctx.log({
          cat: 'fault',
          actor: null,
          text: `Packet #${pkt.id} dropped across partition boundary (N${pkt.from} -/- N${pkt.to})`,
        });
        return;
      }

      if (pkt.corrupted) {
        ctx.log({
          cat: 'fault',
          actor: target.id,
          text: `CRC Error: N${target.id} discarded corrupted packet #${pkt.id}`,
        });
        return;
      }

      commitToNode(target, pkt.key, pkt.value, pkt.revision);
      ctx.log({
        cat: 'sync',
        actor: target.id,
        text: `N${target.id} synced ${pkt.key} = ${pkt.value} (rev ${pkt.revision}) from N${pkt.from}`,
        data: { key: pkt.key, rev: pkt.revision },
      });
      return;
    }

    case 'heartbeat': {
      return;
    }
  }
}

export function applyAction(ctx: Ctx, action: TtAction): void {
  const state = ctx.state;
  switch (action.a) {
    case 'write': {
      const node = state.nodes[action.node];
      if (!node || !node.up) return;
      const curr = node.store[action.key] ?? { value: 0, revision: 0, committed: true };
      const nextRev = curr.revision + 1;
      commitToNode(node, action.key, action.value, nextRev);
      state.globalRevisions[action.key] = Math.max(state.globalRevisions[action.key] ?? 0, nextRev);
      state.globalValues[action.key] = action.value;
      state.totalTxns++;

      ctx.log({
        cat: 'action',
        actor: node.id,
        text: `User Action: SET ${action.key} = ${action.value} (rev ${nextRev}) on N${node.id}`,
        data: { key: action.key, val: action.value },
      });

      for (const other of state.nodes) {
        if (other.id !== node.id) {
          sendSync(ctx, node.id, other.id, action.key, action.value, nextRev, node.term);
        }
      }
      return;
    }

    case 'crash': {
      const node = state.nodes[action.node];
      if (!node) return;
      node.up = false;
      ctx.log({
        cat: 'fault',
        actor: node.id,
        text: `Fault Injection: N${node.id} CRASHED`,
      });
      return;
    }

    case 'recover': {
      const node = state.nodes[action.node];
      if (!node) return;
      node.up = true;
      ctx.log({
        cat: 'action',
        actor: node.id,
        text: `Recovery: N${node.id} restarted`,
      });
      return;
    }

    case 'partition': {
      state.partition = [...action.groups];
      ctx.log({
        cat: 'fault',
        actor: null,
        text: `Network Split: groups [${action.groups.join(', ')}] isolated`,
        data: { partition: action.groups },
      });
      return;
    }

    case 'heal': {
      state.partition = new Array(state.nodes.length).fill(0);
      ctx.log({
        cat: 'action',
        actor: null,
        text: `Network Restored: all partitions healed`,
      });
      return;
    }

    case 'corruptInFlight': {
      for (const pkt of state.packets) {
        if (pkt.key === action.key) {
          pkt.corrupted = true;
          pkt.value = -999;
        }
      }
      ctx.log({
        cat: 'fault',
        actor: null,
        text: `Fault Injection: Corrupted in-flight packets for key ${action.key}`,
      });
      return;
    }

    case 'markBranch': {
      state.branchPoints.push(action.atEvent);
      ctx.log({
        cat: 'branch',
        actor: null,
        text: `Timeline Forked: branch created at event #${action.atEvent}`,
      });
      return;
    }
  }
}

export function describeAction(action: TtAction): string {
  switch (action.a) {
    case 'write': return `SET ${action.key}=${action.value} on N${action.node}`;
    case 'crash': return `Crash N${action.node}`;
    case 'recover': return `Recover N${action.node}`;
    case 'partition': return `Split cluster [${action.groups.join(',')}]`;
    case 'heal': return `Heal network partition`;
    case 'corruptInFlight': return `Corrupt packets for ${action.key}`;
    case 'markBranch': return `Branch fork @ #${action.atEvent}`;
  }
}

export const invariants: Invariant<State>[] = [
  {
    id: 'monotonic-revisions',
    label: 'Monotonic revisions (rev(t) >= rev(t-1))',
    check(state) {
      for (const n of state.nodes) {
        for (const [k, rec] of Object.entries(n.store)) {
          if (rec.revision < 1) return `Node ${n.id} key ${k} has non-positive revision ${rec.revision}`;
        }
      }
      return null;
    },
  },
  {
    id: 'value-matching-at-rev',
    label: 'State agreement (same rev => same value)',
    check(state) {
      for (const k of KEYS) {
        let revRef = -1;
        let valRef = -1;
        for (const n of state.nodes) {
          const rec = n.store[k];
          if (!rec) continue;
          if (rec.revision === revRef && rec.value !== valRef) {
            return `Inconsistency: Key ${k}@rev${rec.revision} has conflicting values (${rec.value} vs ${valRef})`;
          }
          if (rec.revision > revRef) {
            revRef = rec.revision;
            valRef = rec.value;
          }
        }
      }
      return null;
    },
  },
  {
    id: 'bounded-divergence',
    label: 'Bounded lag (replica rev <= leader rev)',
    check(state) {
      const leader = state.nodes.find((n) => n.up && n.isLeader);
      if (!leader) return null;
      for (const k of KEYS) {
        const leadRev = leader.store[k]?.revision ?? 0;
        for (const n of state.nodes) {
          const repRev = n.store[k]?.revision ?? 0;
          if (repRev > leadRev) {
            return `Follower N${n.id} ahead of leader N${leader.id} on key ${k} (${repRev} > ${leadRev})`;
          }
        }
      }
      return null;
    },
  },
];

export function deriveTimeline(log: readonly LogEntry[], now: number, state: State): TimelineData {
  void now;
  const lanes = [
    { id: 'network', label: 'Network Bus' },
    ...state.nodes.map((n) => ({ id: `n${n.id}`, label: `Node ${n.id}` })),
  ];

  const segments: TimelineData['segments'] = [];
  const markers: TimelineData['markers'] = [];

  for (const e of log) {
    if (e.cat === 'txn') {
      markers.push({ lane: `n${e.actor ?? 0}`, t: e.t, label: e.text, cls: 'action' });
    } else if (e.cat === 'sync') {
      markers.push({ lane: `n${e.actor ?? 0}`, t: e.t, label: e.text, cls: 'committed' });
    } else if (e.cat === 'fault') {
      markers.push({ lane: e.actor !== null ? `n${e.actor}` : 'network', t: e.t, label: e.text, cls: 'election' });
    } else if (e.cat === 'branch') {
      markers.push({ lane: 'network', t: e.t, label: e.text, cls: 'action' });
    }
  }

  // Draw node alive segments
  for (const n of state.nodes) {
    segments.push({
      lane: `n${n.id}`,
      start: 0,
      end: null,
      label: n.up ? (n.isLeader ? 'Leader' : 'Follower') : 'CRASHED',
      cls: n.up ? (n.isLeader ? 'leader' : 'follower') : 'down',
    });
  }

  return { lanes, segments, markers };
}
