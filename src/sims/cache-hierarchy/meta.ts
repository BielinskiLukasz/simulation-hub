import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'cache-hierarchy',
  title: 'Cache Hierarchy',
  kind: 'trace',
  category: 'systems',
  description:
    'Set-associative L1/L2/L3 caches with LRU, FIFO and random replacement, driven by real access patterns. The headline demo: the same 32×32 matrix at 93.75% hits row-major and 0% column-major on a tiny direct-mapped cache.',
  tags: ['cache', 'memory-hierarchy', 'amat', 'matrix', 'locality', 'trace'],
  difficulty: 'hard',
  thumbnail: 'cache',
  accent: '#38bdf8',
};
