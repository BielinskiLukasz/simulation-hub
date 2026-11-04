import { bench, describe } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, step } from './logic';

describe('cloth step', () => {
  bench('34x22 cloth, 12 iterations', () => { const s = init(defaultParams, createRng(1)); step(s, 1 / 60); });
  bench('100x60 cloth, 20 iterations (6k particles)', () => { const s = init({ ...defaultParams, clothW: 100, clothH: 60, iterations: 20 }, createRng(1)); step(s, 1 / 60); });
});
