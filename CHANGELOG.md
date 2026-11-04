# Changelog

## Contract v5 — Phase 5 (Physics & Circuits)

- **Platform:** pure camera math + gesture controls (pan/zoom/pinch, F fit, follow), selectable integrators (Euler, semi-implicit, Verlet, RK4) with a zero-allocation `Stepper`, conserved-quantity diagnostics with a decimating recorder and log-drift chart, flat-array Barnes–Hut quadtree, Tarjan SCC, shared varint/base64 codec helpers, non-wrapping spatial hash, and `RunnerGroup` lockstep realtime compare with mirrored input and linked cameras.
- **N-Body Gravity:** Float64 presets (solar system, figure-8, chaos, galaxy, cluster), direct/tree forces with matching softened potential, trails, drag-launch/delete, diagnostics and integrator/method/dt compare modes.
- **Soft Body & Cloth:** Verlet particles, alternating Gauss–Seidel constraints, cloth/rope/blob builders, deterministic hash-noise wind, grab/cut/tear/pins, strain colouring and iterations compare.
- **Circuit / Logic Gates:** 3-valued event-driven logic with transport delays, compiled netlists excluded from snapshots (`compile` → `shared`), binary/JSON codecs, patch-based editor with undo, examples, waveform timeline, truth table and a 512-combination verified 4-bit adder.
- **Verification:** frame-rate independence asserted bitwise for N-body, cloth and the runner patterns; integrator order/Euler closed-form tests; Barnes–Hut vs direct accuracy; circuit differential and adder tests.

## Contract v4 — Phase 4 (Grids & Algorithms)

- **Grid core (`core/grid/`):** typed-array grid + corner-rule neighbours, pure edits (stamp/line/rect/flood-fill/replace) with exact undo patches, RLE+base64url and JSON codecs with strict validation, four perfect-maze generators, seeded value-noise terrain, ASCII fixtures. `UndoStack`, indexed min-heap.
- **Trace infrastructure (`core/trace/`):** `TraceCursor` (checkpoints + bounded replay; position n = steps 0..n-1 applied), fractional `TracePlayer`, `SyncGroup` (steps / work / normalized).
- **Contract v4 types:** `kind: 'trace'` with `input`/`input.codec`, `compare` modes + `enforce`, `TraceResult.work`; realtime sims gain `editor`/`onEdit`; `ParamDef.group`; runner edit queue.
- **UI:** `ImageData` grid canvas with overlays/markers, shared `mountGridEditor` (brush/line/rect/fill/eraser, palette, stroke-merged undo, draggable markers, JSON import/export), and a trace shell with scrubbing, step-back, step log, compare panes with three sync modes and shareable `in=`/`cmp=`/`b.*` URLs.
- **Sims:** Pathfinding Arena (five algorithms, fixed-point costs, admissibility/optimality badges, ASCII + property tests), Falling Sand (data-table materials/reactions, bottom-up alternating scan with stamps, 400×300, editor on a live sim), Cache Hierarchy (exact caches + independent reference model, AMAT, matrix-locality compare).
- **Verification:** 210 unit tests passing; ESLint + strict TypeScript clean.

## Contract v3 — Phase 3 (Signature Sims & Time-Travel Engine)

- **Discrete-Event Engine (`core/des/`):**
  - Binary min-heap priority queue with lazy $O(1)$ cancellation and $O(K)$ snapshot restore (`event-queue.ts`).
  - Strict integer simulation time with monotonic tie-breaking and loop starvation protection (`engine.ts`).
  - Time-travel `Player` with snapshot thinning and bounded replay (`player.ts`, [`docs/DESIGN-TIME-TRAVEL.md`](./docs/DESIGN-TIME-TRAVEL.md)).
  - Headless runner (`headless.ts`) for headless compare benchmarks and property test suites.
  - Replay equivalence verification (`assertReplayEquivalence`) and plain data enforcement (`assertPlainData`).
  - RNG internal state capture (`Rng.state()`) and resumption (`createRng(seed, state)`).
  - New `text` parameter kind with pattern validation and custom editor registration (`editor: 'process-table'`).
- **Event Shell UI (`ui/event-page.tsx`):**
  - Scrubbing, frame/event stepping forward/backward, jump to start/end, variable playback rates ($0.1\times$ to $20\times$).
  - Full branching history when taking user actions in the past.
  - Virtualized, filterable event log panel with actor/category chips, search, and JSON export.
  - Interactive canvas timeline/Gantt component with time-to-pixel zoom, pan, hover tooltips, and click-to-seek (`ui/timeline.tsx`).
  - Live Invariant Badge displaying real-time safety invariants.
  - Markdown-rendered Concepts tab with educational explanations and simplifications list.
- **Simulations:**
  - **CPU Scheduler:** FCFS, SJF, RR, Priority, SRTF; textbook convoy and SJF test cases, process table editor, compare tab.
  - **Raft Consensus (Event-Driven):** Leader elections, log replication, commit with Figure 8 rule, crash/restart/partition faults, 5 safety invariants, 60-seed fuzz test suite, mutation test suite.
  - **Time-Travel Debugger Studio:** Interactive state machine studio, snapshot checkpoint inspection, history branching, fault injection, and replay verification.
  - **JVM GC Visualizer:** Stop-the-world cell heap, mark-sweep vs generational collectors, nepotism floating garbage, fragmentation, leak-driven OOM, compare tab.
- **Verification:** 158 unit tests passing, ESLint architecture rules clean, strict TypeScript clean.

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
- Sims: **Game of Life** (cellular automaton, seeded patterns, pointer painting, wrap edges — promoted from the hub roadmap),
  **Double Pendulum** (RK4 chaos, ghost-pendulum divergence, energy-tested), **Raft Consensus**
  (elections, log replication, majority commit, crashable nodes — safety-tested), **Monte Carlo π**
  (chunked estimation with convergence band) — all three promoted from the hub roadmap, **Boids** (SoA, spatial hash, predators/obstacles, live steering,
  8 tests + bench), **Monte Carlo portfolio** (deterministic 1,000-run
  chunks; closed-form + mean-matching tests; fan chart, histogram,
  depletion), **Tax wrappers IKE/IKZE** (rules as sourced data with
  `asOf`; five hand-calculated fixture scenarios).
- 101 unit tests, all green; hub imports meta only, sims stay lazy chunks.

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
