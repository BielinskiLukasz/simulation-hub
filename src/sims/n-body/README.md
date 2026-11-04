# N-Body Gravity

Float64 2D gravity with four integrators and direct/Barnes–Hut forces.

- State: interleaved `pos`/`vel` Float64Arrays, massive-source index list,
  a zero-allocation `Stepper`, and a flat-array `QuadTree`.
- Presets: solar-system (AU/yr, G = 4π²), figure-8 (Chenciner–Montgomery),
  three-body chaos, galaxy collision (massless tracers unless selfGravity),
  random cluster (virial-scaled).
- Live: integrator, dt, substeps, softening, force method, θ, trails.
  Switching integrator or editing bodies calls `stepper.invalidate()`.
- Pointer: drag to launch a body, right-click deletes the nearest.
  Camera: wheel zoom, Space/middle drag pan, F fit, follow centre of mass.
- Diagnostics: K, softened U (exact ≤ 2,000 sources, tree estimate above),
  momentum, angular momentum, log-drift chart.

Measured in the build sandbox (CPU-throttled VM): run
`npx vitest bench src/sims/n-body/bench.ts` on target hardware and record
numbers here. Barnes–Hut accuracy vs θ is covered in
`src/core/physics/physics.test.ts` (θ=0 matches direct; RMS improves as θ
shrinks). Tree force breaks pairwise symmetry, so momentum drift at θ>0 is
expected physics of the approximation, not a bug.
