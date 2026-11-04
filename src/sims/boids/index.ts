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
    boids: s.n,
    predators: s.predators.length,
    obstacles: s.obstacles.length,
    avgNeighbors: Math.round(s.avgNeighbors * 10) / 10,
  }),
  about: {
    summary:
      'Each boid steers by three local rules over neighbours inside its perception radius: separation (don’t crowd), alignment (match nearby headings), cohesion (drift toward the local centre). Neighbours come from a uniform spatial hash rebuilt every step with a counting sort — no allocations in the hot loop, state is pure typed arrays (structure-of-arrays), so 10,000 boids stay a memory-bandwidth problem, not a GC problem.',
    bullets: [
      'Live params: separation / alignment / cohesion / perception / speed / force update mid-flight via applyParams — the flock never resets. Count and initial predators still re-init.',
      'Pointer: click or drag spawns boids, Shift+click drops a predator (they chase the nearest boid; boids flee within 140 px), Alt+click places an obstacle, right-click removes the nearest one.',
      'Wrap edges use minimum-image distances, so flocks flow seamlessly across the border; bounce edges flip velocity at the walls.',
      'Rendering batches by colour bucket — one canvas path per hue band (12 for heading, 8 for speed), not one per boid.',
      'getStats feeds the perf HUD (press P): watch avgNeighbors explode as perception grows — that number is the real cost driver.',
    ],
    invariant: 'Spatial-hash stepping matches an O(n²) brute-force reference step-for-step (logic.test.ts), and speed never exceeds maxSpeed.',
  },
};

export default sim;
