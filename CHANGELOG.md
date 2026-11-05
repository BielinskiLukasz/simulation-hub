# Changelog

## Contract v6 — Phase 6 (Agents & Markets)

- **Statistics library:** Welford/Chan moments, type-7 quantiles, histograms, Acklam normal quantile, table t-critical values, t-intervals, Wilson intervals, seeded bootstrap and paired differences — validated by known values and coverage simulations.
- **Graph toolkit:** immutable CSR graphs, Erdős–Rényi / Watts–Strogatz / Barabási–Albert / lattice generators, degree moments, clustering, components, sampled path lengths, residual moments — with simple-graph property tests.
- **Metrics recorder + dashboard:** columnar, idempotent grid sampling, truncation for time travel, cap/decimate policies, CSV; React dashboard with log-y, gaps, hidden charts and per-chart canvases.
- **Batch runner:** cells × replicates over the worker pool, chunk-fixed seeds via `deriveSeed(base, r)` (common random numbers), per-cell CIs, Wilson indicators, conditional means, histograms and paired-difference significance; Markdown export.
- **Epidemic on networks (event):** exact event-driven SIR/SEIR on CSR graphs, degree-targeted vs random vaccination, R₀/T theory panel, degree histogram theory, final-size prediction, batch attack-rate sweep with CIs.
- **Order book (event):** price-time matching engine with generation-checked ids and a differential-tested reference model; agents (noise, market makers with withdrawal, trend, stop-loss), flash-crash scenario, invariant badge, metrics and crash-probability batch analysis.
- **Traffic (realtime):** IDM ring road, Bayesian-free deterministic perturbations, phantom jam verified with backwards wave velocity, space-time heatmap and fundamental-diagram batch.
- **Compare Mode** (Phase 5) remains live for realtime sims; the stale hub teaser was removed.

### Phase-6 completion pass

- **Ecosystem upgraded to Phase-6 level:** Lotka–Volterra RK4 companion in state,
  measured-rate **Calibrate** action, **Drought** and **Release predators**
  actions, metrics dashboard (populations + LV overlay, territory, energies),
  phase-portrait chart and a batch runner with oscillation/extinction
  indicators; 5 new tests (LV determinism/equilibrium, calibration/actions,
  ledger, batch output).
- **Order book:** fuzz suite with invariants after every event, seek-back
  branching test, ledger test and **mutation checks** (crossed book, cash leak)
  proving the invariants can fail; fixed a real bug where initial wake timers
  were scheduled on a no-op shim, leaving the market event queue empty.
- **Traffic:** optional fixed-cycle traffic light with a stop line; vehicles
  never cross on red (tested), signal rendering, plus periodicity tests.
- **Docs:** per-sim READMEs for epidemic, order book and traffic; STATS.md;
  honest known-gap lists (traffic network/editor, order-book stretch extras,
  live event compare).
- Verification: **305 tests**, lint/typecheck clean, build green.

## Phase 5 addendum — Compare Mode shipped & Ecosystem simulator

- **Compare Mode promoted from roadmap:** trace sims (Pathfinding, Cache Hierarchy) already had in-page compare; Phase 5 added realtime lockstep compare (`RunnerGroup`, mirrored input, linked cameras, `cmp`/`b.*` URLs) to N-Body, Cloth and now Ecosystem. The stale hub teaser was removed.
- **Ecosystem & Spatial Agents (new realtime sim):** seeded plant → herbivore → predator energy web; non-wrapping `SpatialHash` neighbour queries; decays-per-step territory claim overlay; reproduction, starvation and predation; camera, diagnostics, live params, click/shift/alt painting, and three lockstep compare modes (predators, perception, regrowth). 9 new tests cover determinism, bounds, starvation, meal energy, plant cap, predation pressure, territory, non-wrapping hash vs brute force, pointer and live params.

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
