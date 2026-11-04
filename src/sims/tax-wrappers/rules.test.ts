import { describe, expect, it } from 'vitest';
import { plRules } from './rules/pl';
import type { Sourced } from './rules/types';

// Validates the SHAPE of the real rules file — never the legal values
// themselves (those are re-verified by a human against the cited sources).
describe('pl rules file shape', () => {
  const entries: [string, Sourced<unknown>][] = [
    ['capitalGainsRate', plRules.capitalGainsRate],
    ['ikzePayoutRate', plRules.ikzePayoutRate],
    ['ikeYearlyLimit', plRules.ikeYearlyLimit],
    ['ikzeYearlyLimit', plRules.ikzeYearlyLimit],
    ['qualifiedAge.ike', plRules.qualifiedAge.ike],
    ['qualifiedAge.ikze', plRules.qualifiedAge.ikze],
    ['marginalIncomeRates', plRules.marginalIncomeRates],
  ];

  it('every value has a non-empty source and a valid ISO asOf date', () => {
    for (const [name, s] of entries) {
      expect(s.source.length, name).toBeGreaterThan(10);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(s.asOf), name).toBe(true);
      expect(Number.isNaN(Date.parse(s.asOf)), name).toBe(false);
    }
  });

  it('rates are within [0, 1] and limits/ages are positive', () => {
    for (const r of [plRules.capitalGainsRate.value, plRules.ikzePayoutRate.value, ...plRules.marginalIncomeRates.value]) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
    expect(plRules.ikeYearlyLimit.value).toBeGreaterThan(0);
    expect(plRules.ikzeYearlyLimit.value).toBeGreaterThan(0);
    expect(plRules.qualifiedAge.ike.value).toBeGreaterThan(0);
    expect(plRules.qualifiedAge.ikze.value).toBeGreaterThan(plRules.qualifiedAge.ike.value);
  });
});
