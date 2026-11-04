// ─── CPU Scheduler · logic.ts — event-driven scheduling model ──────────────
// Events: arrive | sliceEnd | switched (epoch-guarded). All times integer.
// Dispatch rules live in algorithms.ts (pure, textbook-tested).

import type { EventCtx, EventSimulation, LogEntry, ParamSchema, TimelineData } from '../../core/types';
import { buildWorkload, pickNext, shouldPreempt, type Proc, type Slice } from './algorithms';

export interface Params {
  algorithm: string;
  quantum: number;
  preemptivePriority: boolean;
  contextSwitch: number;
  workloadPreset: string;
  randomCount: number;
  workload: string;
}

export const WORKLOAD_PATTERN = '^\\d+:\\d+:\\d+(;\\d+:\\d+:\\d+)*$';

export const defaultParams: Params = {
  algorithm: 'fcfs',
  quantum: 4,
  preemptivePriority: false,
  contextSwitch: 0,
  workloadPreset: 'convoy',
  randomCount: 10,
  workload: '0:24:2;0:3:3;0:3:1',
};

export const paramSchema: ParamSchema<Params> = {
  algorithm: { kind: 'select', label: 'Algorithm', options: ['fcfs', 'sjf', 'rr', 'priority', 'srtf'], hint: 'SRTF = preemptive SJF (stretch, included)' },
  quantum: { kind: 'range', label: 'Quantum (RR)', min: 1, max: 20, step: 1 },
  preemptivePriority: { kind: 'boolean', label: 'Preemptive priority' },
  contextSwitch: { kind: 'range', label: 'Context-switch cost', min: 0, max: 5, step: 1, unit: 'units' },
  workloadPreset: { kind: 'select', label: 'Workload preset', options: ['convoy', 'textbook-sjf', 'random', 'custom'] },
  randomCount: { kind: 'range', label: 'Random processes', min: 3, max: 30, step: 1 },
  workload: { kind: 'text', label: 'Custom workload', pattern: WORKLOAD_PATTERN, editor: 'process-table', placeholder: 'arrival:burst:priority;…', hint: 'arrival:burst:priority per process, “;”-separated' },
};

export type SchedEvent =
  | { t: 'arrive'; pid: number }
  | { t: 'dispatch' }
  | { t: 'sliceEnd'; pid: number; epoch: number }
  | { t: 'switched'; pid: number; epoch: number };

export interface State {
  procs: Proc[];
  ready: number[];
  running: number; // pid or -1
  switchingTo: number; // pid or -1
  epoch: number;
  runStart: number;
  lastPid: number; // last dispatched pid (-1 = none yet)
  dispatchPending: boolean;
  slices: Slice[];
  switches: number;
  params: Params;
}

type Ctx = EventCtx<State, SchedEvent>;

function proc(state: State, pid: number): Proc {
  return state.procs[pid - 1]!;
}

function startRun(ctx: Ctx, pid: number): void {
  const { state } = ctx;
  const p = proc(state, pid);
  state.running = pid;
  state.runStart = ctx.now;
  state.epoch++;
  if (p.firstRun < 0) p.firstRun = ctx.now;
  ctx.log({ cat: 'sched', actor: pid, text: `t=${ctx.now} dispatch P${pid} (remaining ${p.remaining})` });
  const slice = state.params.algorithm === 'rr' ? Math.min(state.params.quantum, p.remaining) : p.remaining;
  ctx.schedule(slice, { t: 'sliceEnd', pid, epoch: state.epoch });
}

function dispatchNext(ctx: Ctx): void {
  const { state } = ctx;
  if (state.running !== -1 || state.switchingTo !== -1) return;
  const pid = pickNext(state.ready, state.procs, state.params);
  if (pid === -1) return;
  state.ready = state.ready.filter((x) => x !== pid);
  const cs = state.params.contextSwitch;
  if (cs > 0 && state.lastPid !== -1 && pid !== state.lastPid) {
    state.switchingTo = pid;
    state.switches++;
    state.epoch++;
    ctx.log({ cat: 'sched', actor: pid, text: `t=${ctx.now} context switch → P${pid} (${cs}u)` });
    ctx.schedule(cs, { t: 'switched', pid, epoch: state.epoch });
    return;
  }
  startRun(ctx, pid);
}

/**
 * Dispatch is deferred through a zero-delay event so that ALL arrivals at
 * the current instant are in the ready set before pickNext chooses (textbook
 * SJF at t=0 sees P1, P2 and P3 together). Same-time arrive events have
 * smaller ids than this dispatch event, so they always run first.
 */
function requestDispatch(ctx: Ctx): void {
  if (ctx.state.dispatchPending) return;
  ctx.state.dispatchPending = true;
  ctx.schedule(0, { t: 'dispatch' });
}

function finishSlice(ctx: Ctx, pid: number, endText: string): void {
  const { state } = ctx;
  const p = proc(state, pid);
  const elapsed = ctx.now - state.runStart;
  p.remaining -= elapsed;
  state.slices.push({ pid, start: state.runStart, end: ctx.now });
  state.running = -1;
  state.lastPid = pid;
  ctx.log({ cat: 'sched', actor: pid, text: `t=${ctx.now} ${endText} P${pid}` });
}

export const schedulerSim: EventSimulation<Params, State, SchedEvent, never> = {
  kind: 'event',
  meta: undefined as never, // wired in index.ts (avoids a cycle)
  defaultParams,
  paramSchema,
  playback: { unit: 'u', baseRate: 6 }, // 6 time-units per second at 1×

  init: (params, ctx) => {
    const specs = buildWorkload(params.workloadPreset, params.workload, params.randomCount, ctx.rng);
    const procs: Proc[] = specs.map((s, i) => ({
      ...s, pid: i + 1, remaining: s.burst, firstRun: -1, completedAt: -1,
    }));
    for (const p of procs) ctx.schedule(p.arrival, { t: 'arrive', pid: p.pid });
    return {
      procs, ready: [], running: -1, switchingTo: -1, epoch: 0, runStart: 0,
      lastPid: -1, dispatchPending: false, slices: [], switches: 0, params: { ...params },
    };
  },

  handle: (ctx, ev) => {
    const { state } = ctx;
    if (ev.t === 'arrive') {
      const p = proc(state, ev.pid);
      ctx.log({ cat: 'sched', actor: ev.pid, text: `t=${ctx.now} P${ev.pid} arrives (burst ${p.burst}, pri ${p.priority})` });
      state.ready.push(ev.pid);
      if (state.running !== -1) {
        const running = proc(state, state.running);
        const remainingNow = running.remaining - (ctx.now - state.runStart);
        if (shouldPreempt(running, remainingNow, p, state.params)) {
          const victim = state.running;
          finishSlice(ctx, victim, 'preempted by P' + ev.pid + ':');
          state.ready.push(victim);
          requestDispatch(ctx);
          return;
        }
      }
      requestDispatch(ctx);
      return;
    }
    if (ev.t === 'dispatch') {
      state.dispatchPending = false;
      dispatchNext(ctx);
      return;
    }
    if (ev.t === 'switched') {
      if (ev.epoch !== state.epoch || state.switchingTo !== ev.pid) return; // stale
      state.switchingTo = -1;
      startRun(ctx, ev.pid);
      return;
    }
    // sliceEnd
    if (ev.epoch !== state.epoch || state.running !== ev.pid) return; // stale (preempted)
    const p = proc(state, ev.pid);
    const willFinish = p.remaining - (ctx.now - state.runStart) <= 0;
    finishSlice(ctx, ev.pid, willFinish ? 'complete' : 'quantum expired, requeue');
    if (willFinish) {
      p.completedAt = ctx.now;
    } else {
      state.ready.push(ev.pid);
    }
    requestDispatch(ctx);
  },

  render: () => undefined, // wired in index.ts
  isFinished: (state) => state.procs.every((p) => p.completedAt >= 0),
  getStats: (state) => ({
    done: `${state.procs.filter((p) => p.completedAt >= 0).length}/${state.procs.length}`,
    slices: state.slices.length,
    switches: state.switches,
  }),
  about: { summary: '', bullets: [], invariant: '' },
};

export function deriveTimeline(log: readonly LogEntry[], now: number, state: State): TimelineData {
  void log;
  const lanes = [
    { id: 'cpu', label: 'CPU' },
    ...state.procs.map((p) => ({ id: `p${p.pid}`, label: `P${p.pid}` })),
  ];
  const segments: TimelineData['segments'] = [];
  for (const s of state.slices) {
    segments.push({ lane: 'cpu', start: s.start, end: s.end, label: `P${s.pid}`, cls: `pid${s.pid % 6}` });
    segments.push({ lane: `p${s.pid}`, start: s.start, end: s.end, label: 'run', cls: 'run' });
  }
  for (const p of state.procs) {
    let cursor = p.arrival;
    const mine = state.slices.filter((s) => s.pid === p.pid).sort((a, b) => a.start - b.start);
    for (const s of mine) {
      if (s.start > cursor) segments.push({ lane: `p${p.pid}`, start: cursor, end: s.start, label: 'wait', cls: 'wait' });
      cursor = Math.max(cursor, s.end);
    }
    if (p.completedAt < 0 && now > cursor) {
      segments.push({ lane: `p${p.pid}`, start: cursor, end: null, label: 'wait', cls: 'wait' });
    }
  }
  const markers: TimelineData['markers'] = [];
  for (const p of state.procs) {
    markers.push({ lane: `p${p.pid}`, t: p.arrival, label: `P${p.pid} arrives`, cls: 'arrive' });
    if (p.completedAt >= 0) markers.push({ lane: `p${p.pid}`, t: p.completedAt, label: `P${p.pid} done`, cls: 'done' });
  }
  return { lanes, segments, markers };
}
