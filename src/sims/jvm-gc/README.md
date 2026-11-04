# JVM GC Visualizer

An **educational model** of JVM garbage collection — not a JVM emulator.
Objects are contiguous runs on a cell heap (default 4,096 cells ≈ 64 MB at
16 KB/cell) with seeded lifetimes and a parent-reference forest. A mutator
ticks every 10 ms of sim time; allocation failure collects atomically at
the pause start and blocks the mutator for the pause duration.

## Collectors

- **Mark-sweep (-compact):** single space, first-fit (fragmentation is
  real: allocation can fail with free cells but no contiguous run), mark
  via parent-chain reachability, sweep; optional slide compaction.
- **Generational:** young `[0, youngCells)` / old split. Minor GC keeps
  young objects reachable from roots **or from any old object** — the
  remembered-set rule that produces floating garbage ("nepotism", tested).
  Survivors age; promotion at `tenuring`; full mark-compact at
  `fullGcAtPct` old occupancy or promotion failure. G1 is a documented
  stretch goal, not implemented.

## Cost model

`pause = base + k·marked/copied/swept/moved cells`, all constants in
`constants.ts`, tuned so full GCs read ~50–150 ms and minor GCs ~2–10 ms.
Model milliseconds — legible, not measured.

## Tests

Fragmentation construction + compaction fix; safety oracle (no reachable
object freed, full-GC completeness) for both collectors; minor-GC aging
and promotion; nepotism; accounting after mixed sequences; behavior:
generational beats mark-sweep on `web-requests`, `leaky` ends in OOM,
replay equivalence and plain-data state.
