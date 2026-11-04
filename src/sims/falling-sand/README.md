# Falling Sand

400×300 cellular-automaton sandbox with data-driven materials/reactions.

## Rules

- Materials table (`materials.ts`): powder / liquid / gas / static / fire,
  with density and flammability. Reactions table (`reactions.ts`): lava +
  water → stone + steam, fire + plant → fire, lava + plant → fire,
  plant + water → growth.
- Update: bottom→top, alternating row direction, per-tick `stamp` prevents
  double moves. Powder/liquid fall, slide diagonally, liquids spread
  sideways; gases rise; fire burns out; density swaps make sand sink.
- Rendering: one `ImageData` write per frame (no per-cell fillRect).
- The shared grid editor paints through the runner's edit queue, so edits
  land on step boundaries. Palette: sand, water, stone, plant, fire, lava.

## Tests

Determinism, conservation (sand/water/stone), settling/slope, density
ordering, reactions (quench, fire spread, burnout), no double moves, edge
modes, valid ids, live-param immutability, editor `onlyEmpty`.

Model, not a physical simulator: no pressure field or thermal model.

## Performance

Measured in the build sandbox (shared, CPU-throttled VM — expect a laptop to
be faster): **400×300 hourglass ≈ 4.3 ms/step** (budget ≤ 6 ms), measured
over 60 steps after warmup. Rendering reuses one ImageData buffer and one
offscreen canvas (no per-frame allocation of either).
