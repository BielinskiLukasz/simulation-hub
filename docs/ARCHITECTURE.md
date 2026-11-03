# Architecture — Simulation Hub (Phase 1)

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
