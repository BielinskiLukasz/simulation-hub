# Changelog

## Contract v2 — Phase 2 (Proof Sims)

**Migration note:** simulations now declare `kind: 'realtime' | 'batch'`.
Realtime sims gain optional `applyParams` (hot updates for `ParamDef.live`
params), `onPointer` (runner-queued, step-boundary input), and `getStats`
(perf HUD). Bouncing Balls migrated with no regressions (gravity/restitution
live; click spawns a ball). Batch sims are `JobDefinition` map/reduce jobs
executed through `WorkerPool` with progress + cancellation.

- Core: `deriveSeed` + `createNormal` (Box–Muller), `stats.ts` (EMA,
  RollingMax), `input.ts` (world-space pointer math), `spatial-hash.ts`
  (counting-sort grid, property-tested vs brute force on 200 seeds),
  `job.ts` + `worker-protocol.ts`, runner v2 (injected clock, stats,
  pointer queue, `applyLiveParams`).
- Runtime: `WorkerPool` (ordered reduce, generation-based cancellation,
  transport seam with fake-transport tests), `expose-worker`.
- UI: perf HUD (`P` / `?hud=1`), pointer binding (capture, touch-action),
  canvas chart engine (fan bands, histogram, hover legend, theme-aware),
  KPI/progress/table kit, batch shell (200 ms debounce, abort, error keeps
  last result).
- Sims: **Boids** (SoA, spatial hash, predators/obstacles, live steering,
  8 tests + bench), **Monte Carlo portfolio** (deterministic 1,000-run
  chunks; closed-form + mean-matching tests; fan chart, histogram,
  depletion), **Tax wrappers IKE/IKZE** (rules as sourced data with
  `asOf`; five hand-calculated fixture scenarios).
- 76 unit tests, all green; hub imports meta only, sims stay lazy chunks.

## Contract v1 — Phase 1 (Platform Foundation)

- `Simulation<P, S>` contract: `meta`, `defaultParams`, `paramSchema`,
  `init(params, rng)`, `step(state, dt)`, `render(state, rc)`.
  The seeded `Rng` lives in state; `step` is pure (no DOM, no `Math.random`,
  no `Date.now` — ESLint-enforced).
- Core: mulberry32 seeded RNG, fixed-timestep `Runner` (dt = 1/60, accumulator,
  spiral-of-death guard), hash router, diff-only URL state (params + seed),
  registry with lazy `import()` loading.
- Hub UI: card grid, category chips, debounced search, theme toggle
  (persisted, respects `prefers-color-scheme`).
- Sim shell: play/pause/step/speed/reset/new-seed/copy-link, schema-generated
  controls (range, number, boolean, select, colour), Controls / How-it-works /
  State tabs, keyboard shortcuts, HiDPI canvas, full dispose on navigation.
- Reference sim: Bouncing Balls (gravity, restitution, optional elastic
  collisions, 3 palettes) with determinism, bounds, and energy tests.
- 23 unit tests; CI runs lint → typecheck → test → build → GitHub Pages.
