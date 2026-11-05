# Simulation Hub

**Phase 6 — Agents & Markets.** A deterministic simulation platform with **22 simulations across four execution paradigms** (real-time, batch, event, trace) under **Contract v6**:

| Sim | Kind | Showcases |
|---|---|---|
| **Epidemic on Networks** | event | Exact SIR/SEIR on ER/WS/BA, degree vs random vaccination, theory panel, batch Wilson CIs |
| **Order Book & Markets** | event | Price-time matching engine (differential-tested), MM liquidity withdrawal, flash-crash batch analysis |
| **Traffic Flow** | realtime | IDM ring, phantom jams travelling backwards, space-time diagram, fundamental diagram via batch |
| **Ecosystem & Spatial Agents** | realtime | Predator–prey energy web, non-wrapping spatial hash, territory overlay, lockstep compare |
| **N-Body Gravity** | realtime | Integrators, Barnes–Hut, energy diagnostics, camera, realtime compare |
| **Soft Body & Cloth** | realtime | Verlet constraints, grab/cut/tear, wind, iterations compare |
| **Circuit / Logic Gates** | event | 3-valued event logic, editor, waveforms, verified 4-bit adder |
| **Pathfinding Arena** | trace | A*, Dijkstra, BFS, greedy, JPS on an editable weighted grid; admissibility badge; work-synced race |
| **Falling Sand** | realtime | 400×300 materials CA, data-driven reactions, shared grid editor painting at step boundaries |
| **Cache Hierarchy** | trace | Set-associative L1/L2/L3, LRU/FIFO/random, AMAT, row- vs column-major matrix race |
| **Time-Travel Debugger** | event | Scrub history backwards, inspect snapshot intervals, branch alternate futures, inject faults, replay bit-identity |
| **CPU Scheduler** | event | FCFS, SJF, RR, Priority, SRTF, Gantt timeline, custom process table, compare tab |
| **Raft Consensus** | event | Distributed consensus, leader elections, log replication, partition faults, time-travel, invariant fuzzing |
| **JVM GC Visualizer** | event | Stop-the-world pauses, fragmentation, generational nursery/tenuring, nepotism, OOM, compare tab |
| **Boids Flocking** | realtime | Structure-of-arrays typed arrays, counting-sort spatial hash, 10k agents, predators, live parameters |
| **Monte Carlo Portfolio** | batch (workers) | Web Worker pool, deterministic chunking, fan chart, sequence-of-returns risk |
| **Double Pendulum** | realtime | RK4 symplectic integration, Lyapunov ghost divergence, energy conservation invariants |
| **Game of Life** | realtime | Conway B3/S23 cellular automaton, wrap torus, paintable canvas, seeded pattern soups |
| **Tax Wrappers (IKE/IKZE)** | batch (inline) | Data-driven legal rules with source URLs, hand-calculated verification tests |
| **Monte Carlo π** | batch | Deterministic chunked estimation, $1/\sqrt{N}$ confidence band tightening |
| **Bouncing Balls** | realtime | Fixed-timestep accumulator loop, restitution, seeded Mulberry32 RNG, URL state |

Press **P** in any real-time simulation for the performance HUD. **Batch runner** with confidence intervals, common random numbers and paired differences is available on the new Phase 6 sims. **Compare Mode** is live: trace sims have an in-page compare tab, and N-Body/Cloth/Ecosystem have a lockstep two-pane Compare button (shared seed, mirrored input, linked cameras, `cmp=` links). Trace sims support playback, stepping and two-pane compare; the grid editor is shared by Pathfinding and Falling Sand.
Press **Space** (play/pause), **.** (step forward), **,** (step back), **Home** / **End**, or scrub the timeline in any event simulation.
Every simulation run is bit-identical and shareable via its URL hash (e.g. `#/sim/raft?scenario=isolate-leader`, `#/sim/cpu-scheduler?algorithm=sjf`).

**Live demo:**  [Simulation Hub](https://bielinskilukasz.github.io/simulation-hub/)

![CI](https://github.com/bielinskilukasz/simulation-hub/actions/workflows/deploy.yml/badge.svg)

## Run locally

```bash
npm install
npm run dev        # dev server
npm test           # Vitest — 295 tests, node environment (core needs no DOM)
npm run lint       # ESLint, incl. the architecture rules below
npm run typecheck  # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run build      # production build
```

## How to add a simulation

1. Create `src/sims/<id>/` with `meta.ts`, `logic.ts`, `render.ts`, `index.ts`
   (copy `bouncing-balls/` as the reference).
2. Define `Params`, `paramSchema`, and `defaultParams` — the controls panel,
   URL encoding, and clamping are generated from the schema for free.
3. Write `logic.test.ts`: determinism (same seed → deep-equal states) plus one
   domain invariant (e.g. energy conservation).
4. Add one line to `src/sims/index.ts`:
   `{ meta, load: () => import('./<id>') }` — done, it appears on the hub.

## The rules that keep it honest

- `core/` and every `logic.ts` are **pure**: ESLint forbids `document`,
  `window`, `localStorage`, `Math.random`, and `Date.now` there. Randomness
  comes from the seeded mulberry32 `Rng`; time comes from the `Runner`.
- A run is fully determined by **(params, seed)** — and both live in the URL
  (`#/sim/bouncing-balls?seed=7&count=200&gravity=0`), diff-only encoded.
- Physics runs at a **fixed 1/60 s timestep** regardless of display refresh
  rate (proven by test at 60 Hz vs 144 Hz).
- Sims are **lazy-loaded**: the hub imports `meta.ts` only.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the contract,
decisions, and what Phase 2 will probably change.
