// ─── Monte Carlo π · view.ts — KPIs + convergence fan ──────────────────────

import type { BatchViewContext, ResultView } from '../../core/types';
import { chartColors, createChart, type ChartHandle } from '../../ui/chart';
import type { Params, PiResult } from './job';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const CARD = 'rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-white/[.04]';
const LABEL = 'text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500';
const VALUE = 'mt-1 font-mono text-[22px] leading-none font-black text-slate-800 dark:text-white';

export function mountResult(host: HTMLElement, ctx: BatchViewContext): ResultView<Params, PiResult> {
  const colors = chartColors(ctx.theme);
  host.innerHTML = '';
  const wrap = el('div', 'space-y-4');

  const kpis = el('div', 'grid grid-cols-2 gap-3 xl:grid-cols-4');
  const makeKpi = (label: string, hint: string, accent = false) => {
    const card = el('div', CARD);
    card.append(el('div', LABEL, label));
    const v = el('div', accent ? `${VALUE} !text-sky-600 dark:!text-sky-400` : VALUE, '—');
    card.append(v, el('div', 'mt-1.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500', hint));
    kpis.append(card);
    return v;
  };
  const estV = makeKpi('π estimate', '4 × inside / total', true);
  const errV = makeKpi('Absolute error', 'vs the true π');
  const digV = makeKpi('Correct digits', '−log₁₀ of the error, floored');
  const ptsV = makeKpi('Points inside', 'of total thrown');

  const chartCard = el('section', CARD + ' !p-4');
  chartCard.append(el('h3', 'text-[13px] font-bold text-slate-700 dark:text-slate-100', 'Convergence: running estimate with 95% confidence band'));
  const chartHost = el('div', 'mt-2 h-[280px] w-full');
  chartCard.append(chartHost);

  const explainer = el('section', CARD + ' !p-4 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300');
  explainer.innerHTML =
    '<h3 class="mb-1.5 text-[13px] font-bold text-slate-700 dark:text-slate-100">Why this works — and why it is slow</h3>' +
    '<p>A point thrown uniformly into a unit square lands in the quarter circle with probability π/4, so 4 × (inside ÷ total) estimates π. ' +
    'The catch is convergence: the error shrinks like <b>1/√N</b> — one more correct digit costs 100× the points. ' +
    'Monte Carlo is therefore a terrible way to compute π, but an honest template for problems with no closed form (like the portfolio simulator): ' +
    'seeded chunks, a running estimate, and a confidence band that tells you how much to trust it.</p>';

  const footer = el('p', 'font-mono text-[11px] text-slate-400 dark:text-slate-500');
  wrap.append(kpis, chartCard, explainer, footer);
  host.append(wrap);

  let chart: ChartHandle | null = null;
  let disposed = false;

  return {
    update(result, _params, metaInfo) {
      if (disposed) return;
      estV.textContent = result.estimate.toFixed(8);
      errV.textContent = result.absError.toExponential(2);
      digV.textContent = String(result.correctDigits);
      ptsV.textContent = `${result.inside.toLocaleString('en-US')} / ${result.totalPoints.toLocaleString('en-US')}`;
      footer.textContent = `${result.totalPoints.toLocaleString('en-US')} points · ${metaInfo.ms.toFixed(0)} ms · 95% CI [${result.ciLo.toFixed(5)}, ${result.ciHi.toFixed(5)}] · true π = ${Math.PI.toFixed(8)}`;

      chart ??= createChart(chartHost, { theme: ctx.theme, yFormat: (v) => v.toFixed(3), xLabel: 'points thrown (cumulative)' });
      chart.setData({
        kind: 'bands',
        x: result.convergence.points,
        bands: [{ label: '95% CI', lo: result.convergence.lo, hi: result.convergence.hi, color: colors.bandInner }],
        lines: [
          { label: 'estimate', color: colors.line1, data: result.convergence.est, width: 2.2 },
          { label: 'true π', color: ctx.theme === 'dark' ? '#f8fafc' : '#0f172a', data: result.convergence.points.map(() => Math.PI), dashed: true, width: 1.4 },
        ],
      });
      wrap.style.opacity = '1';
    },
    setBusy(busy) { wrap.style.opacity = busy ? '0.55' : '1'; },
    dispose() { disposed = true; chart?.dispose(); host.innerHTML = ''; },
  };
}
