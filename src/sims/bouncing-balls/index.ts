// Assembles the Simulation object. This module is LAZY-LOADED by the shell
// (see sims/index.ts) — it must never be imported statically by the hub.

import type { RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import { applyParams, defaultParams, init, onPointer, step, type Params, type State } from './logic';
import { paramSchema } from './logic';
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
  getStats: (s) => ({ balls: s.balls.length }),
  about: {
    summary:
      'Balls are points with position and velocity in a fixed 800×600 logical world. Each fixed step (1/60 s) applies gravity, integrates position, then clamps at the walls and flips the velocity component scaled by restitution. Nothing here reads the wall clock or Math.random — the seeded RNG stored in state is the only source of chance, and it is only consumed during init.',
    bullets: [
      'Fixed timestep: physics advances in exact 1/60 s slices from an accumulator, so a 144 Hz monitor and a 30 Hz throttle produce the same trajectory.',
      'Determinism: (params, seed) fully determines a run. Copy the URL, open it anywhere, get the identical first frame — and the identical 10,000th.',
      'Restitution e scales velocity at every bounce: e = 1 conserves kinetic energy (gravity off), e < 1 bleeds energy until balls settle and jitter on the floor.',
      'Ball–ball collisions (optional) are equal-mass elastic impulses with positional de-overlap — a naive O(n²) pass that is honest at n ≤ 500 and becomes the Phase-2 spatial-hash case study.',
      'Rendering is a pure function of state: palettes recolour balls (speed maps velocity magnitude blue→red) without touching physics.',
    ],
    invariant: 'With gravity = 0 and restitution = 1, total kinetic energy is conserved (checked by logic.test.ts over 1,000 steps).',
  },
};

export default sim;
