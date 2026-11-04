// ─── Simulation manifest ────────────────────────────────────────────────────
// Adding a simulation = one folder under src/sims/ + ONE line here.
// Only meta.ts files are imported statically (cheap); implementations load
// lazily through dynamic import() so the hub bundle stays tiny.

import type { SimEntry } from '../core/types';
import { meta as bouncingBalls } from './bouncing-balls/meta';
import { meta as boids } from './boids/meta';
import { meta as monteCarlo } from './monte-carlo/meta';
import { meta as taxWrappers } from './tax-wrappers/meta';

export const entries: SimEntry[] = [
  { meta: bouncingBalls, load: () => import('./bouncing-balls/index') },
  { meta: boids, load: () => import('./boids/index') },
  { meta: monteCarlo, load: () => import('./monte-carlo/index') },
  { meta: taxWrappers, load: () => import('./tax-wrappers/index') },
];
