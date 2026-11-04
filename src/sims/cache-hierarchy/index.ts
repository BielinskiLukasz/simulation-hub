import type { CompareSpec } from '../../core/types';
import { cacheSim, mountCacheView, defaultParams, paramSchema, runCache, type CacheData, type Params } from './model';

const compare: CompareSpec<Params> = {
  modes: [
    {
      id: 'traversal', label: 'Row-major vs column-major (the headline)',
      paneKeys: ['pattern'],
      bDefaults: { pattern: 'matrix-col', preset: 'tiny-teaching', matrixN: 32 },
      note: 'Same flat matrix, same cache: locality decides the hit rate.',
    },
    {
      id: 'config', label: 'LRU vs FIFO / 1-way vs 2-way',
      paneKeys: ['policy', 'l1Ways', 'l2Ways'],
      bDefaults: { policy: 'fifo', l1Ways: 2, l2Ways: 2 },
      note: 'Same pattern and cache sizes; only the replacement/associativity differ.',
    },
    {
      id: 'size', label: 'N = 1024 vs 1025 (power-of-two conflicts)',
      paneKeys: ['matrixN', 'preset'],
      bDefaults: { matrixN: 1025, preset: 'typical-laptop' },
      note: 'Column-major: a stride that is a power of two maps onto fewer sets — the classic 1024 vs 1025 effect.',
    },
  ],
};

const sim = {
  ...cacheSim,
  defaultParams,
  paramSchema,
  run: runCache,
  mountView: mountCacheView,
  compare,
  describeStep(data: CacheData, i: number) {
    if (i < 0 || i >= data.record.addr.length) return { cat: 'access', actor: null, text: `#${i + 1}` };
    const level = data.record.level[i]!;
    const names = { 1: 'L1 hit', 2: 'L2 hit', 3: 'L3 hit', 4: 'memory' } as Record<number, string>;
    const addr = data.record.addr[i]!;
    return { cat: names[level] ?? 'access', actor: null, text: `#${i + 1} 0x${addr.toString(16)} → ${names[level]} (L1 set ${data.record.set1[i]})` };
  },
  series(data: CacheData) {
    const n = data.record.addr.length;
    const hits = new Float64Array(n);
    const misses = new Float64Array(n);
    let h = 0;
    for (let i = 0; i < n; i++) {
      const isHit = data.record.level[i] === 1;
      if (isHit) h++;
      hits[i] = n ? (h / (i + 1)) * 100 : 0;
      misses[i] = data.record.level[i] === 4 ? 1 : 0;
    }
    return [
      { name: 'L1 hit %', ys: hits },
      { name: 'memory access', ys: misses },
    ];
  },
  concepts: cacheSim.concepts,
};

export default sim;
