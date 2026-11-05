# Traffic Flow

IDM car-following on a single-lane ring, with a space-time diagram, a
traffic-light option and batch fundamental-diagram evidence.

## Model

- IDM: `a = a_max·[1 − (v/v₀)⁴ − (s*/s)²]`,
  `s* = s₀ + max(0, vT + vΔv/(2√(a·b)))`; ballistic update, speeds never
  negative, positions wrap modulo the ring, cyclic order preserved.
- 0.1 s integration, 6 substeps per runner step. Deterministic heterogeneity
  (desired speed/time gap) and optional trucks.
- Sugiyama preset: 22 cars, 230 m ring. A single brief braking perturbation
  grows into a phantom jam whose slow region travels **backwards** (measured
  ≈ −5 m/s by circular-centroid displacement of speed profiles).
- Optional traffic light: fixed cycle + green fraction, stop line at a
  fraction of the ring; on red vehicles treat the line as a stationary leader
  and never cross it. (No yellow/gap-acceptance rule yet.)

## Space-time + fundamental diagram

The canvas heatmap stores the last 240 runner steps × 120 cells (speed per
section). The Batch tab sweeps vehicle counts, replicates over seeds with
common random numbers and reports flow, mean speed, speed SD and a jam
indicator with intervals.

## Tests

Free-road convergence to v₀ and collision-free gaps; invariants (count,
bounds, determinism); phantom jam at the unstable density with backwards wave
> 70% of samples; signal periodicity and a red-light queue that never crosses
the line; frame-rate independence for the ring.

## Known gaps

Multi-lane MOBIL, signalized networks, routing, the road editor and its
codec/undo are **not** implemented; this is the 6b ring core plus a single
signalized junction, not the full network tier.
