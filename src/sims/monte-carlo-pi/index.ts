import type { BatchSimulation } from '../../core/types';
import { meta } from './meta';
import { defaultParams, paramSchema, piJob, type Params, type PiResult } from './job';
import { mountResult } from './view';

const sim: BatchSimulation<Params, PiResult> = {
  kind: 'batch',
  meta,
  defaultParams,
  paramSchema,
  job: piJob,
  // Inline transport via the shared pool (progress + cancellation included);
  // the portfolio sim is the one that ships real Blob workers.
  mountResult,
  about: {
    summary:
      'The friendliest Monte Carlo there is: throw N seeded points into a unit square, count how many land inside the quarter circle, multiply the ratio by 4. It converges to π — slowly, like 1/√N — and the confidence band drawn around the running estimate is the honest part: it tells you exactly how little a million points buys.',
    bullets: [
      'Deterministic chunks of 50,000 points with derived seeds: drag the slider to 5,000,000, copy the link, and anyone reproduces the same estimate digit for digit.',
      '“Correct digits” grows painfully: each additional digit costs 100× the points. That is the universal Monte Carlo tax.',
      'The same plan → process → reduce machinery powers the portfolio simulator — same determinism rules, bigger model.',
      'Runs through the batch shell’s pool on the inline transport with progress and cancellation.',
    ],
    invariant: 'Same seed ⇒ same estimate, and the 95% band narrows monotonically as chunks accumulate (job.test.ts).',
  },
};

export default sim;
