import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'monte-carlo',
  title: 'Monte Carlo Portfolio',
  kind: 'batch',
  category: 'finance',
  description:
    '10,000+ simulated retirements in parallel chunks: monthly log-normal returns in today’s money, accumulation then withdrawals, success probability, fan chart and depletion risk — identical results regardless of worker count.',
  tags: ['monte-carlo', 'retirement', 'workers', 'percentiles', 'fan-chart'],
  difficulty: 'medium',
  thumbnail: 'fan',
  accent: '#34d399',
};
