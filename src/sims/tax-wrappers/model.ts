// ─── Tax wrappers · model.ts — deterministic yearly projection (pure) ──────
// NO hard-coded tax numbers: every rate/limit comes from the TaxRules data.
//
// Each scenario invests the same gross yearly contribution. Yearly order:
// contribution at the START of the year, then growth (1 + gross − fee).
//  • Taxable: initial capital lives here. End tax = gains rate × max(0, value−basis).
//  • IKE scenario: wrapper contributions capped at the IKE limit when
//    capToLimit is on (limit scaled by inflation — documented simplification);
//    the excess flows into a side taxable account inside the same scenario.
//    Qualified → no tax. Early → gains taxed like a taxable account.
//  • IKZE scenario: like IKE, plus each contribution earns a refund =
//    marginalRate × contribution at contribution time (simplification).
//    Refunds are reinvested into the side taxable account, or held as cash.
//    Qualified payout tax = payout rate × wrapper value; early payout is
//    taxed at the marginal rate (simplification).
// Liquidation value = what you would net if you exited that year.

import type { ParamSchema } from '../../core/types';
import type { TaxRules } from './rules/types';

export interface UiParams {
  initialCapital: number;
  yearlyContribution: number;
  years: number;
  grossReturn: number; // % nominal
  feePct: number; // % per year
  inflation: number; // % per year
  marginalRate: string; // select label, e.g. '12%'
  capToLimit: boolean;
  reinvestRefund: boolean;
  qualified: boolean;
}

export const defaultParams: UiParams = {
  initialCapital: 20000,
  yearlyContribution: 12000,
  years: 25,
  grossReturn: 7,
  feePct: 0.5,
  inflation: 2.5,
  marginalRate: '12%',
  capToLimit: true,
  reinvestRefund: true,
  qualified: true,
};

export function paramSchemaFor(rules: TaxRules): ParamSchema<UiParams> {
  return {
    initialCapital: { kind: 'number', label: 'Initial capital (taxable only)', min: 0, step: 1000, hint: 'Starts in the taxable account so the comparison stays fair' },
    yearlyContribution: { kind: 'number', label: 'Yearly contribution (gross)', min: 0, step: 500, hint: 'Same gross amount in every scenario' },
    years: { kind: 'range', label: 'Horizon', min: 1, max: 45, step: 1, unit: 'yrs' },
    grossReturn: { kind: 'range', label: 'Gross return', min: -5, max: 15, step: 0.25, unit: '%/yr' },
    feePct: { kind: 'range', label: 'Fees', min: 0, max: 3, step: 0.05, unit: '%/yr' },
    inflation: { kind: 'range', label: 'Inflation', min: 0, max: 10, step: 0.25, unit: '%/yr' },
    marginalRate: {
      kind: 'select', label: 'Marginal income-tax rate (IKZE refund)',
      options: rules.marginalIncomeRates.value.map((r) => `${Math.round(r * 100)}%`),
      hint: `Options from rules “${rules.label}” (as of ${rules.marginalIncomeRates.asOf})`,
    },
    capToLimit: { kind: 'boolean', label: 'Cap at yearly limits', hint: 'Excess flows to a side taxable account; limits grow with inflation' },
    reinvestRefund: { kind: 'boolean', label: 'Reinvest IKZE refund', hint: 'Into the side taxable account; otherwise held as cash' },
    qualified: { kind: 'boolean', label: 'Qualified payout (age reached)', hint: `IKE ${rules.qualifiedAge.ike.value}+ / IKZE ${rules.qualifiedAge.ikze.value}+ per rules as of ${rules.qualifiedAge.ike.asOf}` },
  };
}

export interface ModelParams {
  initialCapital: number;
  yearlyContribution: number;
  years: number;
  grossReturnPct: number;
  feePct: number;
  inflationPct: number;
  marginalRate: number; // fraction
  capToLimit: boolean;
  reinvestRefund: boolean;
  qualified: boolean;
}

export function toModelParams(ui: UiParams): ModelParams {
  return {
    initialCapital: ui.initialCapital,
    yearlyContribution: ui.yearlyContribution,
    years: ui.years,
    grossReturnPct: ui.grossReturn,
    feePct: ui.feePct,
    inflationPct: ui.inflation,
    marginalRate: Number(String(ui.marginalRate).replace('%', '')) / 100 || 0,
    capToLimit: ui.capToLimit,
    reinvestRefund: ui.reinvestRefund,
    qualified: ui.qualified,
  };
}

export type AccountKey = 'taxable' | 'ike' | 'ikze';

export interface AccountResult {
  key: AccountKey;
  label: string;
  liquidation: number[]; // index = year (0..years), nominal net-if-exited
  finalNominal: number;
  finalReal: number;
  taxPaid: number;
  refunds: number;
  deltaVsTaxable: number;
  deltaPct: number;
}

export interface TaxResult {
  years: number[];
  accounts: Record<AccountKey, AccountResult>;
  rulesLabel: string;
}

interface Ledger {
  value: number;
  basis: number;
}

export function project(p: ModelParams, rules: TaxRules): TaxResult {
  const growth = 1 + (p.grossReturnPct - p.feePct) / 100;
  const cg = rules.capitalGainsRate.value;

  function runScenario(kind: AccountKey): AccountResult {
    const main: Ledger = { value: kind === 'taxable' ? p.initialCapital : 0, basis: kind === 'taxable' ? p.initialCapital : 0 };
    const side: Ledger = { value: 0, basis: 0 }; // taxable side account (excess + reinvested refunds)
    let refundsCash = 0;
    let refundsTotal = 0;
    const liquidation: number[] = [];

    const snapshot = (): { net: number; tax: number } => {
      const sideTax = cg * Math.max(0, side.value - side.basis);
      const sideNet = side.value - sideTax;
      if (kind === 'taxable') {
        const tax = cg * Math.max(0, main.value - main.basis);
        return { net: main.value - tax, tax };
      }
      if (kind === 'ike') {
        const tax = p.qualified ? 0 : cg * Math.max(0, main.value - main.basis);
        return { net: main.value - tax + sideNet, tax: tax + sideTax };
      }
      const payoutRate = p.qualified ? rules.ikzePayoutRate.value : p.marginalRate;
      const tax = payoutRate * main.value;
      return { net: main.value - tax + sideNet + (p.reinvestRefund ? 0 : refundsCash), tax: tax + sideTax };
    };

    liquidation.push(snapshot().net);
    for (let year = 1; year <= p.years; year++) {
      const limitScale = (1 + p.inflationPct / 100) ** (year - 1);
      let toMain = p.yearlyContribution;
      let toSide = 0;
      if (kind !== 'taxable' && p.capToLimit) {
        const limit = (kind === 'ike' ? rules.ikeYearlyLimit.value : rules.ikzeYearlyLimit.value) * limitScale;
        toMain = Math.min(p.yearlyContribution, limit);
        toSide = p.yearlyContribution - toMain;
      }
      // contributions at the START of the year
      main.value += toMain; main.basis += toMain;
      side.value += toSide; side.basis += toSide;
      if (kind === 'ikze') {
        const refund = p.marginalRate * toMain;
        refundsTotal += refund;
        if (p.reinvestRefund) { side.value += refund; side.basis += refund; }
        else refundsCash += refund;
      }
      // then growth
      main.value *= growth;
      side.value *= growth;
      liquidation.push(snapshot().net);
    }

    const end = snapshot();
    const real = end.net / (1 + p.inflationPct / 100) ** p.years;
    return {
      key: kind,
      label: kind === 'taxable' ? 'Taxable' : kind === 'ike' ? 'IKE' : 'IKZE',
      liquidation,
      finalNominal: end.net,
      finalReal: real,
      taxPaid: end.tax,
      refunds: kind === 'ikze' ? refundsTotal : 0,
      deltaVsTaxable: 0,
      deltaPct: 0,
    };
  }

  const taxable = runScenario('taxable');
  const ike = runScenario('ike');
  const ikze = runScenario('ikze');
  for (const a of [ike, ikze]) {
    a.deltaVsTaxable = a.finalNominal - taxable.finalNominal;
    a.deltaPct = taxable.finalNominal !== 0 ? a.deltaVsTaxable / Math.abs(taxable.finalNominal) : 0;
  }
  return {
    years: Array.from({ length: p.years + 1 }, (_, i) => i),
    accounts: { taxable, ike, ikze },
    rulesLabel: rules.label,
  };
}
