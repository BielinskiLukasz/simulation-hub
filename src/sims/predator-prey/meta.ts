import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'predator-prey',
  title: 'Predator ↔ Prey',
  category: 'systems',
  tagline: 'Lotka–Volterra, drawn as an ecosystem',
  description:
    'Two coupled differential equations produce the classic boom-and-bust cycle. Agents are the populations made visible: watch the hunters lag their food by a quarter phase.',
  tags: ['ode', 'ecology', 'rk4', 'cycles', 'feedback-loop'],
  difficulty: 'medium',
  thumbnail: '🦊',
  formula: 'ẋ = αx − βxy   ·   ẏ = δxy − γy',
  howItWorks: [
    'Populations are continuous floats integrated with RK4 — never the agents themselves. The dots you see are a *visualisation* of x(t) and y(t), scaled against the running peak of each population.',
    'The feedback loop is the whole story: more prey → more predators → fewer prey → fewer predators → more prey again. The predator curve always trails the prey curve by roughly a quarter cycle.',
    'Agents wander with the state’s seeded RNG, so the same `(params, seed)` produces the same footage every time — including the same wandering paths.',
    'Set predation β to zero and the prey grows exponentially; set prey to zero and the predators decay exponentially. Both are checked by the unit tests as analytic invariants.',
  ],
};
