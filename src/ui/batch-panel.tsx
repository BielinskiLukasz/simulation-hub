// ─── ui/batch-panel.tsx — batch runner UI with CIs, paired diffs, CSV ─────
// Runs through the Phase 2 pool with the in-thread transport here (the same
// deterministic job can go through real workers untouched).

import { useRef, useState } from 'react';
import { Copy, Loader2, Play, Square } from 'lucide-react';
import type { BatchSpec } from '../core/types';
import { BATCH_CHUNK, formatBatchMarkdown, planBatch, type BatchResult } from '../core/batch/batch';
import { InlineTransport, WorkerPool } from '../runtime/worker-pool';

export function BatchPanel({ spec, params }: { spec: BatchSpec<any>; params: Record<string, any> }) {
  const [runs, setRuns] = useState(Math.min(spec.defaults.maxRuns, spec.defaults.runs));
  const [seed, setSeed] = useState(42);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>(() => (spec.variants ?? []).map((v) => v.id));
  const abort = useRef<AbortController | null>(null);
  const current = useRef<WorkerPool | null>(null);

  const variants = (spec.variants ?? [{ id: 'base', label: 'base', overrides: {} }]).filter((v) => selectedVariants.includes(v.id));
  const specForRun: BatchSpec<any> = spec.variants ? { ...spec, variants } : spec;

  const run = async () => {
    const n = Math.max(1, Math.min(spec.defaults.maxRuns, Math.floor(runs)));
    const plan = planBatch(specForRun, params, seed, n);
    const pool = new WorkerPool(() => new InlineTransport(), 2);
    current.current = pool;
    abort.current = new AbortController();
    setBusy(true); setError(''); setResult(null); setProgress(0);
    try {
      const res = await pool.run(plan.job, specForRun, seed, {
        signal: abort.current.signal,
        onProgress: (done, total) => setProgress(done / total),
      });
      setResult(res);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') setError('Cancelled — no partial results kept.');
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      pool.dispose();
      current.current = null;
    }
  };

  const stop = () => { abort.current?.abort(); };

  const copyMd = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(formatBatchMarkdown(specForRun, result)).catch(() => undefined);
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-2 text-[12px]">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-slate-400">runs
          <input type="number" min={1} max={spec.defaults.maxRuns} value={runs} onChange={(e) => setRuns(Number(e.target.value))} className="mt-0.5 w-20 rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-[11px] dark:border-white/15 dark:bg-white/[.06]" />
        </label>
        <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-slate-400">base seed
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="mt-0.5 w-24 rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-[11px] dark:border-white/15 dark:bg-white/[.06]" />
        </label>
        {busy
          ? <button onClick={stop} className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1.5 text-[11px] font-bold text-white"><Square className="h-3 w-3" /> Cancel</button>
          : <button onClick={run} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-white"><Play className="h-3 w-3" /> Run batch</button>}
        {busy && <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> {Math.round(progress * 100)}% of {Math.ceil(((variants.length || 1) * (spec.sweep?.values.length ?? 1) * (Math.floor(runs) || 1)) / BATCH_CHUNK)} chunks</span>}
      </div>
      {(spec.variants?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {spec.variants!.map((v) => (
            <label key={v.id} className="inline-flex items-center gap-1 rounded-full bg-slate-900/[.04] px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/[.06] dark:text-slate-300">
              <input type="checkbox" checked={selectedVariants.includes(v.id)} onChange={(e) => setSelectedVariants((prev) => e.target.checked ? [...prev, v.id] : prev.filter((x) => x !== v.id))} /> {v.label}
            </label>
          ))}
          {spec.sweep && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">sweep {spec.sweep.label}: {spec.sweep.values.length} points</span>}
        </div>
      )}
      <p className="font-mono text-[10px] text-slate-400">N = 1 per cell · common random numbers · seeds deriveSeed(base, r) · chunk {BATCH_CHUNK}</p>
      {error && <p className="rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-600 dark:text-rose-300">{error}</p>}
      {result && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-400">
            <span>{result.cells.length} cells · {result.runs} runs/cell · seed {result.baseSeed}</span>
            <button onClick={copyMd} className="ml-auto inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 font-bold text-slate-500 dark:border-white/15 dark:text-slate-300"><Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Markdown'}</button>
          </div>
          <div className="nice-scroll max-h-[360px] overflow-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-left font-mono text-[10.5px]">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                <tr>{['cell', 'metric', 'n', 'mean', '95% CI', 'median', 'p5', 'p95'].map((h) => <th key={h} className="px-2 py-1.5 font-bold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.cells.flatMap((cell) => specForRun.metrics.map((m, i) => {
                  const ci = cell.cis[i]!;
                  const indicatorIndex = specForRun.metrics.filter((mm) => mm.kind === 'indicator').findIndex((mm) => mm.id === m.id);
                  const show = m.kind === 'indicator' && indicatorIndex >= 0 ? cell.indicatorCIs?.[indicatorIndex] : ci;
                  const mean = m.kind === 'indicator' ? `${(ci.estimate * 100).toFixed(1)}%` : ci.estimate.toFixed(3);
                  return (
                    <tr key={`${cell.cell}-${m.id}`} className="border-t border-slate-100 dark:border-white/[.06]">
                      <td className="px-2 py-1 text-slate-500">{cell.label}</td>
                      <td className="px-2 py-1 font-bold text-slate-700 dark:text-slate-200">{m.label}</td>
                      <td className="px-2 py-1">{cell.n}</td>
                      <td className="px-2 py-1">{mean}</td>
                      <td className="px-2 py-1 text-emerald-600 dark:text-emerald-400">[{show?.lo !== undefined && Number.isFinite(show.lo) ? (m.kind === 'indicator' ? `${(show.lo * 100).toFixed(1)}%` : show.lo.toFixed(3)) : '—'}, {show?.hi !== undefined && Number.isFinite(show.hi) ? (m.kind === 'indicator' ? `${(show.hi * 100).toFixed(1)}%` : show.hi.toFixed(3)) : '—'}]</td>
                      <td className="px-2 py-1">{cell.medians[i]!.toFixed(3)}</td>
                      <td className="px-2 py-1">{cell.p5[i]!.toFixed(3)}</td>
                      <td className="px-2 py-1">{cell.p95[i]!.toFixed(3)}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
          {result.paired.length > 0 && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/[.06] p-2">
              <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Paired differences (common random numbers)</div>
              <div className="max-h-32 space-y-0.5 overflow-auto font-mono text-[10px]">
                {result.paired.slice(0, 40).map((p, i) => (
                  <div key={i} className={p.significant ? 'font-bold text-slate-700 dark:text-slate-100' : 'text-slate-400'}>
                    {p.metricId} · {p.baselineId}−{p.variantId}{p.sweepValue !== undefined ? ` @${p.sweepValue}` : ''}: {Number.isFinite(p.diff.estimate) ? p.diff.estimate.toFixed(3) : '—'} [{Number.isFinite(p.diff.lo) ? p.diff.lo.toFixed(3) : '—'}, {Number.isFinite(p.diff.hi) ? p.diff.hi.toFixed(3) : '—'}] {p.significant ? '✓ excludes 0' : '· includes 0'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
