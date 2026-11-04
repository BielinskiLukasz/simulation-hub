import { describe, expect, it } from 'vitest';
import { project, type ModelParams } from './model';
import { fixtureRules } from './rules/fixture';

// Fixture: capital gains 20%, IKZE payout 10%, limits 10,000 — hand-checkable.
const A: ModelParams = {
  initialCapital: 0, yearlyContribution: 1000, years: 1, grossReturnPct: 10,
  feePct: 0, inflationPct: 0, marginalRate: 0.1, capToLimit: true,
  reinvestRefund: false, qualified: true,
};

describe('tax wrappers — hand-calculated cases (fixture rules)', () => {
  it('A: one year — taxable 1,080 · IKE 1,100 · IKZE 1,090', () => {
    const r = project(A, fixtureRules);
    expect(r.accounts.taxable.finalNominal).toBeCloseTo(1080, 6); // 1,100 − 20%×100
    expect(r.accounts.ike.finalNominal).toBeCloseTo(1100, 6);
    expect(r.accounts.ikze.finalNominal).toBeCloseTo(1090, 6); // 1,100×0.9 + 100 refund
    expect(r.accounts.ikze.refunds).toBeCloseTo(100, 6);
  });

  it('B: refund reinvested — IKZE total 1,098', () => {
    const r = project({ ...A, reinvestRefund: true }, fixtureRules);
    // refund 100 → grows to 110 in side taxable; gain 10, tax 2, side net 108; 990 + 108
    expect(r.accounts.ikze.finalNominal).toBeCloseTo(1098, 6);
  });

  it('C: early withdrawal (marginal 30%) — IKE taxed like taxable; IKZE at marginal rate', () => {
    const r = project({ ...A, qualified: false, marginalRate: 0.3 }, fixtureRules);
    expect(r.accounts.ike.finalNominal).toBeCloseTo(1080, 6);
    expect(r.accounts.ikze.finalNominal).toBeCloseTo(770 + 300, 6); // 1,100×0.7 + 300 refund
  });

  it('D: limit binds — excess flows to taxable; at 0% return all scenarios tie', () => {
    const r = project({ ...A, yearlyContribution: 15000, grossReturnPct: 0 }, fixtureRules);
    expect(r.accounts.ike.finalNominal).toBeCloseTo(15000, 6);
    expect(r.accounts.taxable.finalNominal).toBeCloseTo(15000, 6);
    expect(r.accounts.ikze.finalNominal).toBeCloseTo(15000, 6); // 9,000 + 5,000 side + 1,000 refund
  });

  it('E: zero return — nets equal contributions; only IKZE payout tax bites', () => {
    const r = project({ ...A, grossReturnPct: 0, years: 5, yearlyContribution: 2000 }, fixtureRules);
    expect(r.accounts.taxable.finalNominal).toBeCloseTo(10000, 6);
    expect(r.accounts.ike.finalNominal).toBeCloseTo(10000, 6);
    expect(r.accounts.taxable.taxPaid).toBeCloseTo(0, 6);
    expect(r.accounts.ikze.finalNominal).toBeCloseTo(10000 * 0.9 + 5 * 200, 6);
  });

  it('multi-year taxable matches an independent loop written in the test', () => {
    const p: ModelParams = { ...A, years: 7, yearlyContribution: 3000, grossReturnPct: 6, feePct: 1, initialCapital: 5000 };
    let value = 5000; let basis = 5000;
    for (let y = 0; y < 7; y++) { value += 3000; basis += 3000; value *= 1.05; }
    const expected = value - 0.2 * Math.max(0, value - basis);
    expect(project(p, fixtureRules).accounts.taxable.finalNominal).toBeCloseTo(expected, 6);
  });

  it('real value deflates by (1+inflation)^years', () => {
    const r = project({ ...A, inflationPct: 2 }, fixtureRules);
    expect(r.accounts.ike.finalReal).toBeCloseTo(r.accounts.ike.finalNominal / 1.02, 6);
  });

  it('invariant: IKE net ≥ taxable net whenever return ≥ 0 (qualified)', () => {
    const r = project({ ...A, years: 10, yearlyContribution: 4000, grossReturnPct: 5 }, fixtureRules);
    expect(r.accounts.ike.finalNominal).toBeGreaterThanOrEqual(r.accounts.taxable.finalNominal);
  });
});
