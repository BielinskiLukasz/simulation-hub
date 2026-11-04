import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'n-body',
  title: 'N-Body Gravity',
  kind: 'realtime',
  category: 'physics',
  description:
    'Gravitational N-body with selectable Euler, semi-implicit, Verlet and RK4 integrators, direct O(n²) or Barnes–Hut forces, softening, pan/zoom camera, trails, and live energy/momentum diagnostics.',
  tags: ['gravity', 'barnes-hut', 'integrators', 'verlet', 'rk4', 'energy-drift'],
  difficulty: 'hard',
  thumbnail: 'nbody',
  accent: '#38bdf8',
};
