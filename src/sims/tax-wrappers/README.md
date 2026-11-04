# Tax Wrapper Comparison — IKE / IKZE vs Taxable (Poland)

> **Educational simulation, not tax advice.** Rules change yearly. Every
> legal value below lives in `rules/pl.ts` with a `source` and `asOf` date —
> re-verify against official sources (Ministry of Finance / gov.pl, your
> provider) before acting on any of this.

## How it works

Yearly projection, same gross contribution in every scenario. Order per
year: contribution at the **start**, then growth `(1 + grossReturn − feePct)`.

- **Taxable:** initial capital starts here; exit tax =
  capital-gains rate × max(0, value − cost basis).
- **IKE:** contributions capped at the yearly limit (if enabled); excess
  flows to a side taxable account in the same scenario. Qualified → no tax;
  early → gains taxed like taxable.
- **IKZE:** as IKE, plus a refund = marginal rate × contribution at
  contribution time (simplification), optionally reinvested into the side
  account. Qualified payout taxed at the flat payout rate on the whole
  amount; early payout at the marginal rate (simplification).
- Output per scenario: yearly **liquidation value** (net if you exited that
  year), final nominal and real (`nominal / (1+inflation)^years`), tax paid,
  refunds, and Δ vs taxable.

**Documented simplifications:** constant return, refund timing, flat payout
rates (no brackets), limits scaled by inflation, no dividend tax drag, no
account fees beyond `feePct`.

## Rules as data

`rules/types.ts` defines `Sourced<T> = { value, source, asOf }`.
`rules/pl.ts` holds the real (2026, verified) values; `rules/fixture.ts`
holds round numbers (20% / 10% / limits 10k) used **only** by tests, so
hand calculations stay trivial and tests survive real rule changes.
`rules.test.ts` validates the shape of the real file (sources present, ISO
dates, rates in [0, 1]) — never the legal values themselves.

## Hand-calculated tests (fixture rules)

A: 1,000 for 1 yr at 10% → taxable **1,080**, IKE **1,100**, IKZE **1,090**.
B: refund reinvested → IKZE **1,098**. C: early exit at 30% marginal → IKE
**1,080**, IKZE **1,070**. D: 15,000 with a 10,000 limit at 0% → all
scenarios **15,000**. E: 0% return → nets equal contributions. Plus a
multi-year loop written independently in the test, a real-value deflation
case, and the invariant IKE ≥ taxable for non-negative returns.
