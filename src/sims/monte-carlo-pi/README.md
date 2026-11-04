# Monte Carlo π

Estimating π by sampling: points uniform in the unit square land in the
quarter circle with probability π/4, so `π̂ = 4 · inside/total`.

- **Chunks:** fixed 50,000 points, `deriveSeed(seed, index)`, reduce in
  index order — identical estimates regardless of delivery/worker order.
- **Result:** estimate, absolute error, correct digits
  (`floor(−log10 error)`), and a cumulative convergence series with a 95%
  confidence band (±1.96 · 4√(p(1−p)/N)) computed per chunk.
- **The lesson:** error ∝ 1/√N. One more digit = 100× the points. The same
  machinery, with a real model inside, is the portfolio Monte Carlo.

Tests: determinism, 1M-point accuracy < 0.01 with π inside the CI, exact
chunking of 120k points, reversed-delivery equality, monotone band narrowing.
