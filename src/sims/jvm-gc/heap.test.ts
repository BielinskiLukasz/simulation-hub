import { describe, expect, it } from 'vitest';
import {
  allocFirstFit, checkHeap, compactHeap, computeReachable, createHeap,
  freeObject, newObjectId, occupy,
} from './heap';
import { makeGenerationalCollector, markSweepCollector } from './collectors';

function allocObj(h: ReturnType<typeof createHeap>, size: number, lo: number, hi: number, dieAt: number): number {
  const at = allocFirstFit(h, size, lo, hi);
  if (at === -1) return -1;
  const id = newObjectId(h);
  occupy(h, id, at, size);
  h.dieAt[id] = dieAt;
  return id;
}

describe('heap model', () => {
  it('fragmentation: allocation fails with enough total free cells but no contiguous run; compact fixes it', () => {
    const h = createHeap(64, 40);
    const a = allocObj(h, 16, 0, 64, 1e18);
    const b = allocObj(h, 16, 0, 64, 1e18);
    const c = allocObj(h, 16, 0, 64, 1e18);
    const d = allocObj(h, 16, 0, 64, 1e18);
    expect([a, b, c, d]).toEqual([0, 1, 2, 3]);
    freeObject(h, b);
    freeObject(h, d); // 32 free cells in two 16-cell holes
    expect(allocFirstFit(h, 24, 0, 64)).toBe(-1);
    compactHeap(h, 0, 64);
    expect(allocFirstFit(h, 24, 0, 64)).toBe(32);
    expect(checkHeap(h)).toBeNull();
  });

  it('safety oracle: a full collection never frees a reachable object (either collector)', () => {
    for (const collector of [markSweepCollector, makeGenerationalCollector({ tenuring: 3, fullGcAtPct: 85 })]) {
      const h = createHeap(256, 40);
      const now = 1_000_000;
      const root = allocObj(h, 4, 0, 256, now + 1e9);
      const child = allocObj(h, 3, 0, 256, now - 1); // root dropped, but parent alive
      const orphan = allocObj(h, 3, 0, 256, now - 1); // unreachable
      h.parent[child] = root;
      const before = computeReachable(h, now, 'full');
      expect(before[root]).toBe(1);
      expect(before[child]).toBe(1); // kept alive by its rooted parent
      expect(before[orphan]).toBe(0);
      collector.collect(h, 'full', now, { forceFull: true, compact: true });
      expect(h.alive[root]).toBe(1);
      expect(h.alive[child]).toBe(1);
      expect(h.alive[orphan]).toBe(0); // completeness: unreachable collected
      expect(checkHeap(h)).toBeNull();
    }
  });

  it('generational minor GC: dead young freed, survivors age, the aged promote', () => {
    const h = createHeap(256, 40); // young = 102 cells
    const now = 5_000_000;
    const youngLive = allocObj(h, 4, 0, h.youngCells, now + 1e9);
    const youngDead = allocObj(h, 4, 0, h.youngCells, now - 1);
    const gc = makeGenerationalCollector({ tenuring: 2, fullGcAtPct: 101 });
    gc.collect(h, 'alloc-failure', now, {});
    expect(h.alive[youngLive]).toBe(1);
    expect(h.alive[youngDead]).toBe(0);
    expect(h.age[youngLive]).toBe(1);
    gc.collect(h, 'alloc-failure', now, {});
    expect(h.addr[youngLive]).toBeGreaterThanOrEqual(h.youngCells); // promoted at age 2
    expect(checkHeap(h)).toBeNull();
  });

  it('nepotism: a dead old parent keeps its young child alive through a minor GC', () => {
    const h = createHeap(256, 40);
    const now = 5_000_000;
    const gc = makeGenerationalCollector({ tenuring: 15, fullGcAtPct: 101 });
    const oldParent = allocObj(h, 4, h.youngCells, 256, now - 1); // already dropped (dead, uncollected)
    const youngChild = allocObj(h, 3, 0, h.youngCells, now - 1); // also dropped
    h.parent[youngChild] = oldParent;
    gc.collect(h, 'alloc-failure', now, {});
    expect(h.alive[youngChild]).toBe(1); // floating garbage — the teaching moment
    // but a full GC sees through it
    gc.collect(h, 'full', now, { forceFull: true });
    expect(h.alive[youngChild]).toBe(0);
  });

  it('accounting invariant holds after a mixed sequence of allocs, frees and collections', () => {
    const h = createHeap(512, 40);
    const gc = makeGenerationalCollector({ tenuring: 3, fullGcAtPct: 85 });
    let now = 0;
    for (let round = 0; round < 12; round++) {
      now += 100_000;
      for (let i = 0; i < 20; i++) allocObj(h, 2, 0, h.youngCells, now + (i % 3 === 0 ? 1e9 : -1));
      gc.collect(h, round % 4 === 3 ? 'full' : 'alloc-failure', now, { forceFull: round % 4 === 3 });
      expect(checkHeap(h)).toBeNull();
    }
  });
});
