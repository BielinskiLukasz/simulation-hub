import type { RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import { applyParams, defaultParams, init, onPointer, paramSchema, step, type Params, type State } from './logic';
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
    generation: s.generation,
    alive: s.alive,
    grid: `${s.cols}×${s.rows}`,
  }),
  about: {
    summary:
      'Conway’s Game of Life (1970): every cell counts its 8 neighbours each generation — a live cell survives on 2–3, a dead cell is born on exactly 3. From those two rules come gliders that crawl, pulsars that blink with period 3, and the Gosper gun that fires a new glider every 30 generations forever.',
    bullets: [
      'Paint while it runs: click or drag to draw live cells (they are queued onto generation boundaries by the runner); Shift+drag or right-click erases.',
      'Wrap edges makes the board a torus — gliders leaving right re-enter left. Turn it off (it’s live) and walls become absorbing.',
      'Patterns: seeded random soup (same seed, same soup), gliders, pulsar, Gosper glider gun, and the acorn, which churns for thousands of generations from 7 cells.',
      'Cell colour encodes age: newborns flare bright green, long-lived structures settle darker.',
      'Deterministic: the only randomness is the soup, drawn from the seeded RNG at init.',
    ],
    invariant: 'A blinker oscillates with period 2 and a block is stable forever — asserted exactly in logic.test.ts.',
  },
};

export default sim;
