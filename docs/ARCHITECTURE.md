# Architecture — Simulation Hub

## Contract v4 (Phase 4) — editable grids, traces, compare

- New kind `trace`: pure `run(input, params) → TraceResult` (struct-of-arrays),
  with `input` codecs/generators/editor, optional `compare` modes and
  `TraceResult.work` for fair work-synchronised races.
- `TraceCursor` semantics (documented + tested): position `n` means steps
  `0..n-1` applied; seeking backwards restores the nearest checkpoint and
  replays ≤ K steps. Never per-algorithm inverse logic.
- Grid editing: pure `GridEdit → GridPatch`; strokes merge into one undo
  entry; the same editor is used by Pathfinding (trace) and Falling sand
  (realtime, edits queued by the runner onto step boundaries).
- Authoring rules: `run` pure/deterministic (no clocks; compute time shown
  only in the shell), integer fixed-point costs (ORTHO 1000, DIAG 1415),
  traces in typed arrays, views render idempotently for any position.
- JPS is constrained to uniform cost + corner=never and is verified against
  exact A* octile, falling back to the exact trace if pruning would ever be
  suboptimal (robustness over cleverness).
- Cache caches are validated powers of two; an independent naive reference
  model is differential-tested against the optimized model.
- Known v5 candidates: generic camera/pan-zoom, compare mode for realtime
  sims, trace compression for very large runs, and async trace runs through
  the Phase-2 worker pool.


## Contract v3 (Phase 3) — Discrete-Event Engine & Time-Travel

Contract v3 introduces the third simulation kind: `EventSimulation<P, S, E, A>` alongside `RealtimeSimulation` and `BatchSimulation`.

```ts
export interface EventSimulation<P, S, E, A> {
  kind: 'event';
  meta: SimMeta;
  defaultParams: P;
  paramSchema: ParamSchema<P>;
  playback: { unit: string; baseRate: number };
  init(params: P, ctx: InitCtx<E>): S;
  handle(ctx: EventCtx<S, E>, ev: E): void;
  applyAction?(ctx: EventCtx<S, E>, action: A): void;
  render(state: S, rc: RenderContext, view: { now: number; head: number }): void;
  deriveTimeline?(log: readonly LogEntry[], now: number, params: P): TimelineData;
  invariants?: Invariant<S>[];
  isFinished?(state: S): boolean;
  about: SimAbout;
}
```

### Core Invariants of Contract v3

1. **State is strictly Plain Data:**  
   State must only contain primitives, plain objects, standard arrays, or typed arrays. No class instances, prototypes, closures, or DOM nodes (`assertPlainData` enforced in test suites). This guarantees that `structuredClone` creates pure, deep-independent snapshots.
2. **Integer Simulation Time:**  
   Time is strictly integer units (`ms`, `µs`, or abstract units). Tie-breaking is deterministic via `(time, id)` sequence ordering in the binary min-heap.
3. **Time-Travel via Snapshot + Replay:**  
   See [`DESIGN-TIME-TRAVEL.md`](./DESIGN-TIME-TRAVEL.md). States are reconstructed via $f(\text{Params}, \text{Seed}, \text{InputLog})$, with snapshot thinning keeping memory bounded and seek latency sub-millisecond. Verified by `assertReplayEquivalence` across all event simulations.
4. **Invariant Oracle System:**  
   Simulations export pure `check(state) -> string | null` functions. Invariants run continuously after every event in fuzz testing and drive the live UI Invariant Badge.

---

## Contract v2 (Phase 2) — Proof Sims

Phase 1's friction list, resolved:

| Friction | Resolution |
|---|---|
| Monte Carlo has no per-frame `step` | Two kinds: `RealtimeSimulation` (loop-driven) and `BatchSimulation` (job-driven `plan → process → reduce`). The shell dispatches on `kind`. |
| Slider changes re-init the flock | `ParamDef.live?: boolean` + optional `applyParams(state, params)`: live params hot-update; others still re-init. Bouncing Balls' `gravity`/`restitution` migrated first as the regression test. |
| No pointer interaction | Optional `onPointer(state, ev)`; the runner queues events and applies them at the start of the next tick, before stepping (paused: immediately). Events carry world coordinates (`core/input.ts` pure, `ui/pointer.ts` DOM side). |
| No performance visibility | Optional `getStats(state)` + runner-measured `fps / stepMs / renderMs / maxFrameMs` (injected clock, EMA + rolling max in `core/stats.ts`). HUD toggles with `P` or `?hud=1`. |
| Rng-in-state vs passed to `step` | **Decision: keep Rng in state.** It worked in v1; per-step passing adds nothing. |
| Immutable vs mutate-in-place | **Decision: realtime sims may mutate and return the same state.** Tests snapshot via `structuredClone` or typed-array `.slice()`. |

### Batch determinism (the Phase-2 invariant)

Fixed chunk size (Monte Carlo: 1,000 runs — never derived from worker count),
per-chunk seeds via `deriveSeed(seed, chunkIndex)`, and `reduce` always
receives parts in chunk order. Same seed ⇒ identical results on 1 or 16
workers; proven by processing chunks in reverse order in tests.
`runtime/worker-pool.ts` talks to a `Transport` seam. Monte Carlo provides
`createWorker`, spawning **Blob Web Workers** that run `processChunk`'s own
serialised source (`runtime/worker-factory.ts`; the function is
self-contained for exactly this, and a test proves serialised ≡ direct
output) — so real workers execute even in the single-file build, with
zero-copy transfer of checkpoint buffers. If Workers are blocked, the batch
shell falls back once to the in-thread transport and says so; results are
identical by construction. (`WorkerTransport` + `expose-worker.ts` +
`sims/monte-carlo/worker.ts` remain for file-based worker deployments.)

### Phase-2 implementation notes (build-environment deviations, honestly)

- The UI shell is React (the spec allows swapping `ui/` if `core/` stays
  framework-free — it did, and ESLint still enforces it).
- Charts use a small zero-dependency canvas engine behind the planned
  wrapper API (`createChart → setData/setTheme/resize/dispose`, kinds:
  lines / bands / histogram) instead of uPlot, keeping the single-file
  bundle lean. Swapping in uPlot touches only sim views' `createChart` call.
- Boids step budget (≤ 6 ms @ 5k) was measured at ~10.6 ms/step in the
  CPU-throttled build sandbox (avgNeighbors ≈ 52 at default density) after
  inlining the neighbour loop, removing the scratch-buffer copy, and
  halving the hash cell size (5×5 query block). The default 1,500-boid
  flock steps in ~1.5 ms there; a mid-range laptop (the budget's reference)
  is expected several times faster — re-run the bench on target hardware
  before quoting the number.

### What still hurts (candidates for Contract v3 — not implemented)

1. **Snapshotability:** Phase 3 time-travel needs cheap state snapshots.
   Boids (typed arrays, `.slice()`) is ready; Bouncing Balls' object arrays
   are copyable but not free. A `snapshot?/restore?` hook may belong in v3.
2. **Batch views are imperative DOM** inside a React shell (`mountResult`);
   works and disposes cleanly, but a declarative result spec would test better.
3. **Reduce on the main thread:** Monte Carlo's column sorts could exceed
   ~100 ms at 50k runs on slow devices; a second-stage worker reduce is the
   planned escape hatch (measure first).
4. **Input recording:** the runner applies pointer events on step boundaries
   but does not yet record them; Phase 3 replay will need an input log keyed
   by step count.
5. `getStats` returns untyped records — fine for a HUD, weak for the Phase-6
   time-series recorder.

---

# Phase 1 foundation (unchanged)

## Contract v1 (`src/core/types.ts`)

```ts
interface Simulation<P, S> {
  meta: SimMeta;
  defaultParams: P;
  paramSchema: ParamSchema<P>;          // → auto-generated controls
  init(params: P, rng: Rng): S;         // the Rng instance lives in S
  step(state: S, dt: number): S;        // pure logic, fixed dt = 1/60
  render(state: S, rc: RenderContext): void;
}
```

`meta.ts` is separate from the implementation so the hub grid renders cards
without downloading any simulation code; implementations arrive via dynamic
`import()` in `src/sims/index.ts`. Adding a sim = one folder + one manifest line.

## Folder rules (ESLint-enforced)

| Area | May use DOM / framework? | `Math.random` / `Date.now`? |
|---|---|---|
| `src/core/**` | **No** | **No** (seeded `Rng` only) |
| `src/sims/**/logic.ts` | **No** | **No** |
| `src/sims/**/render.ts` | Canvas only (via `RenderContext`) | Discouraged |
| `src/ui/**`, `src/App.tsx` | Yes (React shell — swappable) | UI-side only (e.g. "New seed") |

## Determinism rules

- A run is fully determined by `(params, seed)`. `step()` takes no `rng`
  argument; sims that need chance during stepping store the `Rng` from
  `init()` in their state.
- Physics uses a fixed logical world (Bouncing Balls: 800×600) independent
  of canvas pixels; the shell scales by `devicePixelRatio`.
- The `Runner` accumulates real elapsed time and advances in exact `1/60 s`
  slices (clamped at 0.25 s/frame, max 8 steps/frame, backlog dropped) —
  simulation speed is identical at 30/60/144 Hz. Covered by `runner.test.ts`.

## Decisions

- **step() mutates and returns the same state.** Allocation-free at 500 balls
  × 60 Hz. Tests snapshot with `structuredClone` before comparing.
- **URL state is diff-only**: only non-default params are written, seed always
  is; colours lose their `#`, booleans are `1`/`0`. Updates use
  `history.replaceState` (no `hashchange`, no history spam). Decoding clamps
  to schema ranges and falls back to defaults — garbage URLs never crash.
- **Param changes re-init** the sim with the same seed (simple, deterministic).
  Live mid-flight tweaking is a possible per-sim Phase-2 feature.

## What Phase 2 will probably change

1. Where the `Rng` lives (in state vs. passed to `step`) once real sims vote.
2. Mutate-in-place vs. immutable state, once Boids at 5k agents shows the cost.
3. Whether `render` needs the previous state for interpolation.
4. A separate "batch job" shape for Monte Carlo sims (no per-frame rendering).
5. Metrics exposure (FPS, step time, per-sim stats) for the perf HUD/charts,
   plus Web Workers and a pointer-input abstraction.

## Tests (Vitest, node environment — core needs no DOM)

`rng` (determinism, range), `router` + `url-state` (round-trip, clamping),
`runner` (60 Hz ≈ 144 Hz step counts, speed, pause, spiral-of-death guard),
`registry` (lookup/filter/search), `bouncing-balls/logic` (600-step
deep-equal determinism, bounds, energy conservation/damping). **23 tests.**
