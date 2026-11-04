// ─── JVM GC · collectors.ts — mark-sweep(+compact) and generational ────────
// One interface, atomic collection at pause start. Pauses come from the
// cost model in constants.ts. Heap invariants: checkHeap (heap.ts) plus
// the safety oracle in tests (no reachable object is ever freed).

import { COST } from './constants';
import {
  allocFirstFit, compactHeap, computeReachable, freeObject, occupy,
  usedCells, type HeapState,
} from './heap';

export interface GcResult {
  kind: string;
  pauseUs: number;
  freedCells: number;
  copiedCells: number;
  promotedCells: number;
}

export interface Collector {
  id: string;
  allocate(h: HeapState, size: number): number;
  collect(h: HeapState, reason: string, now: number, opts: { compact?: boolean; forceFull?: boolean }): GcResult;
}

function recordPause(h: HeapState, kind: string, pauseUs: number, now: number): void {
  h.stats.totalPauseUs += pauseUs;
  h.stats.lastKind = kind;
  h.stats.pauseDurs.push(pauseUs);
  if (h.stats.pauseDurs.length > 5000) h.stats.pauseDurs.splice(0, 1000);
  h.pauses.push({ t: now, dur: pauseUs, kind });
  if (h.pauses.length > 400) h.pauses.splice(0, 100);
  h.blockedUntil = now + pauseUs;
}

// ── Mark-sweep (-compact) ────────────────────────────────────────────────────

export const markSweepCollector: Collector = {
  id: 'mark-sweep',
  allocate: (h, size) => allocFirstFit(h, size, 0, h.cells),
  collect(h, _reason, now, opts) {
    const reach = computeReachable(h, now, 'full');
    let markedCells = 0;
    let freedCells = 0;
    for (let id = 0; id < h.nextId; id++) {
      if (!h.alive[id]) continue;
      if (reach[id]) markedCells += h.size[id]!;
      else { freedCells += h.size[id]!; freeObject(h, id); }
    }
    let movedCells = 0;
    if (opts.compact) movedCells = compactHeap(h, 0, h.cells);
    const pauseUs = COST.fullBaseUs + COST.fullPerMarkedCellUs * markedCells
      + COST.sweepPerFreedCellUs * freedCells + COST.compactPerMovedCellUs * movedCells;
    h.stats.markSweepGc++;
    recordPause(h, opts.compact ? 'mark-compact' : 'mark-sweep', pauseUs, now);
    return { kind: opts.compact ? 'mark-compact' : 'mark-sweep', pauseUs, freedCells, copiedCells: movedCells, promotedCells: 0 };
  },
};

// ── Generational ─────────────────────────────────────────────────────────────

function minorCollect(h: HeapState, now: number, fullGcAtPct: number, tenuring: number): GcResult {
  const reach = computeReachable(h, now, 'minor');
  let liveYoungCells = 0;
  let freedCells = 0;
  let promotedCells = 0;

  // gather live young objects first (their addrs change as we compact)
  const survivors: number[] = [];
  for (let id = 0; id < h.nextId; id++) {
    if (!h.alive[id]) continue;
    const inYoung = h.addr[id]! < h.youngCells;
    if (!inYoung) continue;
    if (reach[id]) { survivors.push(id); liveYoungCells += h.size[id]!; }
    else { freedCells += h.size[id]!; freeObject(h, id); }
  }

  // promote the aged, keep the rest; promotion may need old space
  const staying: number[] = [];
  for (const id of survivors) {
    h.age[id] = Math.min(255, h.age[id]! + 1);
    if (h.age[id]! >= tenuring) {
      const at = allocFirstFit(h, h.size[id]!, h.youngCells, h.cells);
      if (at === -1) { staying.push(id); continue; } // promotion failed → stays (full GC follows)
      occupy(h, id, at, h.size[id]!);
      promotedCells += h.size[id]!;
      h.stats.promotedCells += h.size[id]!;
    } else staying.push(id);
  }
  // compact staying young objects to the bottom of young gen: clear the
  // whole young region (promoted objects already occupy their old cells),
  // then rewrite survivors sequentially
  staying.sort((a, b) => h.addr[a]! - h.addr[b]!);
  let write = 0;
  for (let c = 0; c < h.youngCells; c++) h.cellOwner[c] = -1;
  for (const id of staying) {
    occupy(h, id, write, h.size[id]!);
    write += h.size[id]!;
  }

  const pauseUs = COST.minorBaseUs + COST.minorPerLiveCellUs * liveYoungCells;
  h.stats.minorGc++;
  recordPause(h, 'minor', pauseUs, now);

  // old-gen pressure triggers a full GC
  const oldUsed = usedCells(h, h.youngCells, h.cells);
  const oldCap = h.cells - h.youngCells;
  if (oldCap > 0 && oldUsed / oldCap >= fullGcAtPct / 100) {
    const full = fullCollect(h, now);
    return { kind: 'minor+full', pauseUs: pauseUs + full.pauseUs, freedCells: freedCells + full.freedCells, copiedCells: liveYoungCells, promotedCells };
  }
  void fullGcAtPct;
  return { kind: 'minor', pauseUs, freedCells, copiedCells: liveYoungCells, promotedCells };
}

function fullCollect(h: HeapState, now: number): GcResult {
  const reach = computeReachable(h, now, 'full');
  let markedCells = 0;
  let freedCells = 0;
  for (let id = 0; id < h.cells; id++) {
    if (!h.alive[id]) continue;
    if (reach[id]) markedCells += h.size[id]!;
    else { freedCells += h.size[id]!; freeObject(h, id); }
  }

  let moved = 0;
  if (h.youngCells > 0) {
    // Generational Full GC: promote all survivors into Old Gen [youngCells, cells)
    // so Young Gen [0, youngCells) is completely cleared for mutator allocations.
    const live: number[] = [];
    for (let id = 0; id < h.cells; id++) if (h.alive[id]) live.push(id);
    live.sort((a, b) => h.addr[a]! - h.addr[b]!);

    for (let c = 0; c < h.cells; c++) h.cellOwner[c] = -1;

    let write = h.youngCells;
    for (const id of live) {
      const sz = h.size[id]!;
      let targetAddr: number;
      if (write + sz <= h.cells) {
        targetAddr = write;
        write += sz;
      } else {
        targetAddr = allocFirstFit(h, sz, 0, h.youngCells);
      }
      if (targetAddr !== -1) {
        if (h.addr[id] !== targetAddr) moved += sz;
        occupy(h, id, targetAddr, sz);
      } else {
        freeObject(h, id);
      }
    }
  } else {
    moved = compactHeap(h, 0, h.cells);
  }

  const pauseUs = COST.fullBaseUs + COST.fullPerMarkedCellUs * markedCells
    + COST.sweepPerFreedCellUs * freedCells + COST.compactPerMovedCellUs * moved;
  h.stats.fullGc++;
  recordPause(h, 'full', pauseUs, now);
  return { kind: 'full', pauseUs, freedCells, copiedCells: moved, promotedCells: 0 };
}

export function makeGenerationalCollector(opts: { tenuring: number; fullGcAtPct: number }): Collector {
  return {
    id: 'generational',
    allocate: (h, size) => allocFirstFit(h, size, 0, h.youngCells),
    collect(h, reason, now, collectOpts) {
      if (reason === 'full' || collectOpts.forceFull) return fullCollect(h, now);
      return minorCollect(h, now, opts.fullGcAtPct, opts.tenuring);
    },
  };
}

export { fullCollect };
