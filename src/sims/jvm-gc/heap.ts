// ─── JVM GC · heap.ts — cell heap, object table, reachability ──────────────
// Plain data only (typed arrays + arrays), so engine snapshots clone it.
// Objects form a forest via `parent` (child → parent). An object is live
// iff itself or any ancestor is rooted (dieAt > now). That single rule
// gives marking, nepotism, and leak behaviour without a separate root set.

export interface GcStats {
  totalPauseUs: number;
  stallUs: number;
  allocatedCells: number;
  promotedCells: number;
  minorGc: number;
  fullGc: number;
  markSweepGc: number;
  pauseDurs: number[]; // µs, capped
  lastKind: string;
}

export interface PauseRec { t: number; dur: number; kind: string }

export interface HeapState {
  cells: number;
  youngCells: number; // [0, youngCells) is young gen (generational mode)
  cellOwner: Int32Array; // cell → object id, -1 free
  alive: Uint8Array;
  addr: Int32Array;
  size: Uint16Array;
  age: Uint8Array;
  dieAt: Float64Array; // µs; 1e18 = never (leak)
  parent: Int32Array; // -1 = none
  freeIds: number[];
  nextId: number;
  blockedUntil: number;
  nowUs: number;
  oom: boolean;
  budgetCarry: number;
  pauses: PauseRec[];
  stats: GcStats;
}

export function createHeap(cells: number, youngPct: number): HeapState {
  // Pre-seed freeIds with 0..cells-1 in reverse order.
  // There can never be more live objects than cells (minimum size is 1 cell).
  const freeIds = new Array<number>(cells);
  for (let i = 0; i < cells; i++) freeIds[i] = cells - 1 - i;
  return {
    cells,
    youngCells: Math.floor((cells * youngPct) / 100),
    cellOwner: new Int32Array(cells).fill(-1),
    alive: new Uint8Array(cells),
    addr: new Int32Array(cells).fill(-1),
    size: new Uint16Array(cells),
    age: new Uint8Array(cells),
    dieAt: new Float64Array(cells),
    parent: new Int32Array(cells).fill(-1),
    freeIds,
    nextId: cells,
    blockedUntil: 0,
    nowUs: 0,
    oom: false,
    budgetCarry: 0,
    pauses: [],
    stats: {
      totalPauseUs: 0, stallUs: 0, allocatedCells: 0, promotedCells: 0,
      minorGc: 0, fullGc: 0, markSweepGc: 0, pauseDurs: [], lastKind: '—',
    },
  };
}

/** First-fit contiguous allocation in [lo, hi). Returns start cell or -1. */
export function allocFirstFit(h: HeapState, size: number, lo: number, hi: number): number {
  let run = 0;
  let start = lo;
  for (let c = lo; c < hi; c++) {
    if (h.cellOwner[c] === -1) {
      if (run === 0) start = c;
      if (++run >= size) return start;
    } else run = 0;
  }
  return -1;
}

export function occupy(h: HeapState, id: number, addr: number, size: number): void {
  h.addr[id] = addr;
  h.size[id] = size;
  for (let c = addr; c < addr + size; c++) h.cellOwner[c] = id;
}

export function freeObject(h: HeapState, id: number): void {
  if (id < 0 || id >= h.cells || !h.alive[id]) return;
  h.alive[id] = 0;
  const a = h.addr[id]!;
  const sz = h.size[id]!;
  if (a >= 0) {
    for (let c = a; c < a + sz; c++) if (h.cellOwner[c] === id) h.cellOwner[c] = -1;
  }
  h.addr[id] = -1;
  h.parent[id] = -1;
  h.freeIds.push(id);
}

export function newObjectId(h: HeapState): number {
  const id = h.freeIds.pop();
  if (id === undefined) return -1;
  h.alive[id] = 1;
  h.age[id] = 0;
  h.parent[id] = -1;
  return id;
}

/**
 * Reachability via parent chains. mode 'full': live iff an ancestor (or
 * self) is rooted. mode 'minor': additionally, reaching ANY old-gen object
 * keeps a young object alive (remembered-set / nepotism semantics).
 */
export function computeReachable(h: HeapState, now: number, mode: 'full' | 'minor'): Uint8Array {
  const reach = new Uint8Array(h.cells);
  const state = new Uint8Array(h.cells); // 0 unknown, 1 live, 2 dead
  for (let id = 0; id < h.cells; id++) {
    if (!h.alive[id] || state[id] !== 0) continue;
    const path: number[] = [];
    let cur: number = id;
    let live = false;
    const seen = new Set<number>();
    while (cur !== -1) {
      if (seen.has(cur)) break;
      seen.add(cur);
      path.push(cur);
      if (h.dieAt[cur]! > now) { live = true; break; } // rooted
      if (mode === 'minor' && cur !== id && h.addr[cur]! >= h.youngCells && h.alive[cur]) { live = true; break; } // old anchor
      if (state[cur] === 1) { live = true; break; }
      if (state[cur] === 2) { live = false; break; }
      const p = h.parent[cur]!;
      if (p === -1 || p >= h.cells || !h.alive[p]) break;
      cur = p;
    }
    for (const n of path) state[n] = live ? 1 : 2;
  }
  for (let id = 0; id < h.cells; id++) if (h.alive[id] && state[id] === 1) reach[id] = 1;
  return reach;
}

/** Slide all live objects to the lowest addresses (order-preserving). */
export function compactHeap(h: HeapState, lo: number, hi: number): number {
  const live: number[] = [];
  for (let id = 0; id < h.nextId; id++) {
    if (h.alive[id] && h.addr[id]! >= lo && h.addr[id]! < hi) live.push(id);
  }
  live.sort((a, b) => h.addr[a]! - h.addr[b]!);
  let write = lo;
  let moved = 0;
  // clear region first
  for (let c = lo; c < hi; c++) h.cellOwner[c] = -1;
  for (const id of live) {
    const sz = h.size[id]!;
    if (h.addr[id] !== write) moved += sz;
    h.addr[id] = write;
    for (let c = write; c < write + sz; c++) h.cellOwner[c] = id;
    write += sz;
  }
  return moved;
}

export function usedCells(h: HeapState, lo = 0, hi = h.cells): number {
  let used = 0;
  for (let c = lo; c < hi; c++) if (h.cellOwner[c] !== -1) used++;
  return used;
}

/** Heap-safety invariant: accounting + owner/object consistency. */
export function checkHeap(h: HeapState): string | null {
  let used = 0;
  for (let c = 0; c < h.cells; c++) {
    const owner = h.cellOwner[c]!;
    if (owner === -1) continue;
    used++;
    if (!h.alive[owner]) return `cell ${c} owned by dead object ${owner}`;
    const a = h.addr[owner]!;
    if (c < a || c >= a + h.size[owner]!) return `cell ${c} outside owner ${owner}'s range`;
  }
  let objectCells = 0;
  for (let id = 0; id < h.nextId; id++) {
    if (!h.alive[id]) continue;
    objectCells += h.size[id]!;
    const p = h.parent[id]!;
    if (p !== -1 && p >= h.nextId) return `object ${id} has dangling parent ${p}`;
  }
  if (used !== objectCells) return `accounting: ${used} owned cells vs ${objectCells} object cells`;
  return null;
}
