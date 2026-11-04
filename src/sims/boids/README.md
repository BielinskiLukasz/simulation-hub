# Boids Flocking

Reynolds' boids (1987): separation + alignment + cohesion over neighbours in
a perception radius. Emergent flocking from three local steering rules.

## How it works

- **State:** structure-of-arrays (`Float32Array` x/y/vx/vy/ax/ay, capacity
  10,000). No per-boid objects, no allocation in the step loop.
- **Neighbours:** uniform spatial hash (`core/spatial-hash.ts`), counting-sort
  rebuild each step, wrapped 3×3 queries with minimum-image distances in
  `wrap` mode. `cellSize = perception`, so the 3×3 block covers the radius.
- **Steering:** separation ∝ Σ −offset/d² inside 40% of perception; alignment
  steers toward mean neighbour velocity; cohesion toward the local centroid.
  Combined force clamped to `maxForce`; speed clamped to
  `[0.35·maxSpeed, maxSpeed]`.
- **Predators** chase the nearest boid (turn-limited); boids flee within
  140 px. **Obstacles** repel within `r + 28`.
- **Render:** one canvas path per colour bucket (12 heading hues / 8 speed
  bands / mono), triangles from velocity direction.

## Parameters

`count` 100–10,000 (default 1,500, re-init) · `separation` / `alignment` /
`cohesion` 0–3 (live) · `perception` 10–100 px (live) · `maxSpeed`
50–400 px/s (live) · `maxForce` 50–800 px/s² (live) · `predators` 0–5
initial (re-init) · `obstacles` on/off (live) · `edges` wrap / bounce
(live) · `colorBy` heading / speed / mono (live).

## Interaction

Click/drag spawns boids · Shift+click predator · Alt+click obstacle ·
right-click removes the nearest obstacle/predator. Steering params are
**live** (no re-init); `count` and initial `predators` re-init.

## Performance

Budget: 5,000 boids ≤ 6 ms/step (step only). Measure on your machine:

```bash
npx vitest bench src/sims/boids/bench.ts
```

Recorded in the Phase-2 build sandbox (shared, CPU-throttled VM — expect a
mid-range laptop to be several times faster): 1k ≈ 0.9 ms/step,
1.5k ≈ 1.5 ms/step, 5k ≈ 10.6 ms/step, 10k ≈ 36 ms/step at default
density (avgNeighbors ≈ 11 / 16 / 52 / 104) after the perception/2 cell
optimisation (5×5 query block, ~30% fewer candidates). The 6 ms budget at 5k is a laptop target; re-run the bench on
your machine and replace these numbers. Optimisations already applied:
inlined neighbour loop (no per-boid closure), direct spatial-hash cell
iteration (no scratch copy), squared distances, axis early-out. The HUD
(key `P`) shows live step/render ms and `avgNeighbors`, the real cost
driver as perception grows.

## Tests

Determinism (300 steps, identical arrays), no-NaN under extreme params,
speed bound, wrap/bounce bounds, alignment-emergence and separation-growth
behaviour, hot-update position invariance, and hash-vs-brute-force
trajectory equivalence (n = 200).
