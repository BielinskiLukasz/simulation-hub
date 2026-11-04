# Monte Carlo Portfolio Simulator

Thousands of simulated futures for a save-then-withdraw portfolio, computed
as a deterministic chunked job.

## Model conventions

- **Today's money only** (real terms) — pick a *real* expected return;
  inflation bookkeeping is deliberately absent.
- **Monthly steps.** Each month: (1) contribution/withdrawal at the start of
  the month, (2) growth. Monthly log-return
  `ln(1+r) = μ/12 − σ²/24 + (σ/√12)·Z`; the correction makes expected gross
  growth exactly `exp(μ/12)`, so the arithmetic mean matches the input.
- Balance floored at 0; a depleted run stays depleted.
- **Success:** `withdrawYears > 0` → final balance > 0; otherwise final
  balance ≥ `targetBalance`.

## Parameters

`initialBalance` 50,000 · `monthlyContribution` 1,000 · `accumYears` 25 ·
`withdrawYears` 25 · `expectedRealReturn` 4.5 %/yr · `volatility` 15 %/yr ·
`withdrawalStrategy` fixed-real / percent-of-balance · `monthlyWithdrawal`
3,000 · `withdrawalRate` 4 %/yr · `targetBalance` 1,000,000 (success target
when `withdrawYears = 0`) · `runs` 10,000 (1,000–50,000). All amounts are in
today's money; currency is not modelled.

## Deterministic parallelism

Chunk size is fixed at **1,000 runs**; chunk seeds are
`deriveSeed(seed, chunkIndex)`; `reduce` consumes parts in index order.
Worker count and completion order cannot change the result — proven by
processing chunks in reverse order in `job.test.ts`.

**Real workers:** the sim provides `createWorker`, which spawns Blob Web
Workers running `processChunk`'s own serialised source (balances returned
zero-copy via transfer). If Workers are blocked, the shell falls back to
inline compute and says so — results are identical either way.
`worker-factory.test.ts` proves serialised ≡ direct output.

## Performance

Target: 10,000 runs × 40 years < 1 s. Checkpoints are yearly Float32
(50k runs × 51 checkpoints ≈ 10 MB); monthly paths are never stored. If
`reduce` (column sorts) ever exceeds ~100 ms at 50k runs, move it into a
worker as a second stage — measure first.

## Tests (11)

Closed form at σ = 0 (vs annuity-due formula), mean-within-3-SE at σ > 0
(20k runs), determinism, worker-count independence, percentile ordering,
non-negative balances, exact chunking of 2,500 runs, σ = 0 depletion timing,
success monotonic in withdrawals, 1-year/1,000-run edge cases.
