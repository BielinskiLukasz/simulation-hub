import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'game-of-life',
  title: 'Game of Life',
  kind: 'realtime',
  category: 'emergent',
  description:
    'Conway’s cellular automaton: dead-simple rules (birth on 3, survival on 2–3) producing gliders, oscillators and guns. Seeded random soups, classic patterns, wrap-around edges, and click-to-paint cells while it runs.',
  tags: ['cellular-automata', 'conway', 'emergent', 'patterns', 'pointer'],
  difficulty: 'easy',
  thumbnail: 'life',
  accent: '#4ade80',
};
