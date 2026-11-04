import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'boids',
  title: 'Boids Flocking',
  kind: 'realtime',
  category: 'emergent',
  description:
    'Craig Reynolds’ flocking model at up to 10,000 boids: separation, alignment and cohesion over a counting-sort spatial hash, structure-of-arrays state, hot (live) steering params, predators and click-spawned boids.',
  tags: ['flocking', 'emergent', 'spatial-hash', 'typed-arrays', 'pointer'],
  difficulty: 'medium',
  thumbnail: 'boids',
  accent: '#38bdf8',
};
