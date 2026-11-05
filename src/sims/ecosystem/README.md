# Ecosystem & Spatial Agents

A seeded predator–prey food web with energy flow, spatial neighbours and a
decaying territory overlay.

- **Agents:** plants (regrow), herbivores (graze), predators (hunt). Each
  animal pays a metabolic cost per second; meals transfer energy; animals
  reproduce above an energy threshold (herbivores also need enough plants
  standing) and die at zero energy.
- **Space:** the non-wrapping uniform spatial hash from Phase 5 (rebuilt per
  step, zero allocation) supplies neighbours within the perception radius.
  Edges are hard walls, not torus links — property-tested against brute force.
- **Territory:** presence writes claim values into an 80×60 grid that decays
  every step; the overlay shows grazing corridors and hunting grounds. Claims
  are a readable residue, not a force.
- **Interaction:** click paints plants, Shift+click herbivores, Alt+click a
  predator, right-click removes the nearest agent. Camera: wheel zoom,
  Space+drag pan, F fit.
- **Compare (lockstep, same seed):** predators vs none, perception 96 vs 170,
  regrowth 45 vs 15/s.
- **Live params:** regrowth, speeds, perception, energy gain, reproduction
  threshold, metabolism, territory toggle. Initial populations re-init.

Determinism, boundedness, starvation, meal-energy transfer, population cap,
predation pressure, territory sanity, non-wrapping hash equivalence and
pointer/live-param behaviour are covered in `logic.test.ts`.
