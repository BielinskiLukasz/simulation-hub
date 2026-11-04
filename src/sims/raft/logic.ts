// ─── Raft Consensus · logic.ts ──────────────────────────────────────────────
// PURE, tick-based Raft (1 runner step = 1 tick): randomised election
// timeouts, RequestVote, AppendEntries with nextIndex backtracking, majority
// commit. Messages fly through a deterministic in-state queue with fixed
// delay and seeded drop rolls. Clicking a node crashes/revives it.

import type { ParamSchema, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';

export interface Params {
  nodes: number; // 3..7 (re-init)
  messageDelay: number; // ticks (live)
  dropRate: number; // 0..0.4 (live)
  electionTimeout: number; // base ticks, randomised ×[0.6, 1.4] (live)
  heartbeat: number; // ticks between AppendEntries (live)
  autoWrite: boolean; // leader appends client entries periodically (live)
}

export const defaultParams: Params = {
  nodes: 5,
  messageDelay: 3,
  dropRate: 0,
  electionTimeout: 150,
  heartbeat: 30,
  autoWrite: true,
};

export const paramSchema: ParamSchema<Params> = {
  nodes: { kind: 'range', label: 'Cluster size', min: 3, max: 7, step: 1, hint: 'Re-inits the cluster' },
  messageDelay: { kind: 'range', label: 'Message delay', min: 1, max: 12, step: 1, unit: 'ticks', live: true },
  dropRate: { kind: 'range', label: 'Message drop rate', min: 0, max: 0.4, step: 0.05, live: true },
  electionTimeout: { kind: 'range', label: 'Election timeout (base)', min: 80, max: 320, step: 10, unit: 'ticks', live: true },
  heartbeat: { kind: 'range', label: 'Heartbeat interval', min: 10, max: 60, step: 5, unit: 'ticks', live: true },
  autoWrite: { kind: 'boolean', label: 'Client writes to leader', live: true },
};

export const WORLD = { w: 800, h: 600 } as const;
const WRITE_INTERVAL = 45;

export type Role = 'follower' | 'candidate' | 'leader';

export interface RaftNode {
  id: number;
  role: Role;
  term: number;
  votedFor: number | null;
  votes: number;
  log: number[];
  commitIndex: number; // number of committed entries
  alive: boolean;
  electionLeft: number;
  heartbeatLeft: number;
  writeLeft: number;
  nextIdx: number[]; // leader only
  matchIdx: number[]; // leader only
  x: number;
  y: number;
}

export type MsgKind = 'vote-req' | 'vote-res' | 'append' | 'append-res';

export interface Msg {
  sent: number;
  deliver: number;
  from: number;
  to: number;
  kind: MsgKind;
  term: number;
  granted?: boolean;
  success?: boolean;
  entries?: number[];
  prevLen?: number;
  leaderCommit?: number;
  matchLen?: number;
}

export interface State {
  nodes: RaftNode[];
  messages: Msg[];
  tick: number;
  nextValue: number;
  electionsWon: number;
  rng: Rng;
  params: Params;
  w: number;
  h: number;
}

export function init(params: Params, rng: Rng): State {
  const n = Math.round(params.nodes);
  const nodes: RaftNode[] = [];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    nodes.push({
      id: i, role: 'follower', term: 0, votedFor: null, votes: 0,
      log: [], commitIndex: 0, alive: true,
      electionLeft: rng.int(Math.floor(params.electionTimeout * 0.6), Math.ceil(params.electionTimeout * 1.4)),
      heartbeatLeft: 0, writeLeft: WRITE_INTERVAL,
      nextIdx: [], matchIdx: [],
      x: 400 + 185 * Math.cos(ang), y: 272 + 172 * Math.sin(ang),
    });
  }
  return { nodes, messages: [], tick: 0, nextValue: 1, electionsWon: 0, rng, params: { ...params }, w: WORLD.w, h: WORLD.h };
}

function resetElection(state: State, node: RaftNode): void {
  node.electionLeft = state.rng.int(
    Math.floor(state.params.electionTimeout * 0.6),
    Math.ceil(state.params.electionTimeout * 1.4),
  );
}

function send(state: State, from: number, to: number, msg: Omit<Msg, 'sent' | 'deliver' | 'from' | 'to'>): void {
  if (state.rng.next() < state.params.dropRate) return; // lost in flight
  state.messages.push({ ...msg, sent: state.tick, deliver: state.tick + state.params.messageDelay, from, to });
}

function stepDown(state: State, node: RaftNode, term: number): void {
  node.term = term;
  node.role = 'follower';
  node.votedFor = null;
  node.votes = 0;
  resetElection(state, node);
}

function becomeLeader(state: State, node: RaftNode): void {
  node.role = 'leader';
  state.electionsWon++;
  node.nextIdx = state.nodes.map(() => node.log.length);
  node.matchIdx = state.nodes.map((_, i) => (i === node.id ? node.log.length : 0));
  node.heartbeatLeft = 0;
  node.writeLeft = WRITE_INTERVAL;
}

function sendAppends(state: State, leader: RaftNode): void {
  for (const f of state.nodes) {
    if (f.id === leader.id || !f.alive) continue;
    const from = Math.min(leader.nextIdx[f.id] ?? leader.log.length, leader.log.length);
    send(state, leader.id, f.id, {
      kind: 'append', term: leader.term,
      entries: leader.log.slice(from), prevLen: from, leaderCommit: leader.commitIndex,
    });
  }
}

function tryCommit(state: State, leader: RaftNode): void {
  const majority = Math.floor(state.nodes.length / 2) + 1;
  for (let k = leader.log.length; k > leader.commitIndex; k--) {
    let count = 0;
    for (const nd of state.nodes) {
      const m = nd.id === leader.id ? leader.log.length : (leader.matchIdx[nd.id] ?? 0);
      if (m >= k) count++;
    }
    if (count >= majority) { leader.commitIndex = k; break; }
  }
}

function deliver(state: State, msg: Msg): void {
  const node = state.nodes[msg.to];
  const from = state.nodes[msg.from];
  if (!node || !node.alive || !from) return;

  if (msg.kind === 'vote-req') {
    let granted = false;
    if (msg.term >= node.term) {
      if (msg.term > node.term) stepDown(state, node, msg.term);
      const logOk = (from.log.length) >= node.log.length; // simplified freshness: length
      if ((node.votedFor === null || node.votedFor === msg.from) && logOk) {
        granted = true;
        node.votedFor = msg.from;
        resetElection(state, node);
      }
    }
    send(state, node.id, msg.from, { kind: 'vote-res', term: node.term, granted });
    return;
  }

  if (msg.kind === 'vote-res') {
    if (node.role !== 'candidate' || msg.term !== node.term) {
      if (msg.term > node.term) stepDown(state, node, msg.term);
      return;
    }
    if (msg.granted) {
      node.votes++;
      if (node.votes >= Math.floor(state.nodes.length / 2) + 1) becomeLeader(state, node);
    }
    return;
  }

  if (msg.kind === 'append') {
    if (msg.term < node.term) {
      send(state, node.id, msg.from, { kind: 'append-res', term: node.term, success: false, matchLen: node.log.length });
      return;
    }
    if (msg.term > node.term || node.role !== 'follower') stepDown(state, node, msg.term);
    node.role = 'follower';
    resetElection(state, node);
    const prevLen = msg.prevLen ?? 0;
    if (node.log.length < prevLen) {
      send(state, node.id, msg.from, { kind: 'append-res', term: node.term, success: false, matchLen: node.log.length });
      return;
    }
    node.log = node.log.slice(0, prevLen).concat(msg.entries ?? []);
    node.commitIndex = Math.max(node.commitIndex, Math.min(msg.leaderCommit ?? 0, node.log.length));
    send(state, node.id, msg.from, { kind: 'append-res', term: node.term, success: true, matchLen: node.log.length });
    return;
  }

  if (msg.kind === 'append-res') {
    if (msg.term > node.term) { stepDown(state, node, msg.term); return; }
    if (node.role !== 'leader' || msg.term !== node.term) return;
    if (msg.success) {
      node.matchIdx[msg.from] = Math.max(node.matchIdx[msg.from] ?? 0, msg.matchLen ?? 0);
      node.nextIdx[msg.from] = node.matchIdx[msg.from] ?? 0;
      tryCommit(state, node);
    } else {
      node.nextIdx[msg.from] = Math.max(0, Math.min(node.nextIdx[msg.from] ?? node.log.length, msg.matchLen ?? 0));
    }
  }
}

export function step(state: State, _dt: number): State {
  void _dt; // 1 step = 1 tick
  state.tick++;
  const p = state.params;

  // deliver due messages (in send order — deterministic)
  const due: Msg[] = [];
  state.messages = state.messages.filter((m) => {
    if (m.deliver <= state.tick) { due.push(m); return false; }
    return true;
  });
  for (const m of due) deliver(state, m);

  for (const node of state.nodes) {
    if (!node.alive) continue;
    if (node.role === 'leader') {
      if (p.autoWrite) {
        node.writeLeft--;
        if (node.writeLeft <= 0) {
          node.log.push(state.nextValue++);
          node.writeLeft = WRITE_INTERVAL;
        }
      }
      node.heartbeatLeft--;
      if (node.heartbeatLeft <= 0) {
        sendAppends(state, node);
        node.heartbeatLeft = p.heartbeat;
      }
    } else {
      node.electionLeft--;
      if (node.electionLeft <= 0) {
        // start election
        node.term++;
        node.role = 'candidate';
        node.votedFor = node.id;
        node.votes = 1;
        resetElection(state, node);
        if (state.nodes.length === 1) becomeLeader(state, node);
        for (const other of state.nodes) {
          if (other.id !== node.id && other.alive) {
            send(state, node.id, other.id, { kind: 'vote-req', term: node.term });
          }
        }
        if (node.votes >= Math.floor(state.nodes.length / 2) + 1 && node.role === 'candidate') becomeLeader(state, node);
      }
    }
  }
  return state;
}

/** Live: network conditions + client writes swap in place. */
export function applyParams(state: State, params: Params): State {
  state.params = { ...params };
  return state;
}

/** Pointer: click a node to crash/revive it; Shift+click forces its election timer to fire. */
export function onPointer(state: State, ev: PointerEv): State {
  if (ev.type !== 'down' && ev.type !== 'click') return state;
  for (const node of state.nodes) {
    const d = Math.hypot(node.x - ev.x, node.y - ev.y);
    if (d > 38) continue;
    if (ev.shift && node.alive) {
      node.electionLeft = 1; // fires next tick
      if (node.role === 'leader') stepDown(state, node, node.term);
      return state;
    }
    node.alive = !node.alive;
    if (!node.alive) {
      // a crashed leader is gone, but its term record stays on the node
    } else {
      node.role = 'follower';
      node.votedFor = null;
      node.votes = 0;
      resetElection(state, node);
    }
    return state;
  }
  return state;
}

/** Current leader (alive), if any. */
export function leaderOf(state: State): RaftNode | undefined {
  return state.nodes.find((n) => n.alive && n.role === 'leader');
}
