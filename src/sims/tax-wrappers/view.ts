// ─── Tax wrappers · view.ts — results table, liquidation chart, rules panel ─

import type { BatchViewContext, ResultView } from '../../core/types';
import { chartColors, createChart, type ChartHandle } from '../../ui/chart';
import { formatCompact, formatMoney } from '../../ui/format';
import { project, toModelParams, type TaxResult, type UiParams } from './model';
import { plRules } from './rules/pl';
import type { Sourced } from './rules/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const CARD = 'rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-white/[.04]';

export function mountResult(host: HTMLElement, ctx: BatchViewContext): ResultView<UiParams, TaxResult> {
  const colors = chartColors(ctx.theme);
  host.innerHTML = '';
  const wrap = el('div', 'space-y-4');

  const disclaimer = el('div', 'rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200');
  disclaimer.innerHTML = `<b>Educational simulation — not tax advice.</b> Rules below are as of their “as of” dates and change yearly; verify against official sources (gov.pl / your provider) before acting.`;

  const tableCard = el('section', CARD + ' !p-0 overflow-hidden');
  const tableHost = el('div', '');
  tableCard.append(tableHost);

  const chartCard = el('section', CARD + ' !p-4');
  const head = el('div', 'flex flex-wrap items-center gap-2');
  head.append(el('h3', 'text-[13px] font-bold text-slate-700 dark:text-slate-100', 'Liquidation value over time (net if you exited that year)'));
  const toggle = el('div', 'ml-auto flex rounded-lg bg-slate-900/[.05] p-0.5 dark:bg-white/[.07]');
  let realTerms = true;
  const mkBtn = (label: string, value: boolean) => {
    const b = el('button', 'rounded-md px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:text-slate-400', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(realTerms === value));
    b.addEventListener('click', () => { realTerms = value; refreshButtons(); drawChart(); });
    return b;
  };
  const btnReal = mkBtn('Real (today’s money)', true);
  const btnNom = mkBtn('Nominal', false);
  const refreshButtons = () => {
    for (const [b, v] of [[btnReal, true], [btnNom, false]] as const) {
      b.setAttribute('aria-pressed', String(realTerms === v));
      b.className = `rounded-md px-2.5 py-1 text-[11px] font-bold ${realTerms === v ? 'bg-white text-slate-900 shadow dark:bg-slate-100' : 'text-slate-500 dark:text-slate-400'}`;
    }
  };
  toggle.append(btnReal, btnNom);
  head.append(toggle);
  const chartHost = el('div', 'mt-2 h-[260px] w-full');
  chartCard.append(head, chartHost);

  const rulesCard = el('section', CARD + ' !p-4');
  rulesCard.append(el('h3', 'text-[13px] font-bold text-slate-700 dark:text-slate-100', `Active rules — ${plRules.label}`));
  const rulesList = el('div', 'mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400');
  const row = (label: string, s: Sourced<unknown>, fmt: (v: never) => string) => {
    const d = el('div', '');
    d.innerHTML = `<span class="font-semibold text-slate-700 dark:text-slate-200">${label}:</span> <span class="font-mono">${fmt(s.value as never)}</span> <span class="text-slate-400">· as of ${s.asOf} · ${s.source}</span>`;
    return d;
  };
  rulesList.append(
    row('Capital gains (taxable)', plRules.capitalGainsRate, (v: number) => `${v * 100}%`),
    row('IKZE qualified payout', plRules.ikzePayoutRate, (v: number) => `${v * 100}% of payout`),
    row('IKE yearly limit', plRules.ikeYearlyLimit, (v: number) => formatMoney(v)),
    row('IKZE yearly limit', plRules.ikzeYearlyLimit, (v: number) => formatMoney(v)),
    row('Qualified age IKE / IKZE', plRules.qualifiedAge.ike, (v: number) => `${v} / ${plRules.qualifiedAge.ikze.value}`),
    row('Marginal PIT rates', plRules.marginalIncomeRates, (v: number[]) => v.map((r) => `${Math.round(r * 100)}%`).join(', ')),
  );
  const simpl = el('p', 'mt-3 border-t border-slate-100 pt-3 text-[12px] leading-relaxed text-slate-400 dark:border-white/[.07] dark:text-slate-500');
  simpl.textContent =
    'Simplifications: constant return (no sequence risk — see Monte Carlo), IKZE refund received at contribution time, flat payout rates (no brackets), limits scaled by inflation, no dividend drag inside the taxable account, excess-over-limit flows to a side taxable account, initial capital starts taxable-only.';
  rulesCard.append(rulesList, simpl);

  wrap.append(disclaimer, tableCard, chartCard, rulesCard);
  host.append(wrap);
  refreshButtons();

  let chart: ChartHandle | null = null;
  let last: { result: TaxResult; params: UiParams } | null = null;
  let disposed = false;

  function drawChart() {
    if (!last || disposed) return;
    const { result, params } = last;
    const mp = toModelParams(params);
    const deflate = (arr: number[]) =>
      realTerms ? arr.map((v, y) => v / (1 + mp.inflationPct / 100) ** y) : arr;
    chart ??= createChart(chartHost, { theme: ctx.theme, yFormat: formatCompact, xLabel: 'years' });
    chart.setData({
      kind: 'lines',
      x: result.years,
      series: [
        { label: 'Taxable', color: ctx.theme === 'dark' ? '#94a3b8' : '#64748b', data: deflate(result.accounts.taxable.liquidation) },
        { label: 'IKE', color: colors.line1, data: deflate(result.accounts.ike.liquidation) },
        { label: 'IKZE', color: colors.line2, data: deflate(result.accounts.ikze.liquidation) },
      ],
    });
  }

  return {
    update(result, params) {
      if (disposed) return;
      last = { result, params };
      const a = result.accounts;
      const sign = (v: number) => `${v >= 0 ? '+' : '−'}${formatMoney(Math.abs(v))}`;
      tableHost.innerHTML = `
        <table class="w-full text-left text-[13px]">
          <thead><tr class="bg-slate-900/[.04] dark:bg-white/[.05]">
            ${['Account', 'Final (nominal)', 'Final (real)', 'Tax paid', 'Refunds', 'Δ vs taxable'].map((h) => `<th class="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">${h}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${(['taxable', 'ike', 'ikze'] as const).map((k) => `
              <tr class="border-t border-slate-100 dark:border-white/[.06]">
                <td class="px-3.5 py-2.5 font-bold text-slate-700 dark:text-slate-100">${a[k].label}</td>
                <td class="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-300">${formatMoney(a[k].finalNominal)}</td>
                <td class="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-300">${formatMoney(a[k].finalReal)}</td>
                <td class="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-300">${formatMoney(a[k].taxPaid)}</td>
                <td class="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-300">${a[k].refunds ? formatMoney(a[k].refunds) : '—'}</td>
                <td class="px-3.5 py-2.5 font-mono ${k === 'taxable' ? 'text-slate-400' : a[k].deltaVsTaxable >= 0 ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-rose-500'}">${k === 'taxable' ? '—' : `${sign(a[k].deltaVsTaxable)} (${(a[k].deltaPct * 100).toFixed(1)}%)`}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      drawChart();
    },
    setBusy(busy) { wrap.style.opacity = busy ? '0.55' : '1'; },
    dispose() { disposed = true; chart?.dispose(); host.innerHTML = ''; },
  };
}

export { project };
