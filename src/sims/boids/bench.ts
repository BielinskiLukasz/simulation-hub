// Run with: npx vitest bench src/sims/boids/bench.ts
// Budget: 5k boids ≤ 6 ms/step leaves room for rendering at 60 fps.
import { bench, describe } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, step, type Params } from './logic';

function make(count: number) {
  const params: Params = { ...defaultParams, count };
  return init(params, createRng(42));
}

describe('boids step', () => {
  bench('1k boids', () => { const s = make(1000); step(s, 1 / 60); });
  bench('5k boids', () => { const s = make(5000); step(s, 1 / 60); });
  bench('10k boids', () => { const s = make(10000); step(s, 1 / 60); });
});
