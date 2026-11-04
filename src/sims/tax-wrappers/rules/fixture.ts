// ─── Fixture rules — round numbers used ONLY by tests ───────────────────────
// Hand calculations stay trivial, and tests never break when real rules change.

import type { TaxRules } from './types';

const s = <T,>(value: T) => ({ value, source: 'fixture', asOf: '2026-01-01' });

export const fixtureRules: TaxRules = {
  id: 'fixture',
  label: 'Fixture (tests only)',
  capitalGainsRate: s(0.2),
  ikzePayoutRate: s(0.1),
  ikeYearlyLimit: s(10000),
  ikzeYearlyLimit: s(10000),
  qualifiedAge: { ike: s(60), ikze: s(65) },
  marginalIncomeRates: s([0.1, 0.3]),
};
