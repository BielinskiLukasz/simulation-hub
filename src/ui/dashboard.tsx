// ─── ui/dashboard.tsx — multi-chart metrics dashboard (cursors, CSV, gaps) ─

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import type { ChartSpec, MetricsSpec, RecorderView } from '../core/types';
import { chartColors, createChart, type ChartHandle } from './chart';
import type { ThemeName } from '../core/types';

function downsample(times: ArrayLike<number>, ys: ArrayLike<number>, max = 4000): { x: number[]; y: number[] } {
  const n = Math.min(times.length, ys.length);
  if (n <= max) {
    const x: number[] = []; const y: number[] = [];
    for (let i = 0; i < n; i++) { x.push(times[i]!); y.push(ys[i]!); }
    return { x, y };
  }
  const bucket = Math.ceil(n / (max / 2));
  const x: number[] = []; const y: number[] = [];
  for (let start = 0; start < n; start += bucket) {
    let minI = start; let maxI = start;
    for (let i = start; i < Math.min(n, start + bucket); i++) {
      if (ys[i]! < ys[minI]!) minI = i;
      if (ys[i]! > ys[maxI]!) maxI = i;
    }
    const a = Math.min(minI, maxI); const b = Math.max(minI, maxI);
    x.push(times[a]!); y.push(ys[a]!); x.push(times[b]!); y.push(ys[b]!);
  }
  return { x, y };
}

function ChartCard({ spec, rec, theme, x: xOverride }: { spec: ChartSpec; rec: RecorderView; theme: ThemeName; x?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartHandle | null>(null);
  const [hidden, setHidden] = useState(!!spec.hideByDefault);
  const [logy, setLogy] = useState(!!spec.yLog);
  const colors = chartColors(theme);

  useEffect(() => {
    if (hidden || !host.current) return;
    const chart = createChart(host.current, { theme, yFormat: (v) => (Math.abs(v) >= 1000 ? v.toExponential(1) : String(Math.round(v * 100) / 100)), xLabel: spec.kind === 'xy' ? undefined : 'time' });
    chartRef.current = chart;
    const colorsList = [colors.line1, colors.line2, colors.line3, colors.p50, '#f472b6', '#22d3ee'];
    const series = spec.series.map((id, i) => {
      const raw = downsample(rec.times, rec.col(id));
      if (!logy) return { label: id, color: colorsList[i % colorsList.length]!, data: raw.y };
      // log-y: drop non-positive values as gaps (NaN would break the canvas path)
      return { label: `${id} (log)`, color: colorsList[i % colorsList.length]!, data: raw.y.map((v) => (v > 0 ? Math.log10(v) : NaN)) };
    });
    if (spec.kind === 'xy' && spec.x) {
      const xs = downsample(rec.times, rec.col(spec.x));
      chart.setData({ kind: 'lines', x: xs.y.map((v) => (logy ? (v > 0 ? Math.log10(v) : 0) : v)), series });
    } else {
      chart.setData({ kind: 'lines', x: downsample(rec.times, rec.times).x, series });
    }
    return () => { chart.dispose(); chartRef.current = null; };
  }, [hidden, theme, logy, rec.length, spec, colors.line1, colors.line2, colors.line3, colors.p50]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <header className="mb-1.5 flex items-center gap-2">
        <h4 className="text-[12px] font-bold text-slate-700 dark:text-slate-100">{spec.title}</h4>
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => setLogy((v) => !v)} className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${logy ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-400'}`}>log</button>
          <button onClick={() => setHidden((v) => !v)} aria-label={hidden ? 'Show chart' : 'Hide chart'} className="text-slate-400">{hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
        </span>
      </header>
      {hidden
        ? <p className="py-3 text-[11px] text-slate-400">Chart hidden.</p>
        : <div ref={host} className="w-full" style={{ height: spec.height ?? 150 }} />}
      <p className="mt-1 font-mono text-[10px] text-slate-400">{spec.series.join(' · ')}{xOverride ? ` · x=${xOverride}` : ''}{logy ? ' · log₁₀ y' : ''}</p>
    </section>
  );
}

export function Dashboard({ spec, rec, theme, now }: { spec: MetricsSpec<any, any> | undefined; rec: RecorderView | null; theme: ThemeName; now?: number }) {
  const [showAll, setShowAll] = useState(false);
  const charts = useMemo(() => (spec?.charts ?? []).filter((c) => showAll || !c.hideByDefault), [spec, showAll]);
  if (!spec || !rec) return null;
  const csv = () => {
    const lines = [`time,${spec.metrics.map((m) => m.id).join(',')}`];
    for (let i = 0; i < rec.length; i++) {
      const row = [String(rec.times[i])];
      for (const m of spec.metrics) { const v = rec.col(m.id)[i]; row.push(Number.isNaN(v) ? '' : String(v)); }
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'metrics.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const latest = spec.metrics.slice(0, 6).map((m) => ({ m, v: rec.col(m.id)[rec.length - 1] }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-slate-400">{rec.length} samples · every {JSON.stringify(spec.every)}</span>
        {now !== undefined && <span className="font-mono text-[10px] text-slate-400">· now {now.toFixed(2)}</span>}
        {(spec.charts.some((c) => c.hideByDefault)) && <button onClick={() => setShowAll((v) => !v)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:border-white/15 dark:text-slate-300">{showAll ? 'Fewer charts' : 'All charts'}</button>}
        <button onClick={csv} className="ml-auto inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:border-white/15 dark:text-slate-300"><Download className="h-3 w-3" /> CSV</button>
      </div>
      <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
        {latest.map(({ m, v }) => (
          <span key={m.id} className="rounded bg-slate-900/[.04] px-1.5 py-0.5 dark:bg-white/[.06]">
            {m.label} <b className="text-slate-700 dark:text-slate-100">{Number.isFinite(v) ? (m.fmt === 'pct' ? `${(v! * 100).toFixed(1)}%` : Math.abs(v!) >= 100 ? Math.round(v!) : Math.round(v! * 100) / 100) : '—'}</b>
          </span>
        ))}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {charts.map((c) => <ChartCard key={c.id} spec={c} rec={rec} theme={theme} />)}
      </div>
    </div>
  );
}
