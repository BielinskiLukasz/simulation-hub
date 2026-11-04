import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import {
  Cache, ReferenceCache, computeAmat, decodeAddress, generateAddresses, runCache, defaultParams,
  type CacheConfig, type Params,
} from './model';

const line64 = (sizeBytes: number, ways: number, policy: 'lru' | 'fifo' | 'random' = 'lru'): CacheConfig => ({ sizeBytes, ways, lineBytes: 64, policy });
const seq = (n: number, stepBytes = 4) => Uint32Array.from({ length: n }, (_, i) => i * stepBytes);

describe('address math', () => {
  it('(tag, set, offset) reassemble to the address; sets are in range', () => {
    const rng = createRng(3);
    for (const cfg of [line64(256, 1), line64(1024, 2), line64(4096, 4), line64(32768, 8)]) {
      for (let i = 0; i < 500; i++) {
        const addr = rng.int(0, 1 << 20);
        const d = decodeAddress(addr, cfg);
        expect(d.set).toBeGreaterThanOrEqual(0);
        expect(d.set).toBeLessThan(d.sets);
        const rebuilt = (d.tag * d.sets + d.set) * cfg.lineBytes + d.offset;
        expect(rebuilt).toBe(addr);
      }
    }
  });
});

describe('hand-calculated cache cases (256 B, 64 B lines, 4 B elements)', () => {
  it('A: sequential 64 accesses direct-mapped → 4 misses, 60 hits (93.75%)', () => {
    const c = new Cache(line64(256, 1), createRng(1));
    let hits = 0;
    for (const a of seq(64)) if (c.access(a).hit) hits++;
    expect(64 - hits).toBe(4);
    expect(hits / 64).toBeCloseTo(0.9375, 9);
  });

  it('B: second pass over the same 256 B → 124 hits total', () => {
    const c = new Cache(line64(256, 1), createRng(1));
    let hits = 0;
    for (const a of seq(128)) if (c.access(a % 256).hit) hits++;
    expect(hits).toBe(124);
  });

  it('C: alternating 0 and 256 on a direct-mapped cache → every access misses; 2-way fixes it', () => {
    const c = new Cache(line64(256, 1), createRng(1));
    for (let i = 0; i < 40; i++) expect(c.access(i % 2 === 0 ? 0 : 256).hit).toBe(false);
    const assoc = new Cache(line64(256, 2), createRng(1));
    let hits = 0;
    for (let i = 0; i < 40; i++) if (assoc.access(i % 2 === 0 ? 0 : 256).hit) hits++;
    expect(hits).toBe(38);
  });

  it('D: LRU gives 2 hits, FIFO 1 hit on A B A C A (2 lines, fully associative)', () => {
    const stream = [0, 64, 0, 128, 0];
    const lru = new Cache(line64(128, 2, 'lru'), createRng(1));
    let lruHits = 0;
    for (const a of stream) if (lru.access(a).hit) lruHits++;
    expect(lruHits).toBe(2);
    const fifo = new Cache(line64(128, 2, 'fifo'), createRng(1));
    let fifoHits = 0;
    for (const a of stream) if (fifo.access(a).hit) fifoHits++;
    expect(fifoHits).toBe(1);
  });

  it('F: AMAT formula gives 12.2 cycles', () => {
    expect(computeAmat(4, 12, 40, 200, 0.1, 0.5, 0.5)).toBeCloseTo(12.2, 9);
  });
});

describe('differential test against the naive reference model', () => {
  it('50 random (config, stream) pairs agree for LRU and FIFO', () => {
    const rng = createRng(9);
    for (let k = 0; k < 50; k++) {
      const sizeBytes = [256, 512, 1024, 2048, 4096][rng.int(0, 4)]!;
      const ways = [1, 2, 4][rng.int(0, 2)]!;
      const policy: 'lru' | 'fifo' = rng.next() < 0.5 ? 'lru' : 'fifo';
      const cfg: CacheConfig = { sizeBytes, ways, lineBytes: 64, policy };
      const cache = new Cache(cfg, createRng(k));
      const reference = new ReferenceCache(cfg);
      for (let i = 0; i < 500; i++) {
        const addr = rng.int(0, 8192) * 4;
        expect(cache.access(addr).hit, `cfg ${JSON.stringify(cfg)} step ${i}`).toBe(reference.access(addr));
      }
    }
  });
});

describe('matrix traversal and traces', () => {
  it('E: row-major ≈ 93.75% L1 hits; column-major 0% on tiny-teaching 32×32', () => {
    const base: Partial<Params> = { preset: 'tiny-teaching', matrixN: 32, elemBytes: 4, passes: 1, policy: 'lru', accesses: 1024, traceLimit: 1024 };
    const row = runCache({ ...(base as Params), pattern: 'matrix-row', paramSchema: undefined } as never).summary as unknown as { l1HitRate: number };
    const col = runCache({ ...(base as Params), pattern: 'matrix-col' } as never).summary as unknown as { l1HitRate: number };
    expect(row.l1HitRate).toBeCloseTo(0.9375, 6);
    expect(col.l1HitRate).toBeLessThan(0.02);
  });

  it('matrix patterns visit every element once; random is seed-deterministic', () => {
    const base = { ...({} as Params), matrixN: 8, elemBytes: 4, passes: 1, accesses: 1000 } as Params;
    const row = generateAddresses({ ...base, pattern: 'matrix-row' } as Params, createRng(1));
    const cells = new Set(Array.from(row.matrixPos ?? []));
    expect(cells.size).toBe(64);
    const r1 = generateAddresses({ ...base, pattern: 'random' } as Params, createRng(4));
    const r2 = generateAddresses({ ...base, pattern: 'random' } as Params, createRng(4));
    expect(r1.addresses).toEqual(r2.addresses);
  });

  it('accounting: memory accesses = total − hits at all levels; trace deterministic', () => {
    const p = { ...defaultParams, accesses: 2000, traceLimit: 500 } as Params;
    const r = runCache(p);
    const s = r.summary as unknown as { accesses: number; l1HitRate: number; l2HitRate: number; l3HitRate: number; memoryAccesses: number; l1Misses: number };
    const l1Hits = Math.round(s.l1HitRate * s.accesses);
    expect(s.l1Misses).toBe(s.accesses - l1Hits);
    expect(s.memoryAccesses).toBeGreaterThanOrEqual(0);
    expect(s.memoryAccesses).toBeLessThanOrEqual(s.l1Misses);
    expect(r.length).toBe(500);
    const again = runCache(p);
    expect(Array.from(again.data.record.level)).toEqual(Array.from(r.data.record.level));
  });
});
