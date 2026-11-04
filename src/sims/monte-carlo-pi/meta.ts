import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'monte-carlo-pi',
  title: 'Monte Carlo π',
  kind: 'batch',
  category: 'algorithms',
  description:
    'Estimating π by throwing seeded darts at a circle: the inside/total ratio converges to π/4. Deterministic 50k-point chunks show the estimate (and its confidence band) tightening like 1/√N.',
  tags: ['pi', 'monte-carlo', 'convergence', 'statistics', 'batch'],
  difficulty: 'easy',
  thumbnail: 'pi',
  accent: '#38bdf8',
};
