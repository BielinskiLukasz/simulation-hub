import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'epidemic',
  title: 'Epidemic on Networks',
  kind: 'event',
  category: 'systems',
  description:
    'Exact event-driven SIR/SEIR on Erdős–Rényi, Watts–Strogatz and Barabási–Albert graphs. Compare random vs degree-targeted vaccination, check R₀ theory against simulation, and get attack rates with confidence intervals from the batch runner.',
  tags: ['epidemic', 'sir', 'networks', 'r0', 'vaccination', 'batch', 'confidence-intervals'],
  difficulty: 'medium',
  thumbnail: 'epidemic',
  accent: '#fb7185',
};
