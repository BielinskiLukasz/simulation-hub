# Simulation Hub

**Phase 2 — Proof Sims.** The Phase-1 platform (plugin contract, fixed-timestep
loop, URL state, seeded determinism, CI/CD) now stress-tested by three very
different workloads under **Contract v2**:

| Sim | Kind | Stresses |
|---|---|---|
| Bouncing Balls | realtime | the v1→v2 migration (live params, pointer spawn, HUD) |
| Boids Flocking | realtime | SoA typed arrays, spatial hash, 10k agents, predators |
| Monte Carlo Portfolio | batch (workers) | deterministic chunked jobs, fan chart, cancellation |
| Tax Wrappers (IKE/IKZE) | batch (inline) | rules-as-data with sources, hand-calculated tests |

Press **P** in any realtime sim for the perf HUD. Every sim is reproducible
from its URL: `#/sim/monte-carlo?seed=7&runs=20000`, `#/sim/boids?count=5000`.

**Live demo:** `https://bielinskilukasz.github.io/simulation-hub/`

![CI](https://github.com/bielinskilukasz/simulation-hub/actions/workflows/deploy.yml/badge.svg)

## Run locally

```bash
npm install
npm run dev        # dev server
npm test           # Vitest — 23 tests, node environment (core needs no DOM)
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
