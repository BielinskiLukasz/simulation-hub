import { bench, describe } from 'vitest';
import { runInline } from '../../core/job';
import { mcJob } from './job';
import { defaultParams } from './model';

/**
 * `npx vitest bench --run src/sims/monte-carlo/job.bench.ts`
 *
 * Inline (single-threaded) numbers — the worker pool splits the same fixed
 * chunks across cores, so divide by the pool size for the parallel case.
 */
describe('monte-carlo · inline', () => {
  bench(
    '10,000 runs × 50 years',
    () => {
      runInline(mcJob, { ...defaultParams, runs: 10_000 }, 4242);
    },
    { time: 2000, warmupTime: 300 },
  );

  bench(
    '50,000 runs × 50 years',
    () => {
      runInline(mcJob, { ...defaultParams, runs: 50_000 }, 4242);
    },
    { time: 3000, warmupTime: 300 },
  );
});
