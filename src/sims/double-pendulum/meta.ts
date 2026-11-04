import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'double-pendulum',
  title: 'Double Pendulum',
  kind: 'realtime',
  category: 'physics',
  description:
    'The chaos textbook in one canvas: two linked pendulums integrated with RK4. A fan of near-identical “ghost” pendulums, offset by a thousandth of a radian, shows sensitive dependence on initial conditions in seconds.',
  tags: ['chaos', 'rk4', 'nonlinear', 'sensitivity', 'trails'],
  difficulty: 'medium',
  thumbnail: 'pendulum',
  accent: '#fb7185',
};
