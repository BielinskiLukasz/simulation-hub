import type { BatchSimulation } from '../../core/types';
import { meta } from './meta';
import { defaultParams, paramSchema, processChunk, type Params } from './model';
import { mcJob, type McResult } from './job';
import { mountResult } from './view';
import { createBlobWorker } from '../../runtime/worker-factory';

const sim: BatchSimulation<Params, McResult> = {
  kind: 'batch',
  meta,
  defaultParams,
  paramSchema,
  job: mcJob,
  // Real Web Workers: the pool spawns Blob workers running processChunk's
  // own serialised source (balances transferred zero-copy). If Workers are
  // unavailable/blocked, the batch shell transparently falls back to the
  // inline transport — identical results either way (deterministic chunks).
  createWorker: () => createBlobWorker(processChunk, (part: { balances: Float32Array }) => [part.balances.buffer as ArrayBuffer]),
  mountResult,
  about: {
    summary:
      'A Monte Carlo retirement simulator in today’s money (real returns). Every month: contribution or withdrawal first, then log-normal growth with the −σ²/24 drift correction so the expected gross growth equals exp(μ/12) exactly. Runs are split into fixed 1,000-run chunks, each with its own derived seed, and reduced in chunk order — the same seed gives the same numbers on any machine, any worker count.',
    bullets: [
      'Success: with withdrawals, ending above zero; without, reaching the target balance. It is shown next to the KPIs — definitions matter more than decimals.',
      'The fan chart shows p10–p90 and p25–p75 bands with the median; judge a plan by the median and the bad case (P10), never the average.',
      'Set volatility to 0 and the fan collapses onto the closed-form annuity curve — that is the model’s unit test, live.',
      'Deterministic chunking: 10,000 runs is 10 chunks whether 1 or 16 workers execute them; stale runs are cancelled when sliders move.',
      'Balances are stored only at yearly checkpoints (Float32), so 50k runs × 51 years ≈ 10 MB — monthly paths are never kept.',
    ],
    invariant: 'σ = 0 reproduces the annuity-due closed form to <1e-5, and the σ > 0 sample mean matches it within 3 standard errors (model.test.ts).',
  },
};

export default sim;
