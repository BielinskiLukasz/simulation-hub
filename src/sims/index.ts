// ─── Simulation manifest ────────────────────────────────────────────────────
// Adding a simulation later = one folder under src/sims/ + ONE line here.
// Only meta.ts files are imported statically (cheap); implementations load
// lazily through dynamic import() so the hub bundle stays tiny.

import type { SimEntry } from '../core/types';
import { meta as bouncingBalls } from './bouncing-balls/meta';

export const entries: SimEntry[] = [
  { meta: bouncingBalls, load: () => import('./bouncing-balls/index') },
];
