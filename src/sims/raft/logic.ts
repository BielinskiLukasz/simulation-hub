// ─── Raft · logic.ts — event-driven Raft (Contract v3) ─────────────────────
// Integer milliseconds. Figure-2 rules: term step-down, vote-once + log
// freshness, AppendEntries consistency + truncation, majority commit with
// the current-term rule (Figure 8). Partitions/crashes checked AT DELIVERY.
// Timers are epoch-guarded. All state plain data (see invariants.ts).

import type { EventCtx, EventSimulation, LogEntry, ParamSchema, TimelineData } from '../../core/types';

export interface Params {
  nodes: number;
  electionTimeout: number; // ms, draws in [T, 2T)
  heartbeat: number; // ms
  delayMin: number;
  delayMax: number;
  loss: number; // %
  clientRate: number; // commands/sec auto-proposed
  scenario: string;
  bugMode: string; // mutation testing: none | doubleVote | commitOldTermByCount | skipTruncate | ignoreLogUpToDate
}

export const defaultParams: Params = {
  nodes: 5,
  electionTimeout: 300,
  heartbeat: 50,
  delayMin: 10,
  delayMax: 40,
  loss: 0,
  clientRate: 2,
  scenario: 'none',
  bugMode: 'none',
};

export const paramSchema: ParamSchema<Params> = {
  nodes: { kind: 'range', label: 'Cluster size', min: 3, max: 7, step: 1, hint: 'Re-inits' },
  electionTimeout: { kind: 'range', label: 'Election timeout (base)', min: 50, max: 1000, step: 10, unit: 'ms', hint: 'Timeouts drawn from [T, 2T)' },
  heartbeat: { kind: 'range', label: 'Heartbeat', min: 10, max: 300, step: 5, unit: 'ms' },
  delayMin: { kind: 'range', label: 'Delay min', min: 0, max: 200, step: 5, unit: 'ms' },
  delayMax: { kind: 'range', label: 'Delay max', min: 0, max: 400, step: 5, unit: 'ms' },
  loss: { kind: 'range', label: 'Message loss', min: 0, max: 50, step: 1, unit: '%' },
  clientRate: { kind: 'range', label: 'Client writes', min: 0, max: 20, step: 1, unit: '/s' },
  scenario: { kind: 'select', label: 'Fault scenario', options: ['none', 'leader-crash', 'isolate-leader', 'split-2-3', 'flaky-network'] },
  bugMode: { kind: 'select', label: 'Injected bug (mutation testing)', options: ['none', 'doubleVote', 'commitOldTermByCount', 'skipTruncate', 'ignoreLogUpToDate'], hint: 'Deliberately broken rules — watch the invariant badge catch them' },
};

export const WORLD = { w: 800, h: 600 } as const;

export interface LogEnt { term: number; cmd: number }

export interface RaftNode {
  id: number;
  up: boolean;
  currentTerm: number;
  votedFor: number; // -1 none
  log: LogEnt[];
  role: 0 | 1 | 2; // follower candidate leader
  commitIndex: number; // last committed index (0 = none)
  lastApplied: number;
  leaderId: number;
  votesMask: number;
  nextIndex: number[];
  matchIndex: number[];
  applied: number[];
  epoch: number;
  x: number;
  y: number;
}

export interface Msg {
  id: number;
  from: number;
  to: number;
  kind: 'rv' | 'rvr' | 'ae' | 'aer';
  term: number;
  sentAt: number;
  deliverAt: number;
  lastLogIndex?: number;
  lastLogTerm?: number;
  granted?: boolean;
  prevLogIndex?: number;
  prevLogTerm?: number;
  entries?: LogEnt[];
  leaderCommit?: number;
  success?: boolean;
  matchIndex?: number;
}

export interface State {
  nodes: RaftNode[];
  partition: number[];
  inFlight: Msg[];
  nextMsgId: number;
  nextCmd: number;
  committed: LogEnt[]; // index i = committed entry i+1 (first-commit record)
  leaderByTerm: Record<number, number>;
  stats: { elections: number; leaderChanges: number; dropped: number };
  scenarioStage: number;
  scenarioNode: number; // node id a scenario acted on, -1
  params: Params;
  w: number;
  h: number;
}

export type RaftEvent =
  | { t: 'electionTimeout'; node: number; epoch: number }
  | { t: 'heartbeat'; node: number; epoch: number }
  | { t: 'deliver'; msgId: number }
  | { t: 'clientTick' }
  | { t: 'scenarioTick' };

export type RaftAction =
  | { a: 'crash'; node: number }
  | { a: 'restart'; node: number }
  | { a: 'partition'; groups: number[] }
  | { a: 'heal' }
  | { a: 'propose'; node: number };

type Ctx = EventCtx<State, RaftEvent>;

function drawTimeout(ctx: Ctx): number {
  const T = ctx.state.params.electionTimeout;
  return T + Math.floor(ctx.rng.next() * T);
}

function resetElection(ctx: Ctx, node: RaftNode): void {
  node.epoch++;
  ctx.schedule(drawTimeout(ctx), { t: 'electionTimeout', node: node.id, epoch: node.epoch });
}

function setRole(ctx: Ctx, node: RaftNode, role: 0 | 1 | 2): void {
  if (node.role === role) return;
  node.role = role;
  ctx.log({
    cat: 'role', actor: node.id,
    text: `N${node.id} → ${['follower', 'candidate', 'leader'][role]} (term ${node.currentTerm})`,
    data: { node: node.id, role, term: node.currentTerm },
  });
}

function stepDown(ctx: Ctx, node: RaftNode, term: number): void {
  node.currentTerm = term;
  node.votedFor = -1;
  node.leaderId = -1;
  setRole(ctx, node, 0);
}

function send(ctx: Ctx, from: number, to: number, kind: Msg['kind'], fields: Partial<Msg>): void {
  const p = ctx.state.params;
  if (ctx.rng.next() * 100 < p.loss) { ctx.state.stats.dropped++; return; }
  const delay = p.delayMin + Math.floor(ctx.rng.next() * Math.max(1, p.delayMax - p.delayMin + 1));
  const msg: Msg = {
    id: ctx.state.nextMsgId++, from, to, kind,
    term: fields.term ?? 0, sentAt: ctx.now, deliverAt: ctx.now + delay, ...fields,
  };
  ctx.state.inFlight.push(msg);
  ctx.schedule(delay, { t: 'deliver', msgId: msg.id });
}

function lastLog(node: RaftNode): { index: number; term: number } {
  return { index: node.log.length, term: node.log.length ? node.log[node.log.length - 1]!.term : 0 };
}

function sendAppend(ctx: Ctx, leader: RaftNode, to: RaftNode): void {
  const prev = (leader.nextIndex[to.id] ?? leader.log.length + 1) - 1;
  send(ctx, leader.id, to.id, 'ae', {
    term: leader.currentTerm,
    prevLogIndex: prev,
    prevLogTerm: prev > 0 ? leader.log[prev - 1]!.term : 0,
    entries: leader.log.slice(prev),
    leaderCommit: leader.commitIndex,
  });
}

function sendAllAppends(ctx: Ctx, leader: RaftNode): void {
  for (const n of ctx.state.nodes) if (n.id !== leader.id) sendAppend(ctx, leader, n);
}

function applyCommitted(ctx: Ctx, node: RaftNode): void {
  while (node.lastApplied < node.commitIndex) {
    node.lastApplied++;
    const ent = node.log[node.lastApplied - 1]!;
    node.applied.push(ent.cmd);
    if (!ctx.state.committed[node.lastApplied - 1]) {
      ctx.state.committed[node.lastApplied - 1] = { ...ent };
    }
  }
}

function becomeLeader(ctx: Ctx, node: RaftNode): void {
  setRole(ctx, node, 2);
  node.leaderId = node.id;
  ctx.state.stats.elections++;
  ctx.state.stats.leaderChanges++;
  ctx.state.leaderByTerm[node.currentTerm] = node.id;
  node.nextIndex = ctx.state.nodes.map(() => node.log.length + 1);
  node.matchIndex = ctx.state.nodes.map((n) => (n.id === node.id ? node.log.length : 0));
  ctx.log({ cat: 'election', actor: node.id, text: `N${node.id} elected leader of term ${node.currentTerm}`, data: { node: node.id, term: node.currentTerm } });
  sendAllAppends(ctx, node);
  node.epoch++;
  ctx.schedule(ctx.state.params.heartbeat, { t: 'heartbeat', node: node.id, epoch: node.epoch });
}

function startElection(ctx: Ctx, node: RaftNode): void {
  node.currentTerm++;
  setRole(ctx, node, 1);
  node.votedFor = node.id;
  node.votesMask = 1 << node.id;
  node.leaderId = -1;
  resetElection(ctx, node);
  const last = lastLog(node);
  ctx.log({ cat: 'election', actor: node.id, text: `N${node.id} starts election for term ${node.currentTerm}` });
  for (const n of ctx.state.nodes) {
    if (n.id !== node.id) send(ctx, node.id, n.id, 'rv', { term: node.currentTerm, lastLogIndex: last.index, lastLogTerm: last.term });
  }
  if (voteCount(node.votesMask) * 2 > ctx.state.nodes.length) becomeLeader(ctx, node);
}

function voteCount(mask: number): number {
  let c = 0;
  let m = mask;
  while (m) { c += m & 1; m >>= 1; }
  return c;
}


/** Raft vote freshness: candidate log at least as up-to-date (term, then index). */
export function logUpToDate(candLastTerm: number, candLastIndex: number, myLastTerm: number, myLastIndex: number, bugMode = 'none'): boolean {
  if (bugMode === 'ignoreLogUpToDate') return true;
  return candLastTerm > myLastTerm || (candLastTerm === myLastTerm && candLastIndex >= myLastIndex);
}

/**
 * Highest index a leader may commit: replicated on a majority AND (Figure 8)
 * belonging to the leader's current term — unless the mutation bug is on.
 */
export function findCommitAdvance(
  log: LogEnt[], matchIndex: number[], selfId: number, nodeCount: number, currentTerm: number, currentCommit: number, bugMode = 'none',
): number {
  for (let N = log.length; N > currentCommit; N--) {
    let count = 0;
    for (let id = 0; id < nodeCount; id++) {
      const m = id === selfId ? log.length : (matchIndex[id] ?? 0);
      if (m >= N) count++;
    }
    if (count * 2 > nodeCount) {
      if (bugMode === 'commitOldTermByCount' || log[N - 1]!.term === currentTerm) return N;
    }
  }
  return currentCommit;
}

function deliver(ctx: Ctx, msg: Msg): void {
  const state = ctx.state;
  const node = state.nodes[msg.to]!;
  const sender = state.nodes[msg.from]!;
  if (!node.up) { state.stats.dropped++; return; }
  if (state.partition[msg.from] !== state.partition[msg.to]) { state.stats.dropped++; return; }
  const bug = state.params.bugMode;

  if (msg.term > node.currentTerm && msg.kind !== 'rvr' && msg.kind !== 'aer') {
    stepDown(ctx, node, msg.term);
  }

  switch (msg.kind) {
    case 'rv': {
      let granted = false;
      if (msg.term >= node.currentTerm) {
        if (msg.term > node.currentTerm) stepDown(ctx, node, msg.term);
        const myLast = lastLog(node);
        const upToDate = logUpToDate(msg.lastLogTerm ?? 0, msg.lastLogIndex ?? 0, myLast.term, myLast.index, bug);
        const canVote = node.votedFor === -1 || node.votedFor === msg.from || bug === 'doubleVote';
        if (canVote && upToDate) {
          granted = true;
          node.votedFor = msg.from;
          resetElection(ctx, node);
        }
      }
      send(ctx, node.id, msg.from, 'rvr', { term: node.currentTerm, granted });
      return;
    }
    case 'rvr': {
      if (msg.term > node.currentTerm) { stepDown(ctx, node, msg.term); return; }
      if (node.role !== 1 || msg.term !== node.currentTerm || !msg.granted) return;
      node.votesMask |= 1 << msg.from;
      if (voteCount(node.votesMask) * 2 > state.nodes.length) becomeLeader(ctx, node);
      return;
    }
    case 'ae': {
      if (msg.term < node.currentTerm) {
        send(ctx, node.id, msg.from, 'aer', { term: node.currentTerm, success: false, matchIndex: node.log.length });
        return;
      }
      if (node.role !== 0) setRole(ctx, node, 0);
      node.leaderId = msg.from;
      resetElection(ctx, node);
      const prev = msg.prevLogIndex ?? 0;
      const entries = msg.entries ?? [];
      const logOk = prev === 0 || (node.log.length >= prev && node.log[prev - 1]!.term === msg.prevLogTerm);
      if (!logOk) {
        send(ctx, node.id, msg.from, 'aer', { term: node.currentTerm, success: false, matchIndex: node.log.length });
        return;
      }
      // consistency: truncate conflicts (unless bug), append what's new
      for (let k = 0; k < entries.length; k++) {
        const idx = prev + k; // 0-based position
        const existing = node.log[idx];
        if (existing && existing.term !== entries[k]!.term) {
          if (bug !== 'skipTruncate') node.log.length = idx;
          else break;
        }
        if (node.log.length === idx) node.log.push(entries[k]!);
      }
      const before = node.commitIndex;
      node.commitIndex = Math.max(node.commitIndex, Math.min(msg.leaderCommit ?? 0, node.log.length));
      if (node.commitIndex > before) {
        ctx.log({ cat: 'commit', actor: node.id, text: `N${node.id} commitIndex → ${node.commitIndex}`, data: { node: node.id, commit: node.commitIndex } });
      }
      applyCommitted(ctx, node);
      send(ctx, node.id, msg.from, 'aer', { term: node.currentTerm, success: true, matchIndex: node.log.length });
      return;
    }
    case 'aer': {
      if (msg.term > node.currentTerm) { stepDown(ctx, node, msg.term); return; }
      if (node.role !== 2 || msg.term !== node.currentTerm) return;
      if (msg.success) {
        // a follower may hold extra uncommitted entries beyond our log —
        // never let its matchIndex run past our own length
        node.matchIndex[msg.from] = Math.min(node.log.length, Math.max(node.matchIndex[msg.from] ?? 0, msg.matchIndex ?? 0));
        node.nextIndex[msg.from] = (node.matchIndex[msg.from] ?? 0) + 1;
        // advance commit: highest N replicated on a majority (+ current-term rule)
        const newCommit = findCommitAdvance(node.log, node.matchIndex, node.id, state.nodes.length, node.currentTerm, node.commitIndex, state.params.bugMode);
        const advanced = newCommit > node.commitIndex;
        if (advanced) {
          node.commitIndex = newCommit;
          applyCommitted(ctx, node);
          ctx.log({ cat: 'commit', actor: node.id, text: `Leader N${node.id} commits index ${node.commitIndex}`, data: { node: node.id, commit: node.commitIndex } });
          sendAllAppends(ctx, node);
        }
      } else {
        node.nextIndex[msg.from] = Math.max(1, Math.min(node.nextIndex[msg.from] ?? node.log.length + 1, (msg.matchIndex ?? 0) + 1));
        sendAppend(ctx, node, sender);
      }
      return;
    }
  }
}

function leaderNode(state: State): RaftNode | undefined {
  return state.nodes.find((n) => n.up && n.role === 2);
}

function propose(ctx: Ctx, leader: RaftNode): void {
  const cmd = ctx.state.nextCmd++;
  leader.log.push({ term: leader.currentTerm, cmd });
  leader.matchIndex[leader.id] = leader.log.length;
  ctx.log({ cat: 'client', actor: leader.id, text: `cmd ${cmd} appended by leader N${leader.id} (index ${leader.log.length})` });
  sendAllAppends(ctx, leader);
}

function runScenario(ctx: Ctx): void {
  const state = ctx.state;
  const now = ctx.now;
  const stage = state.scenarioStage;
  const leader = leaderNode(state);
  switch (state.params.scenario) {
    case 'leader-crash':
      if (stage === 0 && leader && now >= 1500) {
        leader.up = false;
        state.scenarioNode = leader.id;
        state.scenarioStage = 1;
        ctx.log({ cat: 'action', actor: leader.id, text: `Scenario: leader N${leader.id} crashes`, data: { node: leader.id, up: false } });
      } else if (stage === 1 && now >= 6000 && state.scenarioNode >= 0) {
        const n = state.nodes[state.scenarioNode]!;
        n.up = true;
        setRole(ctx, n, 0);
        resetElection(ctx, n);
        state.scenarioStage = 2;
        ctx.log({ cat: 'action', actor: n.id, text: `Scenario: N${n.id} restarts (as follower)`, data: { node: n.id, up: true } });
      }
      break;
    case 'isolate-leader':
      if (stage === 0 && leader && now >= 1500) {
        state.partition = state.nodes.map((n) => (n.id === leader.id ? 1 : 0));
        state.scenarioNode = leader.id;
        state.scenarioStage = 1;
        ctx.log({ cat: 'action', actor: leader.id, text: `Scenario: leader N${leader.id} isolated`, data: { partition: state.partition } });
      } else if (stage === 1 && now >= 7000) {
        state.partition = state.nodes.map(() => 0);
        state.scenarioStage = 2;
        ctx.log({ cat: 'action', actor: null, text: 'Scenario: partition healed' });
      }
      break;
    case 'split-2-3':
      if (stage === 0 && now >= 1000) {
        const half = Math.floor(state.nodes.length / 2);
        state.partition = state.nodes.map((n) => (n.id < half ? 0 : 1));
        state.scenarioStage = 1;
        ctx.log({ cat: 'action', actor: null, text: `Scenario: split ${half}|${state.nodes.length - half}`, data: { partition: state.partition } });
      }
      break;
    case 'flaky-network':
      if (stage === 0 && now >= 500) {
        state.params = { ...state.params, loss: Math.max(state.params.loss, 20), delayMax: Math.max(state.params.delayMax, 120) };
        state.scenarioStage = 1;
        ctx.log({ cat: 'action', actor: null, text: 'Scenario: network turns flaky (20% loss, wide delays)' });
      }
      break;
    default:
      break;
  }
}

export const raftSim: EventSimulation<Params, State, RaftEvent, RaftAction> = {
  kind: 'event',
  meta: undefined as never, // wired in index.ts
  defaultParams,
  paramSchema,
  playback: { unit: 'ms', baseRate: 1000 },

  init: (params, ctx) => {
    const n = Math.round(params.nodes);
    const state: State = {
      nodes: [], partition: [], inFlight: [], nextMsgId: 1, nextCmd: 1,
      committed: [], leaderByTerm: {},
      stats: { elections: 0, leaderChanges: 0, dropped: 0 },
      scenarioStage: 0, scenarioNode: -1,
      params: { ...params }, w: WORLD.w, h: WORLD.h,
    };
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const node: RaftNode = {
        id: i, up: true, currentTerm: 0, votedFor: -1, log: [], role: 0,
        commitIndex: 0, lastApplied: 0, leaderId: -1, votesMask: 0,
        nextIndex: [], matchIndex: [], applied: [], epoch: 0,
        x: 400 + 200 * Math.cos(ang), y: 268 + 178 * Math.sin(ang),
      };
      state.nodes.push(node);
      state.partition.push(0);
    }
    // initial election timers use the same rng stream
    const initCtx = { rng: ctx.rng, state, params: state.params, now: 0 } as unknown as Ctx;
    void initCtx;
    for (const node of state.nodes) {
      node.epoch++;
      const T = params.electionTimeout;
      ctx.schedule(T + Math.floor(ctx.rng.next() * T), { t: 'electionTimeout', node: node.id, epoch: node.epoch });
    }
    if (params.clientRate > 0) ctx.schedule(Math.round(1000 / params.clientRate), { t: 'clientTick' });
    if (params.scenario !== 'none') ctx.schedule(200, { t: 'scenarioTick' });
    return state;
  },

  handle: (ctx, ev) => {
    const state = ctx.state;
    switch (ev.t) {
      case 'electionTimeout': {
        const node = state.nodes[ev.node]!;
        if (!node.up || ev.epoch !== node.epoch || node.role === 2) return;
        startElection(ctx, node);
        return;
      }
      case 'heartbeat': {
        const node = state.nodes[ev.node]!;
        if (!node.up || ev.epoch !== node.epoch || node.role !== 2) return;
        sendAllAppends(ctx, node);
        ctx.schedule(state.params.heartbeat, { t: 'heartbeat', node: node.id, epoch: node.epoch });
        return;
      }
      case 'deliver': {
        const idx = state.inFlight.findIndex((m) => m.id === ev.msgId);
        if (idx < 0) return;
        const [msg] = state.inFlight.splice(idx, 1);
        deliver(ctx, msg!);
        return;
      }
      case 'clientTick': {
        if (state.params.clientRate > 0) {
          ctx.schedule(Math.round(1000 / state.params.clientRate), { t: 'clientTick' });
          const leader = leaderNode(state);
          if (leader) propose(ctx, leader);
        }
        return;
      }
      case 'scenarioTick': {
        ctx.schedule(200, { t: 'scenarioTick' });
        runScenario(ctx);
        return;
      }
    }
  },

  applyAction: (ctx, action) => {
    const state = ctx.state;
    switch (action.a) {
      case 'crash': {
        const n = state.nodes[action.node]!;
        n.up = false;
        ctx.log({ cat: 'fault', actor: n.id, text: `N${n.id} crashed`, data: { node: n.id, up: false } });
        return;
      }
      case 'restart': {
        const n = state.nodes[action.node]!;
        n.up = true;
        n.votesMask = 0;
        n.leaderId = -1;
        setRole(ctx, n, 0);
        resetElection(ctx, n);
        ctx.log({ cat: 'fault', actor: n.id, text: `N${n.id} restarted as follower`, data: { node: n.id, up: true } });
        return;
      }
      case 'partition':
        state.partition = [...action.groups];
        ctx.log({ cat: 'action', actor: null, text: `Partition: [${action.groups.join(', ')}]`, data: { partition: action.groups } });
        return;
      case 'heal':
        state.partition = state.nodes.map(() => 0);
        ctx.log({ cat: 'action', actor: null, text: 'Partition healed' });
        return;
      case 'propose': {
        const n = state.nodes[action.node]!;
        if (n.up && n.role === 2) propose(ctx, n);
        return;
      }
    }
  },

  describeAction: (action) => {
    switch (action.a) {
      case 'crash': return `Crash N${action.node}`;
      case 'restart': return `Restart N${action.node}`;
      case 'partition': return `Partition [${action.groups.join(',')}]`;
      case 'heal': return 'Heal partition';
      case 'propose': return `Propose via N${action.node}`;
    }
  },

  render: () => undefined, // wired in index.ts
  isFinished: () => false,
  getStats: (state) => {
    const leader = leaderNode(state);
    return {
      leader: leader ? `N${leader.id}` : '—',
      term: leader?.currentTerm ?? Math.max(0, ...state.nodes.map((n) => n.currentTerm)),
      committed: leader?.commitIndex ?? Math.max(0, ...state.nodes.map((n) => n.commitIndex)),
      elections: state.stats.elections,
      dropped: state.stats.dropped,
    };
  },
  about: { summary: '', bullets: [], invariant: '' },
};

export function deriveTimeline(log: readonly LogEntry[], now: number, state: State): TimelineData {
  const lanes = state.nodes.map((n) => ({ id: `n${n.id}`, label: `N${n.id}` }));
  lanes.push({ id: 'cluster', label: 'cluster' });
  const segments: TimelineData['segments'] = [];
  const roleName = ['follower', 'candidate', 'leader'];
  // reconstruct role spans from the role log
  const open = new Map<number, { role: number; start: number; up: boolean }>();
  for (const n of state.nodes) open.set(n.id, { role: 0, start: 0, up: true });
  const closeSeg = (nodeId: number, end: number) => {
    const o = open.get(nodeId)!;
    segments.push({ lane: `n${nodeId}`, start: o.start, end, cls: o.up ? roleName[o.role]! : 'down', label: o.up ? roleName[o.role] : 'down' });
  };
  for (const e of log) {
    const d = (e.data ?? {}) as { node?: number; role?: number; up?: boolean; partition?: number[] };
    if (e.cat === 'role' && d.node !== undefined && d.role !== undefined) {
      closeSeg(d.node, e.t);
      open.set(d.node, { role: d.role, start: e.t, up: open.get(d.node)?.up ?? true });
    } else if (e.cat === 'fault' && d.node !== undefined && d.up !== undefined) {
      closeSeg(d.node, e.t);
      const cur = open.get(d.node)!;
      open.set(d.node, { role: cur.role, start: e.t, up: d.up });
    } else if (e.cat === 'action' && d.partition) {
      segments.push({ lane: 'cluster', start: e.t, end: null, label: 'partition', cls: 'action' });
    } else if (e.cat === 'action' && e.text.includes('healed')) {
      for (const s of segments) if (s.lane === 'cluster' && s.end === null) s.end = e.t;
    }
  }
  for (const n of state.nodes) {
    const o = open.get(n.id)!;
    segments.push({ lane: `n${n.id}`, start: o.start, end: null, cls: o.up ? roleName[o.role]! : 'down', label: o.up ? roleName[o.role] : 'down' });
  }
  void now;
  const markers: TimelineData['markers'] = [];
  for (const e of log) {
    if (e.cat === 'election' && e.text.includes('elected')) markers.push({ lane: `n${e.actor ?? 0}`, t: e.t, label: e.text, cls: 'election' });
    if (e.cat === 'commit' && e.text.startsWith('Leader')) markers.push({ t: e.t, label: e.text, cls: 'committed' });
  }
  return { lanes, segments, markers };
}
