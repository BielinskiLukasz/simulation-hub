import { bench, describe } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, step } from './logic';

describe('n-body step', () => {
  bench('500 bodies direct verlet', () => { const s = init({ ...defaultParams, preset: 'random-cluster', bodies: 500, integrator: 'verlet' }, createRng(1)); step(s, 1 / 60); });
  bench('5000 bodies barnes-hut verlet', () => { const s = init({ ...defaultParams, preset: 'random-cluster', bodies: 5000, forceMethod: 'barnes-hut', integrator: 'verlet' }, createRng(1)); step(s, 1 / 60); });
});
