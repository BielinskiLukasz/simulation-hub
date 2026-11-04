import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'jvm-gc',
  title: 'JVM GC Visualizer',
  kind: 'event',
  category: 'systems',
  description:
    'An educational model of JVM garbage collection on a cell heap: allocation, lifetimes, remembered sets, promotion — mark-sweep vs generational collectors with real pause accounting, fragmentation, leaks and OOM.',
  tags: ['jvm', 'garbage-collection', 'heap', 'mark-sweep', 'generational'],
  difficulty: 'hard',
  thumbnail: 'gc',
  accent: '#34d399',
};
