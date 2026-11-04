# Cache Hierarchy

Exact set-associative L1/L2/L3 caches (LRU/FIFO/random) with an independent
naive reference model for differential testing.

## Address math

`offset = addr & (line−1)`, `set = (addr >> log2 line) & (sets−1)`,
`tag = addr >> (log2 line + log2 sets)`. All sizes, ways, lines and sets are
validated powers of two. Missing at Lk that hits at Lj fills levels above j
(non-inclusive, no back-invalidation — documented simplification).

## Models and traces

- Aggregate over all accesses; a prefix (`traceLimit`, default 2,000) is
  recorded for playback (address, hit level, L1 set, matrix position).
- AMAT = t1 + m1·(t2 + m2·(t3 + m3·tMem)) with local miss rates.
- Patterns: matrix-row/col (flat row-major assumption), sequential,
  strided, random (seeded).

## Headline demo

Tiny teaching cache (256 B direct-mapped L1): a 32×32 flat `int` matrix
gives **93.75%** L1 hits row-major and **0%** column-major. Compare mode
`traversal` races the two on the same cache; `config` compares LRU/FIFO and
1-way/2-way; `size` compares N=1024 vs 1025.

## Tests

Address round-trip; hand cases A–D and AMAT F; differential test against
the naive reference on 50 random configs (LRU/FIFO); matrix row/col hit
rates; pattern determinism; accounting and trace determinism.

Flat-layout assumption: C/1D arrays. Java `int[][]` rows are separate
objects, so exact addresses differ (column-major is still bad).

## Deviations

Aggregate runs are synchronous (capped at 4M accesses). The spec suggests
promoting runs above a threshold to the Phase-2 worker pool; the cache model
uses module helpers and is not self-contained for the Blob-worker factory, so
that is documented as future work rather than silently approximated.
