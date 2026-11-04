# Pathfinding Arena

Five pathfinders on an editable weighted grid, recorded as deterministic
integer-cost traces.

## Conventions

- `ORTHO = 1000`, `DIAG = 1415`; entering a cell costs `base × terrain`
  (floor ×1, grass ×2, mud ×5, water ×10). Toggle `weighted` off to treat
  every passable cell as ×1.
- Heap order `(f, h, insertion)`; ties favour lower h. Neighbours iterate
  in a fixed order. Costs are fixed-point integers so equality tests are
  exact.
- JPS is restricted to uniform cost, 8-connected, `corner = never`; it is
  verified against exact A* octile and falls back to the exact trace if a
  jump edge would ever be suboptimal.

## Trace

`kind / cell / g / f / parent` per step (OPEN, UPDATE, EXPAND, SCAN, GOAL,
PATH, FAIL), plus `frontier`, `expandedCum` (work) and the final `path`.
A `TraceCursor` (checkpoint every 128 steps) replays the exploration for
scrubbing, including reopened nodes. The shell renders overlays: frontier,
closed, scanned, path and the current step.

## Hand-checked tests

Open 5×5: 4-connected cost 8000; 8-connected octile/JPS/Dijkstra 5660.
Wall-with-gap: 16 steps / 16000. No-path: BFS expands exactly the 6
reachable cells. Weighted shortcut: BFS 10000, Dijkstra/A* 6000.
Corner rules: never/oneBlocked forbid the squeeze, always allows (2830).
Properties: Dijkstra = A* octile = JPS; BFS steps ×1000 = cost; valid
paths; admissible A* expands ≤ Dijkstra; determinism.

## Performance

Measured in the CPU-throttled build sandbox: **A\* on 100×60, 25% walls
≈ 16 ms/run** (budget < ~20 ms), including the Dijkstra reference used for
the Optimal? badge. Traces are deterministic; compute time is measured only
in the shell and never affects summaries.
