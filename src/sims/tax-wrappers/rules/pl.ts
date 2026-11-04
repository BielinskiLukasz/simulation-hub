// ─── Poland (IKE / IKZE) rules — verified 2026 values ───────────────────────
// Sources checked via official/primary summaries (see `source` per value).
// Re-verify before relying on these: limits change every year.

import type { TaxRules } from './types';

const LIMITS_SOURCE =
  'MRPiPS announcement of Nov 2025 (2026 limits) — https://rf.gov.pl/indywidualne-plany-emerytalne-ike-i-ikze-3-rady-ekspertki/ and https://generali-investments.pl/contents/display-article/klient-instytucjonalny/nowe-limity-ike-i-ikze/5';
const AS_OF = '2026-01-28';

export const plRules: TaxRules = {
  id: 'pl',
  label: 'Poland (IKE / IKZE)',
  capitalGainsRate: {
    value: 0.19,
    source: 'Podatek od zysków kapitałowych (“podatek Belki”) 19% — ustawa o PIT, art. 30a; https://rf.gov.pl/indywidualne-plany-emerytalne-ike-i-ikze-3-rady-ekspertki/',
    asOf: AS_OF,
  },
  ikzePayoutRate: {
    value: 0.1,
    source: 'Qualified IKZE payout (age 65+, 5 years of contributions): 10% flat tax on the whole payout — ustawa o PIT, art. 30g',
    asOf: AS_OF,
  },
  ikeYearlyLimit: { value: 28260, source: `${LIMITS_SOURCE} — IKE 2026: 28,260 zł`, asOf: AS_OF },
  ikzeYearlyLimit: { value: 11304, source: `${LIMITS_SOURCE} — IKZE 2026 (employees): 11,304 zł (16,956 zł self-employed)`, asOf: AS_OF },
  qualifiedAge: {
    ike: { value: 60, source: 'IKE qualified payout from age 60 (55 with pension rights) — ustawa o IKE/IKZE', asOf: AS_OF },
    ikze: { value: 65, source: 'IKZE qualified payout from age 65 — ustawa o IKE/IKZE', asOf: AS_OF },
  },
  marginalIncomeRates: {
    value: [0.12, 0.32],
    source: 'PIT scale 12% / 32% (2026) — ustawa o PIT, art. 27; https://rf.gov.pl/indywidualne-plany-emerytalne-ike-i-ikze-3-rady-ekspertki/',
    asOf: AS_OF,
  },
};
