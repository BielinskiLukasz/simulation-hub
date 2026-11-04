# Game of Life

Conway's cellular automaton (1970). Two rules — a live cell survives with
2–3 neighbours, a dead cell is born with exactly 3 — generate gliders,
oscillators, and self-replicating machinery.

## How it works

- **State:** `Uint8Array` double buffer (80×60 at the default 10 px cells,
  160×120 at 5 px), plus a `Uint16Array` age grid used only for colouring.
- **Step:** full neighbour count per cell per generation, buffers swapped
  via `.set()`; `wrap` toggles toroidal (minimum-image) edges and is
  **live**. One runner step (1/60 s) = one generation.
- **Patterns:** seeded random soup, gliders, pulsar (period 3), Gosper
  glider gun (a new glider every 30 generations), acorn. The soup is the
  only randomness and comes from the seeded `Rng` at `init`.
- **Painting:** `onPointer` maps world → cell coordinates; drag draws,
  Shift/right-click erases. Input lands on generation boundaries via the
  runner queue.

## Tests

Block still-life, blinker period 2, glider (+1,+1) translation after 4
generations, seeded determinism over 200 generations, toroidal edge
oscillation, pointer paint/erase, underpopulation death.
