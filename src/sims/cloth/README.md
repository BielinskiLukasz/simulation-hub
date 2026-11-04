# Soft Body & Cloth

Position-based dynamics: Verlet particles + Gauss–Seidel distance
constraints with alternating sweep direction.

- Builders: cloth (structural + shear + bend constraints, closed-form
  counts tested), rope (pinned chain), blob (spoked ring).
- Interaction: drag grabs (release throws), Alt/right-drag cuts crossed
  constraints, Shift+click toggles pins. Wind is deterministic integer-hash
  value noise — no trig in the step, so replays are bit-exact.
- Stability: tested sweep at iterations {1, 5, 20, 40} — finite everywhere,
  max strain decreases with iterations, settles at 20+.
- Compare mode: iterations 1 vs 20 (or substeps 1 vs 4) in lockstep with
  mirrored grabs.

Benchmark: `npx vitest bench src/sims/cloth/bench.ts` (100×60 = 6,000
particles at 20 iterations; budget ≤ 8 ms/step — record your machine's
number here). No self-collision and no blob pressure model (stretch items).
