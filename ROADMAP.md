# Simulation Hub — Roadmap

| Phase | Scope | Planned | Actual (detailed plan) | Status |
|---|---|---|---|---|
| 1 | Platform foundation: contract, runner, RNG, URL state, Bouncing Balls, CI | 15–20 h (1–2 weekends) | 15–20 h | implemented |
| 2 | Proof sims: Boids, Monte Carlo (workers), Tax wrappers, charts, perf HUD, pointer input | 40–55 h (3–4 weekends) | 40–55 h | implemented |
| 3 | Signature sims: DES engine, time-travel, event log, timeline, scheduler, Raft, JVM GC | 4–5 weekends | **70–80 h core / 90–100 h full (6–9 weekends)** | implemented (core tier) |
| 4 | Grids & algorithms: grid core/editor, trace player, compare mode, Pathfinding, Falling Sand, Cache | says 3–4 weekends | **70–80 h core / 90–100 h full (6–8 weekends)** | implemented (core tier) |
| 5 | Physics: camera, integrators, diagnostics, Barnes–Hut, N-body, cloth, circuit | 4 weekends | **80–90 h core / 100–115 h full (7–9 weekends)** | implemented (core tier) |
| 5b | Ecosystem & spatial agents + Compare Mode promotion | — | ~10 h | implemented |
| 6 | Telemetry: time-series recorder, dashboards, batch seed runner | — | — | planned |
| 7 | Bonus: WebGL sand, city overlays, scenario presets | — | — | planned |

**Phase 4 delivered:** Contract v4 (`trace` kind, `input`, `compare`, `editor`/`onEdit`,
`ParamDef.group`), grid core with RLE/base64 codecs, four maze generators, noise terrain,
`ImageData` grid canvas, shared grid editor (Pathfinding + Falling Sand), checkpointed
`TraceCursor`, `TracePlayer`, `SyncGroup` (steps/work/normalized), trace shell with compare
panes and shareable `in=`/`cmp=`/`b.*` URLs, Pathfinding (5 algorithms + admissibility/optimality
badges), Falling Sand (400×300, data-driven reactions), Cache Hierarchy (exact caches + reference
differential test, AMAT, matrix-locality race).

**Not in the core tier (stretch, not implemented):** editor zoom/pan camera, weighted-A* compare
mode, G1-style cache extensions (sweep chart / 3C classification), tiled/pointer-chase patterns,
sand chunk sleeping, maze-carving animation, short generator-reference URLs.
