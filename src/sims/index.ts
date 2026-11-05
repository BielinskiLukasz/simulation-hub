// ─── Simulation manifest ────────────────────────────────────────────────────
// Adding a simulation = one folder under src/sims/ + ONE line here.
// Only meta.ts files are imported statically (cheap); implementations load
// lazily through dynamic import() so the hub bundle stays tiny.

import type { SimEntry } from '../core/types';
import { meta as bouncingBalls } from './bouncing-balls/meta';
import { meta as boids } from './boids/meta';
import { meta as monteCarlo } from './monte-carlo/meta';
import { meta as taxWrappers } from './tax-wrappers/meta';
import { meta as gameOfLife } from './game-of-life/meta';
import { meta as doublePendulum } from './double-pendulum/meta';
import { meta as raft } from './raft/meta';
import { meta as monteCarloPi } from './monte-carlo-pi/meta';
import { meta as cpuScheduler } from './cpu-scheduler/meta';
import { meta as jvmGc } from './jvm-gc/meta';
import { meta as timeTravelDebugger } from './time-travel-debugger/meta';
import { meta as pathfinding } from './pathfinding/meta';
import { meta as fallingSand } from './falling-sand/meta';
import { meta as cacheHierarchy } from './cache-hierarchy/meta';
import { meta as nBody } from './n-body/meta';
import { meta as cloth } from './cloth/meta';
import { meta as circuit } from './circuit/meta';
import { meta as ecosystem } from './ecosystem/meta';

// Order is STABLE and append-only: Phase 1 → Phase 4, in the order each sim
// was added. New simulations go at the END, so adding one never reshuffles
// existing cards. (The hub renders this array as-is; registry filters keep
// the order.) Do not curate "newest first" here — that belongs to a future
// explicit `featured` flag, not to the manifest order.
export const entries: SimEntry[] = [
  { meta: bouncingBalls, load: () => import('./bouncing-balls/index') },
  { meta: boids, load: () => import('./boids/index') },
  { meta: monteCarlo, load: () => import('./monte-carlo/index') },
  { meta: taxWrappers, load: () => import('./tax-wrappers/index') },
  { meta: gameOfLife, load: () => import('./game-of-life/index') },
  { meta: doublePendulum, load: () => import('./double-pendulum/index') },
  { meta: raft, load: () => import('./raft/index') },
  { meta: monteCarloPi, load: () => import('./monte-carlo-pi/index') },
  { meta: cpuScheduler, load: () => import('./cpu-scheduler/index') },
  { meta: jvmGc, load: () => import('./jvm-gc/index') },
  { meta: timeTravelDebugger, load: () => import('./time-travel-debugger/index') },
  { meta: pathfinding, load: () => import('./pathfinding/index') },
  { meta: fallingSand, load: () => import('./falling-sand/index') },
  { meta: cacheHierarchy, load: () => import('./cache-hierarchy/index') },
  { meta: nBody, load: () => import('./n-body/index') },
  { meta: cloth, load: () => import('./cloth/index') },
  { meta: circuit, load: () => import('./circuit/index') },
  { meta: ecosystem, load: () => import('./ecosystem/index') },
];
