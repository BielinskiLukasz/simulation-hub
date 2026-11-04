// ─── CPU Scheduler · compare.ts — same workload, every algorithm, headless ─

import type { ThemeName } from '../../core/types';
import { runHeadless } from '../../core/des/headless';
import { computeMetrics } from './algorithms';
import { deriveTimeline, schedulerSim, type Params } from './logic';
import { mountTimeline, type TimelineHandle } from '../../ui/timeline';

const ALGOS = ['fcfs', 'sjf', 'rr', 'priority', 'srtf'] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountCompare(host: HTMLElement, ctx: { params: Params; seed: number; theme: ThemeName }): { dispose(): void } {
  host.innerHTML = '';
  const wrap = el('div', 'space-y-4');
  const intro = el('p', 'text-[13px] leading-relaxed text-slate-500 dark:text-slate-400',
    'Every algorithm below runs headlessly (runHeadless) on the exact workload from the Controls tab — same arrivals, same seed. Gantt charts share one time axis; best value per column is highlighted.');
  const tableHost = el('div', '');
  const gantts = el('div', 'space-y-3');
  wrap.append(intro, tableHost, gantts);
  host.append(wrap);

  const handles: TimelineHandle[] = [];
  let disposed = false;

  const results = ALGOS.map((algo) => {
    const params: Params = { ...ctx.params, algorithm: algo };
    const sim = { ...schedulerSim };
    const r = runHeadless(sim, params, ctx.seed, { maxEvents: 200000 });
    const metrics = computeMetrics(r.state.procs, r.state.slices, r.state.switches);
    return { algo, metrics, state: r.state, now: r.now };
  });
  if (disposed) return { dispose: () => undefined };

  const best = {
    wait: Math.min(...results.map((r) => r.metrics.avgWaiting)),
    ta: Math.min(...results.map((r) => r.metrics.avgTurnaround)),
    resp: Math.min(...results.map((r) => r.metrics.avgResponse)),
    util: Math.max(...results.map((r) => r.metrics.utilization)),
  };
  const cell = (v: string, isBest: boolean) =>
    `<td class="px-3 py-2 font-mono ${isBest ? 'font-black text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}">${v}</td>`;
  tableHost.innerHTML = `
    <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
    <table class="w-full text-left text-[13px]">
      <thead><tr class="bg-slate-900/[.04] dark:bg-white/[.05]">
        ${['Algorithm', 'Avg wait', 'Avg turnaround', 'Avg response', 'Utilisation', 'Switches', 'Makespan'].map((h) => `<th class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${results.map((r) => `
          <tr class="border-t border-slate-100 dark:border-white/[.06]">
            <td class="px-3 py-2 font-bold text-slate-700 dark:text-slate-100">${r.algo.toUpperCase()}</td>
            ${cell(r.metrics.avgWaiting.toFixed(2), r.metrics.avgWaiting === best.wait)}
            ${cell(r.metrics.avgTurnaround.toFixed(2), r.metrics.avgTurnaround === best.ta)}
            ${cell(r.metrics.avgResponse.toFixed(2), r.metrics.avgResponse === best.resp)}
            ${cell(`${(r.metrics.utilization * 100).toFixed(0)}%`, r.metrics.utilization === best.util)}
            ${cell(String(r.metrics.switches), false)}
            ${cell(String(r.metrics.makespan), false)}
          </tr>`).join('')}
      </tbody>
    </table></div>`;

  const domain: [number, number] = [0, Math.max(1, ...results.map((r) => r.metrics.makespan))];
  for (const r of results) {
    const card = el('div', 'rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[.04]');
    card.append(el('div', 'mb-1 font-mono text-[12px] font-bold text-slate-600 dark:text-slate-200',
      `${r.algo.toUpperCase()} · avg wait ${r.metrics.avgWaiting.toFixed(2)}`));
    const chartHost = el('div', 'h-[86px] w-full');
    card.append(chartHost);
    gantts.append(card);
    const handle = mountTimeline(chartHost, { theme: ctx.theme, interactive: false, domain });
    handle.setData(deriveTimeline([], r.now, r.state), r.now);
    handles.push(handle);
  }

  return {
    dispose() {
      disposed = true;
      handles.forEach((h) => h.dispose());
      host.innerHTML = '';
    },
  };
}
