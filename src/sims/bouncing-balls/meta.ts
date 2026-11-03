// Metadata ONLY — safe (and cheap) for the hub grid to import statically.
// The implementation behind this card is lazy-loaded via sims/index.ts.

import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'bouncing-balls',
  title: 'Bouncing Balls',
  category: 'physics',
  description:
    'The Phase-1 proof sim: gravity, restitution and optional elastic collisions in a fixed 800×600 world. Every control type in the schema is exercised — and every run is reproducible from its seed.',
  tags: ['gravity', 'collisions', 'determinism', 'canvas-2d', 'hello-world'],
  difficulty: 'easy',
  thumbnail: 'balls',
  accent: '#f59e0b',
};
