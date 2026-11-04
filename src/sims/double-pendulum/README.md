# Double Pendulum

The canonical chaotic system: two rods, angles (θ₁, θ₂) from the downward
vertical, standard double-pendulum equations of motion (m₁ = m₂ = 1),
integrated with **RK4, 2 substeps** per 1/60 s runner step.

## Chaos, made visible

`ghosts` spawns copies of the pendulum perturbed by ±0.001 rad (seeded).
They track the main pendulum, then decorrelate completely — sensitive
dependence on initial conditions. Click/drag aims both links and releases
from rest, re-fanning the ghosts.

## Tests

Determinism (600 steps), **energy drift < 1% over 10 s** with damping off
(chaos is physics, not integrator error), damping settles the bob at the
bottom, ghost divergence > 80 px after 25 s, exact rest at θ = 0, live
gravity change leaves angles untouched, no NaN at extreme angles.

Gravity, lengths and damping are live params; initial angles and ghost
count re-init.
