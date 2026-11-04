import { bench, describe } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, step } from './logic';

/**
 * `npx vitest bench --run src/sims/boids/logic.bench.ts`
 * Budget: 5,000 boids <= 6 ms per step leaves room to render at 60 fps.
 */
for (const count of [1000, 5000, 10_000]) {
  describe(`${count.toLocaleString('en-US')} boids`, () => {
    const state = init({ ...defaultParams, count, predators: 0 }, createRng(1));
    bench(
      'step (1/60 s)',
      () => {
        step(state, 1 / 60);
      },
      { time: 1200, warmupTime: 200 },
    );
  });
}
