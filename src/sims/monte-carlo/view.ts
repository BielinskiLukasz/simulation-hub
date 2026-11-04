// ─── Monte Carlo · view.ts — ResultView (DOM, charts lazily created) ────────
// KPI row, fan chart, final-balance histogram, depletion-by-year line, and a
// "what am I looking at?" explainer. Busy state dims results and shows
// progress while the last good result stays visible.

import type { BatchViewContext, ResultView } from '../../core/types';
import { chartColors, createChart, type ChartHandle } from '../../ui/chart';
import { formatCompact, formatMoney, formatPct } from '../../ui/format';
import type { McResult } from './job';
import type { Params } from './model';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const CARD = 'rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-white/[.04]';
const LABEL = 'text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500';
const VALUE = 'mt-1 font-mono text-[22px] leading-none font-black text-slate-800 dark:text-white';

export function mountResult(host: HTMLElement, ctx: BatchViewContext): ResultView<Params, McResult> {
  const dark = ctx.theme === 'dark';
  const colors = chartColors(ctx.theme);
  host.innerHTML = '';

  const wrap = el('div', 'space-y-4');
  const busyBar = el('div', 'h-2 overflow-hidden rounded-full bg-slate-900/[.08] opacity-0 transition-opacity dark:bg-white/10');
  const busyFill = el('div', 'h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500 transition-[width] duration-150');
  busyFill.style.width = '0%';
  busyBar.append(busyFill);

  const kpis = el('div', 'grid grid-cols-2 gap-3 xl:grid-cols-4');
  const makeKpi = (label: string, hint: string, accent = false) => {
    const card = el('div', CARD);
    card.append(el('div', LABEL, label));
    const v = el('div', accent ? `${VALUE} !text-emerald-600 dark:!text-emerald-400` : VALUE, '—');
    card.append(v, el('div', 'mt-1.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500', hint));
    kpis.append(card);
    return v;
  };
  const successV = makeKpi('Success probability', 'Balance > 0 at horizon (or ≥ target)', true);
  const medianV = makeKpi('Median final', 'Half of runs end above this');
  const p10V = makeKpi('P10 final · bad case', 'Only 10% of runs do worse');
  const p90V = makeKpi('P90 final · good case', 'Only 10% of runs do better');

  const fanCard = el('section', CARD + ' !p-4');
  fanCard.append(el('h3', 'text-[13px] font-bold text-slate-700 dark:text-slate-100', 'Balance percentiles over time (today’s money)'));
  const fanHost = el('div', 'mt-2 h-[270px] w-full');
  fanCard.append(fanHost);

  const grid = el('div', 'grid gap-4 lg:grid-cols-2');
  const histCard = el('section', CARD + ' !p-4');
  histCard.append(el('h3', 'text-[13px] font-bold text-slate-700 dark:text-slate-100', 'Final balance distribution'));
  const histHost = el('div', 'mt-2 h-[190px] w-full');
  const histNote = el('p', 'mt-1 text-[11px] text-slate-400 dark:text-slate-500');
  histCard.append(histHost, histNote);
  const depCard = el('section', CARD + ' !p-4');
  depCard.append(el('h3', 'text-[13px] font-bold text-slate-700 dark:text-slate-100', 'Probability of depletion by year'));
  const depHost = el('div', 'mt-2 h-[190px] w-full');
  depCard.append(depHost);
  grid.append(histCard, depCard);

  const explainer = el('section', CARD + ' !p-4 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300');
  explainer.innerHTML =
    '<h3 class="mb-1.5 text-[13px] font-bold text-slate-700 dark:text-slate-100">What am I looking at?</h3>' +
    '<p>Each run is one possible future: monthly real returns drawn from a log-normal distribution, contributions first, then withdrawals. ' +
    'The <b>fan</b> is not a prediction — the dark band is the middle 50% of futures, the light band the middle 80%. It widens because uncertainty compounds. ' +
    'Judge plans by the <b>median and P10</b>, not the average: a few spectacular futures pull the mean up. ' +
    '<b>Sequence-of-returns risk</b> is why withdrawals are dangerous early: the same average return in a different order can deplete a portfolio that “should” have lasted.</p>';
  const footer = el('p', 'font-mono text-[11px] text-slate-400 dark:text-slate-500');

  wrap.append(busyBar, kpis, fanCard, grid, explainer, footer);
  host.append(wrap);

  let fan: ChartHandle | null = null;
  let hist: ChartHandle | null = null;
  let dep: ChartHandle | null = null;
  let disposed = false;

  return {
    update(result, params, metaInfo) {
      if (disposed) return;
      successV.textContent = formatPct(result.successProb, 1);
      medianV.textContent = formatMoney(result.medianFinal);
      p10V.textContent = formatMoney(result.p10Final);
      p90V.textContent = formatMoney(result.p90Final);
      footer.textContent =
        `${result.runsTotal.toLocaleString('en-US')} runs · ${metaInfo.ms.toFixed(0)} ms · ` +
        `${metaInfo.ms > 0 ? Math.round(result.runsTotal / (metaInfo.ms / 1000)).toLocaleString('en-US') : '∞'} runs/s · success = ` +
        (params.withdrawYears > 0 ? 'balance > 0 at end of withdrawals' : `final ≥ target ${formatMoney(params.targetBalance)}`);

      fan ??= createChart(fanHost, { theme: ctx.theme, yFormat: formatCompact, xLabel: 'years' });
      fan.setData({
        kind: 'bands',
        x: result.years,
        bands: [
          { label: 'p10–p90', lo: result.percentiles.p10, hi: result.percentiles.p90, color: colors.bandOuter },
          { label: 'p25–p75', lo: result.percentiles.p25, hi: result.percentiles.p75, color: colors.bandInner },
        ],
        lines: [{ label: 'median', color: colors.p50, data: result.percentiles.p50, width: 2.4 }],
        vline: params.withdrawYears > 0 ? { x: params.accumYears, label: 'withdrawals start' } : undefined,
      });

      hist ??= createChart(histHost, { theme: ctx.theme, yFormat: (v) => String(Math.round(v)), xLabel: 'final balance (top 1% clipped)' });
      hist.setData({
        kind: 'histogram',
        bins: result.histogram.bins,
        color: colors.hist,
        marker: { x: result.medianFinal, label: `median ${formatCompact(result.medianFinal)}` },
      });
      histNote.textContent = `Top clipped at p99 = ${formatMoney(result.histogram.clippedAt)}; the median marker shows where half the runs land.`;

      const hasDep = result.depletionByYear.length > 0;
      depCard.style.display = hasDep ? '' : 'none';
      if (hasDep) {
        dep ??= createChart(depHost, { theme: ctx.theme, yFormat: (v) => formatPct(v, 0), xLabel: 'year' });
        dep.setData({
          kind: 'lines',
          x: result.depletionByYear.map((d) => d.year),
          series: [{ label: 'depleted', color: dark ? '#fb7185' : '#e11d48', data: result.depletionByYear.map((d) => d.prob) }],
          yZero: true,
        });
      }
      wrap.style.opacity = '1';
    },
    setBusy(busy, progress) {
      busyBar.style.opacity = busy ? '1' : '0';
      if (progress !== undefined) busyFill.style.width = `${Math.round(progress * 100)}%`;
      wrap.style.opacity = busy ? '0.55' : '1';
    },
    dispose() {
      disposed = true;
      fan?.dispose(); hist?.dispose(); dep?.dispose();
      host.innerHTML = '';
    },
  };
}
