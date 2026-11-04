// ─── JVM GC · logic.ts — mutator + collector orchestration (event sim) ─────
// One event type: the 10 ms mutator tick. Allocation failure runs a
// collection atomically at the pause start and blocks the mutator until
// now+pause (timeline-accurate). Educational model — see concepts.

import type { EventCtx, EventSimulation, LogEntry, ParamSchema, TimelineData } from '../../core/types';
import { PRESETS, TICK_US } from './constants';
import { createHeap, newObjectId, occupy, type HeapState } from './heap';
import { makeGenerationalCollector, markSweepCollector, type Collector } from './collectors';

export interface Params {
  collector: string; // 'mark-sweep' | 'generational'
  compact: boolean; // mark-sweep: compact after sweep
  heapCells: string; // '2048' | '4096' | '8192'
  workload: string; // preset name or 'custom'
  allocRate: number; // cells/sec
  shortMs: number;
  longLivedPct: number;
  leakPct: number;
  largeObjPct: number;
  oldToYoungPct: number;
  youngPct: number;
  tenuring: number;
  fullGcAtPct: number;
}

export const defaultParams: Params = {
  collector: 'generational',
  compact: false,
  heapCells: '4096',
  workload: 'web-requests',
  allocRate: 3500,
  shortMs: 250,
  longLivedPct: 8,
  leakPct: 0.5,
  largeObjPct: 2,
  oldToYoungPct: 10,
  youngPct: 40,
  tenuring: 3,
  fullGcAtPct: 85,
};

export const paramSchema: ParamSchema<Params> = {
  collector: { kind: 'select', label: 'Collector', options: ['mark-sweep', 'generational'] },
  compact: { kind: 'boolean', label: 'Compact (mark-sweep)', hint: 'Slides survivors down; kills fragmentation, costs pause' },
  heapCells: { kind: 'select', label: 'Heap size (cells)', options: ['2048', '4096', '8192'], hint: '1 cell ≈ 16 KB → 4096 ≈ 64 MB' },
  workload: { kind: 'select', label: 'Workload preset', options: ['web-requests', 'cache-heavy', 'leaky', 'big-arrays', 'custom'], hint: 'Presets override the sliders below' },
  allocRate: { kind: 'range', label: 'Allocation rate', min: 500, max: 12000, step: 100, unit: 'cells/s' },
  shortMs: { kind: 'range', label: 'Mean short lifetime', min: 20, max: 2000, step: 10, unit: 'ms' },
  longLivedPct: { kind: 'range', label: 'Long-lived objects', min: 0, max: 40, step: 1, unit: '%' },
  leakPct: { kind: 'range', label: 'Leak rate', min: 0, max: 10, step: 0.5, unit: '%' },
  largeObjPct: { kind: 'range', label: 'Large objects', min: 0, max: 10, step: 0.5, unit: '%' },
  oldToYoungPct: { kind: 'range', label: 'Cross-gen references', min: 0, max: 30, step: 1, unit: '%', hint: 'Remembered-set pressure (nepotism!)' },
  youngPct: { kind: 'range', label: 'Young gen size', min: 10, max: 60, step: 5, unit: '%' },
  tenuring: { kind: 'range', label: 'Tenuring threshold', min: 1, max: 15, step: 1, unit: 'GCs' },
  fullGcAtPct: { kind: 'range', label: 'Full GC at old-gen', min: 50, max: 95, step: 5, unit: '%' },
};

export type GcEvent = { t: 'tick' };

export interface State {
  heap: HeapState;
  collectorId: string;
  params: Params;
  eff: { allocRate: number; shortMs: number; longLivedPct: number; leakPct: number; largeObjPct: number; oldToYoungPct: number };
  w: number;
  h: number;
}

type Ctx = EventCtx<State, GcEvent>;

function collectorFor(params: Params): Collector {
  return params.collector === 'generational'
    ? makeGenerationalCollector({ tenuring: params.tenuring, fullGcAtPct: params.fullGcAtPct })
    : markSweepCollector;
}

function effectiveParams(params: Params): State['eff'] {
  if (params.workload !== 'custom' && PRESETS[params.workload]) {
    const p = PRESETS[params.workload]!;
    return { allocRate: p.allocRate, shortMs: p.shortMs, longLivedPct: p.longLivedPct, leakPct: p.leakPct, largeObjPct: p.largeObjPct, oldToYoungPct: p.oldToYoungPct };
  }
  return {
    allocRate: params.allocRate, shortMs: params.shortMs, longLivedPct: params.longLivedPct,
    leakPct: params.leakPct, largeObjPct: params.largeObjPct, oldToYoungPct: params.oldToYoungPct,
  };
}

function tryAllocate(ctx: Ctx, collector: Collector, size: number): number {
  const h = ctx.state.heap;
  const at = collector.allocate(h, size);
  return at;
}

function allocateObject(ctx: Ctx, collector: Collector, size: number): boolean {
  const state = ctx.state;
  const h = state.heap;
  let at = tryAllocate(ctx, collector, size);
  if (at === -1) {
    const r = collector.collect(h, 'alloc-failure', ctx.now, { compact: state.params.compact });
    ctx.log({ cat: 'gc', actor: null, text: `${r.kind} GC: freed ${r.freedCells} cells, pause ${(r.pauseUs / 1000).toFixed(1)} ms`, data: { kind: r.kind, pauseUs: r.pauseUs } });
    at = tryAllocate(ctx, collector, size);
  }
  if (at === -1 && state.params.collector === 'generational') {
    const r = collector.collect(h, 'full', ctx.now, { forceFull: true });
    ctx.log({ cat: 'gc', actor: null, text: `Full GC (promotion/alloc failure): freed ${r.freedCells} cells, pause ${(r.pauseUs / 1000).toFixed(1)} ms`, data: { kind: r.kind, pauseUs: r.pauseUs } });
    at = tryAllocate(ctx, collector, size);
  }
  if (at === -1 && state.params.collector === 'mark-sweep' && !state.params.compact) {
    // Fragmentation fallback: emergency compact before throwing OOM
    const r = collector.collect(h, 'alloc-failure', ctx.now, { compact: true });
    ctx.log({ cat: 'gc', actor: null, text: `Emergency mark-compact: freed ${r.freedCells} cells, pause ${(r.pauseUs / 1000).toFixed(1)} ms`, data: { kind: r.kind, pauseUs: r.pauseUs } });
    at = tryAllocate(ctx, collector, size);
  }
  if (at === -1) {
    h.oom = true;
    ctx.log({ cat: 'gc', actor: null, text: `OutOfMemoryError: cannot allocate ${size} cells`, data: { kind: 'oom' } });
    return false;
  }
  const id = newObjectId(h);
  occupy(h, id, at, size);
  h.stats.allocatedCells += size;

  // lifetime + parentage
  const eff = state.eff;
  const roll = ctx.rng.next() * 100;
  if (roll < eff.leakPct) h.dieAt[id] = 1e18;
  else if (roll < eff.leakPct + eff.longLivedPct) h.dieAt[id] = ctx.now + (2 + ctx.rng.next() * 6) * 1_000_000; // 2–8 s: long vs 250 ms shorts
  else h.dieAt[id] = ctx.now + (-Math.log(1 - ctx.rng.next()) * eff.shortMs * 1000);

  if (ctx.rng.next() * 100 < eff.oldToYoungPct && h.nextId > 1) {
    for (let tries = 0; tries < 8; tries++) {
      const cand = ctx.rng.int(0, h.nextId - 1);
      if (cand !== id && h.alive[cand]) { h.parent[id] = cand; break; }
    }
  }
  return true;
}

export const gcSim: EventSimulation<Params, State, GcEvent, never> = {
  kind: 'event',
  meta: undefined as never, // wired in index.ts
  defaultParams,
  paramSchema,
  playback: { unit: 'µs', baseRate: 2_000_000 }, // 2 sim-seconds per real second at 1×

  init: (params, ctx) => {
    const cells = Number(params.heapCells) || 4096;
    ctx.schedule(TICK_US, { t: 'tick' });
    void ctx;
    return {
      heap: createHeap(cells, params.youngPct),
      collectorId: params.collector,
      params: { ...params },
      eff: effectiveParams(params),
      w: 800, h: 600,
    };
  },

  handle: (ctx) => {
    const state = ctx.state;
    const h = state.heap;
    h.nowUs = ctx.now;
    ctx.schedule(TICK_US, { t: 'tick' });
    if (h.oom) return;
    if (ctx.now < h.blockedUntil) {
      h.stats.stallUs += TICK_US;
      return;
    }
    const collector = collectorFor(state.params);
    h.budgetCarry += (state.eff.allocRate * TICK_US) / 1_000_000;
    let guard = 0;
    while (h.budgetCarry >= 1 && guard++ < 400) {
      const large = ctx.rng.next() * 100 < state.eff.largeObjPct;
      const size = large ? ctx.rng.int(20, 40) : ctx.rng.int(1, 2);
      h.budgetCarry -= size;
      if (!allocateObject(ctx, collector, size)) break;
    }
  },

  render: () => undefined, // wired in index.ts
  isFinished: (state) => state.heap.oom,
  getStats: (state) => {
    const h = state.heap;
    const elapsed = Math.max(h.nowUs, 1);
    return {
      throughput: `${(100 * (1 - h.stats.totalPauseUs / elapsed)).toFixed(1)}%`,
      gc: `${h.stats.minorGc + h.stats.fullGc + h.stats.markSweepGc}`,
      pauseTotal: `${(h.stats.totalPauseUs / 1000).toFixed(0)}ms`,
      last: h.stats.lastKind,
      oom: h.oom ? 'YES' : 'no',
    };
  },
  about: { summary: '', bullets: [], invariant: '' },
};

export function deriveTimeline(log: readonly LogEntry[], now: number, state: State): TimelineData {
  void log;
  const segments: TimelineData['segments'] = [
    { lane: 'mutator', start: 0, end: null, label: 'mutator', cls: 'mutator' },
  ];
  for (const p of state.heap.pauses) {
    segments.push({ lane: 'gc', start: p.t, end: p.t + p.dur, label: `${p.kind} ${(p.dur / 1000).toFixed(1)}ms`, cls: p.kind.includes('minor') ? 'gc-minor' : 'gc-full' });
    segments.push({ lane: 'mutator', start: p.t, end: p.t + p.dur, label: 'blocked', cls: 'blocked' });
  }
  const markers: TimelineData['markers'] = state.heap.oom
    ? [{ t: now, label: 'OutOfMemoryError', cls: 'gc-full' }]
    : [];
  return {
    lanes: [
      { id: 'mutator', label: 'mutator' },
      { id: 'gc', label: 'gc pauses' },
    ],
    segments,
    markers,
  };
}
