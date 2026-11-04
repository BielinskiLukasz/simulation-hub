// ─── JVM GC · compare.ts — same seed/workload, every collector, headless ───

import type { ThemeName } from '../../core/types';
import { runHeadless } from '../../core/des/headless';
import { gcSim, type Params } from './logic';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function pct(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

export function mountCompare(host: HTMLElement, ctx: { params: Params; seed: number; theme: ThemeName }): { dispose(): void } {
  host.innerHTML = '';
  const wrap = el('div', 'space-y-4');
  wrap.append(el('p', 'text-[13px] leading-relaxed text-slate-500 dark:text-slate-400',
    'Each collector runs headlessly for 30 sim-seconds on the workload and seed from the Controls tab. Same allocations, same lifetimes — only the collector changes.'));
  const tableHost = el('div', '');
  wrap.append(tableHost);
  host.append(wrap);

  const variants: { label: string; params: Params }[] = [
    { label: 'Mark-sweep', params: { ...ctx.params, collector: 'mark-sweep', compact: false } },
    { label: 'Mark-compact', params: { ...ctx.params, collector: 'mark-sweep', compact: true } },
    { label: 'Generational', params: { ...ctx.params, collector: 'generational' } },
  ];

  const rows = variants.map((v) => {
    const r = runHeadless(gcSim, v.params, ctx.seed, { untilTime: 30_000_000, maxEvents: 100000 });
    const h = r.state.heap;
    const durs = [...h.stats.pauseDurs].sort((a, b) => a - b);
    const elapsed = Math.max(h.nowUs, 1);
    return {
      label: v.label,
      throughput: 1 - h.stats.totalPauseUs / elapsed,
      avgMs: durs.length ? durs.reduce((a, d) => a + d, 0) / durs.length / 1000 : 0,
      p99Ms: pct(durs, 0.99) / 1000,
      maxMs: (durs[durs.length - 1] ?? 0) / 1000,
      count: durs.length,
      oom: h.oom,
    };
  });

  const bestT = Math.max(...rows.map((r) => r.throughput));
  const bestP = Math.min(...rows.map((r) => r.p99Ms));
  const cell = (v: string, best: boolean) => `<td class="px-3 py-2 font-mono ${best ? 'font-black text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}">${v}</td>`;
  tableHost.innerHTML = `
    <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
    <table class="w-full text-left text-[13px]">
      <thead><tr class="bg-slate-900/[.04] dark:bg-white/[.05]">
        ${['Collector', 'Throughput', 'Avg pause', 'p99 pause', 'Max pause', 'GCs', 'OOM?'].map((h) => `<th class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr class="border-t border-slate-100 dark:border-white/[.06]">
            <td class="px-3 py-2 font-bold text-slate-700 dark:text-slate-100">${r.label}</td>
            ${cell(`${(r.throughput * 100).toFixed(1)}%`, r.throughput === bestT)}
            ${cell(`${r.avgMs.toFixed(1)} ms`, false)}
            ${cell(`${r.p99Ms.toFixed(1)} ms`, r.p99Ms === bestP)}
            ${cell(`${r.maxMs.toFixed(1)} ms`, false)}
            ${cell(String(r.count), false)}
            ${cell(r.oom ? 'YES' : 'no', false)}
          </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Model milliseconds (cost model in constants.ts), 30 sim-seconds each, seed ${ctx.seed}.</p>`;

  return { dispose() { host.innerHTML = ''; } };
}
