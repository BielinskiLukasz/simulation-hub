import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'boids',
  title: 'Boids',
  category: 'emergent',
  tagline: 'Three rules, no leader',
  description:
    'Craig Reynolds’ 1986 flocking model. Separation, alignment and cohesion are applied locally — the flock, the lanes and the splits are nobody’s plan.',
  tags: ['flocking', 'agents', 'steering', 'emergence', 'toroidal'],
  difficulty: 'medium',
  thumbnail: '🐦',
  formula: 'a = wₛ·sep + wₐ·ali + w𝒸·coh',
  howItWorks: [
    'Each agent looks at neighbours inside a perception radius and produces three steering vectors: **separation** (push away, weighted by 1/d²), **alignment** (match the average heading) and **cohesion** (turn toward the local centre of mass).',
    'Every desired direction is converted to a velocity at `maxSpeed`, subtracted from the current velocity, and scaled by its weight. The sum is clamped to a maximum force so agents can bank but never teleport their heading.',
    'The step is two-phase: all accelerations are computed from the *same* snapshot, then integrated. Updating in place would let the first agent in the array influence the last one within a single frame — an order-dependent bug that is miserable to hunt.',
    'With `wrap` on the world is a torus and neighbour distances use the shortest wrapped delta, so flocks stream through the edges instead of piling up in corners.',
  ],
};
