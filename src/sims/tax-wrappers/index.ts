import type { BatchSimulation } from '../../core/types';
import type { JobDefinition } from '../../core/job';
import { meta } from './meta';
import { defaultParams, paramSchemaFor, project, toModelParams, type TaxResult, type UiParams } from './model';
import { plRules } from './rules/pl';
import { mountResult } from './view';

// Inline batch job (microseconds — no workers needed): proves the batch
// shell works without a worker pool too.
const job: JobDefinition<UiParams, { ui: UiParams }, TaxResult, TaxResult> = {
  plan: (ui) => [{ ui }],
  process: (chunk) => project(toModelParams(chunk.ui), plRules),
  reduce: (parts) => parts[0]!,
};

const sim: BatchSimulation<UiParams, TaxResult> = {
  kind: 'batch',
  meta,
  defaultParams,
  paramSchema: paramSchemaFor(plRules),
  job,
  mountResult,
  about: {
    summary:
      'A deterministic, year-by-year comparison of three Polish retirement accounts investing the same gross contribution: a taxable account (19% on gains at exit), IKE (no tax when qualified), and IKZE (refund at your marginal rate now, 10% on the whole qualified payout later). Contributions land at the start of each year, then growth applies. Every legal number comes from a rules file with a source and as-of date — the model itself contains no tax constants.',
    bullets: [
      'Every figure in the table can be reproduced by hand from the displayed inputs and rules — the tests do exactly that for five scenarios (fixture rules: 20% gains, 10% payout).',
      'Over the yearly limit? The excess flows into a side taxable account inside the same scenario, so scenarios always invest the same gross amount.',
      'IKZE refunds arrive “at contribution time” here (in reality, later) and can be reinvested into the side taxable account.',
      'This is a projection with a constant return — it isolates the tax effect. For return uncertainty, use the Monte Carlo sim.',
      'Educational only, not tax advice: limits and rates are dated, change yearly, and must be re-verified against official sources.',
    ],
    invariant: 'With fixture rules, one year of 1,000 at 10% gives taxable 1,080, IKE 1,100, IKZE 1,090 — asserted exactly in model.test.ts.',
  },
};

export default sim;
