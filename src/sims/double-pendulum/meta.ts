import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'double-pendulum',
  title: 'Double Pendulum',
  category: 'physics',
  tagline: 'Deterministic, and still unpredictable',
  description:
    'Release a fan of double pendulums that differ by fractions of a degree. Identical equations, identical timestep — and the trails fan out into chaos.',
  tags: ['chaos', 'rk4', 'pendulum', 'sensitivity', 'trails'],
  difficulty: 'medium',
  thumbnail: '🌀',
  formula: 'θ̈ = f(θ, θ̇) · integrated with RK4',
  howItWorks: [
    'The closed-form angular accelerations for a double pendulum with equal masses and equal arm lengths are evaluated four times per RK4 stage. Semi-implicit Euler visibly explodes here; RK4 keeps the energy drift under a percent for thousands of steps.',
    'Each fixed 1/60 s tick is split into four sub-steps, so the integrator sees h = 1/240 s. That is what keeps high-gravity settings stable.',
    'The `spread` parameter is the whole point: consecutive arms start a few hundredths of a degree apart. Watch a single trail against the fan and you can see the exact moment two nearly identical universes stop agreeing.',
    'Trails live in a fixed-size ring buffer per arm (no allocation while running), sampled at the second bob and drawn as five chunks with rising opacity.',
  ],
};
