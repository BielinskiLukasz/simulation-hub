import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'game-of-life',
  title: 'Game of Life',
  category: 'algorithms',
  tagline: 'B3/S23 on a torus',
  description:
    'Conway’s cellular automaton with swappable rule-sets, adjustable generation rate and age-based colouring. A still life is a still life at any frame rate.',
  tags: ['cellular-automaton', 'conway', 'grid', 'discrete', 'turing-complete'],
  difficulty: 'easy',
  thumbnail: '🧫',
  formula: 'alive′ = S[n] if alive else B[n]',
  howItWorks: [
    'The grid is two `Uint8Array`s that swap roles every generation — double buffering, because reading and writing the same array would let newly born cells influence their own neighbourhood in the same tick.',
    'Time is decoupled from the runner: `step()` accumulates simulated seconds and emits whole generations at `rate` per second. The automaton is discrete, so it must never advance a fraction of a generation.',
    'The world is a torus — neighbour lookups wrap on both axes. That keeps gliders alive forever instead of dying at the border, which makes long runs far more interesting.',
    'Rules are stored as birth/survive sets and flattened into 9-entry lookup tables once per generation, so the inner loop is two array reads and no branching on rule names.',
  ],
};
