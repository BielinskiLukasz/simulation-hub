# Bouncing Balls — the Phase 1 proof sim

The trivial simulation that proves the plugin contract end to end. If this
works, every future sim is just a folder plus one manifest line.

- **World:** fixed 800×600 logical units (rendering scales to the canvas).
- **Params** (all five control kinds): `count` (range), `gravity` (range),
  `restitution` (range), `radius` (range), `maxSpeed` (number),
  `collisions` (boolean), `palette` (select: mono/rainbow/speed),
  `color` (colour, used by mono).
- **Physics:** `vy += g·dt`, integrate, clamp at walls and flip velocity ×
  restitution. Optional equal-mass elastic ball–ball collisions (naive O(n²)
  with positional de-overlap).
- **Determinism:** randomness only in `init`, from the seeded `Rng` stored in
  state. `(params, seed)` ⇒ identical run, verified over 600 steps.
- **Invariants under test:** balls stay in bounds (2000 steps, collisions on);
  kinetic energy conserved at `restitution = 1, gravity = 0`; damped below 1.

Param changes re-init the sim with the same seed (Contract v1 behaviour) and
rewrite the URL via `history.replaceState`, so any state is shareable as a link.
