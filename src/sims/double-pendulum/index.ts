import type { RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import { applyParams, bobPositions, defaultParams, energy, init, onPointer, paramSchema, step, type Params, type State } from './logic';
import { render } from './render';

const sim: RealtimeSimulation<Params, State> = {
  kind: 'realtime',
  meta,
  defaultParams,
  paramSchema,
  init,
  step,
  render,
  applyParams,
  onPointer,
  getStats: (s) => ({
    time: `${s.time.toFixed(1)}s`,
    energy: Math.round(energy(s.main, s.params)),
    ghosts: s.ghosts.length,
    bob: (() => { const p = bobPositions(s.main, s.params); return `${Math.round(p.x2)},${Math.round(p.y2)}`; })(),
  }),
  about: {
    summary:
      'Two rigid rods, four state variables (θ₁, ω₁, θ₂, ω₂), integrated with fourth-order Runge–Kutta. The double pendulum is deterministic but chaotic: its future is computable step by step yet practically unpredictable, because tiny differences in the starting angles grow exponentially.',
    bullets: [
      'Ghosts: up to 12 extra pendulums start within ±0.001 rad of the main one. For a while they overlap perfectly — then, inevitably, they scatter. That divergence is sensitive dependence, made visible.',
      'Click or drag on the canvas to aim both links and release from rest; the ghosts re-fan around your release angle.',
      'With damping = 0, RK4 keeps total energy nearly constant (the HUD shows it; the unit test asserts <1% drift over 10 simulated seconds). Add damping and watch the chaos die into a swing, then rest.',
      'Gravity, rod lengths and damping are live: shortening a rod mid-flight changes the dynamics without resetting the angles.',
      'Flip θ₂ past ~150° and the second link starts looping the loop — energy sloshes between the links unpredictably.',
    ],
    invariant: 'Energy is conserved to <1% over 600 RK4 steps with damping off (logic.test.ts) — chaos here is physics, not numerical error.',
  },
};

export default sim;
