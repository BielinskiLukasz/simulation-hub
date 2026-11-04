// ─── CPU Scheduler · algorithms.ts — pure policy + metrics ─────────────────
// Conventions (they change the numbers, so they are written down):
//  • lower priority number = higher priority
//  • ties: earlier arrival, then lower pid
//  • RR: same-time arrivals enqueue BEFORE the preempted process
//  • context-switch cost on every dispatch to a DIFFERENT process (never
//    for the first dispatch or when the same process resumes)

import type { Rng } from '../../core/types';

export interface ProcSpec { arrival: number; burst: number; priority: number }

export interface Proc extends ProcSpec {
  pid: number;
  remaining: number;
  firstRun: number; // -1 until first dispatch
  completedAt: number; // -1 until done
}

export interface Slice { pid: number; start: number; end: number }

export interface SchedulerParamsLike {
  algorithm: string;
  quantum: number;
  preemptivePriority: boolean;
  contextSwitch: number;
}

export function parseWorkload(text: string): ProcSpec[] {
  return text
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((entry) => {
      const [a = '0', b = '1', p = '3'] = entry.split(':');
      return {
        arrival: Math.max(0, Math.floor(Number(a) || 0)),
        burst: Math.max(1, Math.floor(Number(b) || 1)),
        priority: Math.max(1, Math.floor(Number(p) || 3)),
      };
    });
}

export function encodeWorkload(specs: ProcSpec[]): string {
  return specs.map((s) => `${s.arrival}:${s.burst}:${s.priority}`).join(';');
}

export function buildWorkload(
  preset: string,
  customText: string,
  randomCount: number,
  rng: Rng,
): ProcSpec[] {
  switch (preset) {
    case 'convoy':
      return [
        { arrival: 0, burst: 24, priority: 2 },
        { arrival: 0, burst: 3, priority: 3 },
        { arrival: 0, burst: 3, priority: 1 },
      ];
    case 'textbook-sjf':
      return [
        { arrival: 0, burst: 8, priority: 1 },
        { arrival: 1, burst: 4, priority: 2 },
        { arrival: 2, burst: 9, priority: 3 },
        { arrival: 3, burst: 5, priority: 4 },
      ];
    case 'custom':
      return parseWorkload(customText);
    default: {
      // random
      const out: ProcSpec[] = [];
      let t = 0;
      for (let i = 0; i < randomCount; i++) {
        t += rng.int(0, 3);
        out.push({ arrival: t, burst: rng.int(1, 20), priority: rng.int(1, 5) });
      }
      return out;
    }
  }
}

/** Choose the next pid from the ready set (pure; ready order matters for FCFS/RR). */
export function pickNext(
  ready: readonly number[],
  procs: readonly Proc[],
  params: SchedulerParamsLike,
): number {
  if (ready.length === 0) return -1;
  const byPid = (pid: number) => procs[pid - 1]!;
  switch (params.algorithm) {
    case 'fcfs':
    case 'rr':
      return ready[0]!;
    case 'sjf':
      return [...ready].sort((a, b) => {
        const pa = byPid(a); const pb = byPid(b);
        return pa.burst - pb.burst || pa.arrival - pb.arrival || pa.pid - pb.pid;
      })[0]!;
    case 'srtf':
      return [...ready].sort((a, b) => {
        const pa = byPid(a); const pb = byPid(b);
        return pa.remaining - pb.remaining || pa.arrival - pb.arrival || pa.pid - pb.pid;
      })[0]!;
    case 'priority':
      return [...ready].sort((a, b) => {
        const pa = byPid(a); const pb = byPid(b);
        return pa.priority - pb.priority || pa.arrival - pb.arrival || pa.pid - pb.pid;
      })[0]!;
    default:
      return ready[0]!;
  }
}

/** Would `arriving` preempt the currently running process? (pure) */
export function shouldPreempt(
  running: Proc,
  runningRemainingNow: number,
  arriving: Proc,
  params: SchedulerParamsLike,
): boolean {
  if (params.algorithm === 'srtf') return arriving.remaining < runningRemainingNow;
  if (params.algorithm === 'priority' && params.preemptivePriority) return arriving.priority < running.priority;
  return false;
}

export interface ProcMetrics {
  pid: number;
  turnaround: number;
  waiting: number;
  response: number;
}

export interface Metrics {
  perProc: ProcMetrics[];
  avgWaiting: number;
  avgTurnaround: number;
  avgResponse: number;
  makespan: number;
  cpuBusy: number;
  utilization: number;
  switches: number;
}

export function computeMetrics(procs: readonly Proc[], slices: readonly Slice[], switches: number): Metrics {
  const perProc = procs.map((p) => {
    const turnaround = p.completedAt - p.arrival;
    return {
      pid: p.pid,
      turnaround,
      waiting: turnaround - p.burst,
      response: p.firstRun - p.arrival,
    };
  });
  const avg = (f: (m: ProcMetrics) => number) =>
    perProc.length ? perProc.reduce((a, m) => a + f(m), 0) / perProc.length : 0;
  const cpuBusy = slices.reduce((a, s) => a + (s.end - s.start), 0);
  const makespan = procs.reduce((a, p) => Math.max(a, p.completedAt), 0);
  return {
    perProc,
    avgWaiting: avg((m) => m.waiting),
    avgTurnaround: avg((m) => m.turnaround),
    avgResponse: avg((m) => m.response),
    makespan,
    cpuBusy,
    utilization: makespan > 0 ? cpuBusy / makespan : 0,
    switches,
  };
}
