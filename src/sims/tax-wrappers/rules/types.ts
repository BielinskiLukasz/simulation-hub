// ─── Tax rules as DATA. Every legal value carries its source + as-of date. ──
// The model code must contain NO hard-coded tax numbers — it reads these.

export interface Sourced<T> {
  value: T;
  source: string;
  asOf: string; // ISO date the value was checked
}

export interface TaxRules {
  id: string;
  label: string;
  capitalGainsRate: Sourced<number>; // tax on gains in a taxable account
  ikzePayoutRate: Sourced<number>; // flat rate on qualified IKZE payout
  ikeYearlyLimit: Sourced<number>; // contribution cap per year
  ikzeYearlyLimit: Sourced<number>; // contribution cap per year (employee case)
  qualifiedAge: { ike: Sourced<number>; ikze: Sourced<number> };
  marginalIncomeRates: Sourced<number[]>; // options offered in the UI for the IKZE refund
}
