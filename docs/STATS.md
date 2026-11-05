# Statistics in Simulation Hub

- **Never a single run.** Batch results report N (runs per cell), the base seed and 95% intervals.
- **Common random numbers.** Replicate `r` always uses `deriveSeed(base, r)`, so variants and sweep
  points are paired and differences have much lower variance.
- **Intervals.** Means use t-intervals (table-backed critical values); probabilities/indicators use
  Wilson score intervals; skewed metrics also report median/p5/p95, with seeded percentile bootstrap
  available in `core/stats/intervals.ts`.
- **Bimodal outcomes.** Epidemics report P(major outbreak) with a Wilson interval and attack-rate
  means conditional on a major outbreak; a bare mean would hide the fizzle mode.
- **Validation.** Known-value tests plus coverage simulations through the full pipeline (t, Wilson,
  bootstrap). "Significant" means the paired-difference CI excludes 0.
- **Scope.** Intervals quantify uncertainty in the mean over seeds for these parameters — not
  predictive uncertainty for a real system.
