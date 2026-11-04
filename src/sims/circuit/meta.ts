import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'circuit',
  title: 'Circuit / Logic Gates',
  kind: 'event',
  category: 'systems',
  description:
    'Event-driven 3-valued logic simulation with transport delays, glitches, feedback latches and clocks. Build circuits in the editor, load a verified 4-bit ripple-carry adder, and inspect waveforms with time-travel.',
  tags: ['logic-gates', 'adder', 'sr-latch', 'hazards', 'netlist', 'waveforms'],
  difficulty: 'hard',
  thumbnail: 'circuit',
  accent: '#f59e0b',
};
