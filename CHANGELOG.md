# Changelog

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
