// ─── ui/batch-page.tsx — batch sim shell ────────────────────────────────────
// Load → decode URL → mountResult view → recompute via WorkerPool (real
// workers when the sim provides createWorker, otherwise an in-thread
// transport running the SAME job — identical results by construction).
// Param changes debounce ~200 ms, abort the previous run, update the URL
// immediately. Errors keep the last good result visible. Dispose aborts,
// disposes the pool and the view: nothing leaks on navigation.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Braces, Check, Dices, Hash, Link2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { BatchSimulation, SimEntry, ThemeName } from '../core/types';
import { decodeState, encodeState } from '../core/url-state';
import { buildHash } from '../core/router';
import { InlineTransport, WorkerPool, WorkerTransport } from '../runtime/worker-pool';
import { Controls } from './controls';
import { ProgressBar } from './kpi';

type Tab = 'controls' | 'how' | 'state';

export function BatchPage({ entry, sim, query, theme }: { entry: SimEntry; sim: BatchSimulation<any, any>; query: URLSearchParams; theme: ThemeName }) {
  const [params, setParams] = useState<Record<string, any> | null>(null);
  const [seed, setSeed] = useState(42);
  const [tab, setTab] = useState<Tab>('controls');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [workerNote, setWorkerNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ReturnType<BatchSimulation<any, any>['mountResult']> | null>(null);
  const poolRef = useRef<WorkerPool | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef(0);
  const poolKindRef = useRef<'worker' | 'inline'>(sim.createWorker ? 'worker' : 'inline');
  const lastRef = useRef<{ result: unknown; params: Record<string, any>; ms: number } | null>(null);
  const stateRef = useRef<{ params: Record<string, any>; seed: number }>({ params: {}, seed: 42 });
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const syncUrl = useCallback((p: Record<string, any>, s: number) => {
    history.replaceState(null, '', buildHash(entry.meta.id, encodeState(p, sim.defaultParams, s)));
  }, [entry.meta.id, sim]);

  const recompute = useCallback((p: Record<string, any>, s: number) => {
    const pool = poolRef.current;
    const view = viewRef.current;
    if (!pool || !view) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setProgress(0);
    setError(null);
    view.setBusy(true, 0);
    const t0 = performance.now();
    pool.run(sim.job, p, s, {
      signal: ac.signal,
      onProgress: (done, total) => {
        setProgress(done / total);
        view.setBusy(true, done / total);
      },
    }).then((result) => {
      if (ac.signal.aborted) return;
      const ms = performance.now() - t0;
      lastRef.current = { result, params: p, ms };
      const currentView = viewRef.current ?? view; // theme may have remounted mid-run
      currentView.update(result, p, { ms });
      currentView.setBusy(false);
      setBusy(false);
      const runs = (result as { runsTotal?: number }).runsTotal;
      setStatus(`${runs ? `${runs.toLocaleString('en-US')} runs · ` : ''}${ms.toFixed(0)} ms`);
    }).catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Workers blocked/broken (CSP, old browser): fall back ONCE to the
      // inline transport and retry. Results are identical by construction.
      if (poolKindRef.current === 'worker') {
        poolKindRef.current = 'inline';
        poolRef.current?.dispose();
        poolRef.current = new WorkerPool(() => new InlineTransport(), 1);
        setWorkerNote('Web Workers unavailable here — computing inline (identical results).');
        recompute(p, s);
        return;
      }
      setBusy(false);
      view.setBusy(false);
      setError(err instanceof Error ? err.message : String(err)); // last good result stays visible
    });
  }, [sim]);

  // mount: decode, create pool + view, first compute
  useEffect(() => {
    const decoded = decodeState(query, sim.defaultParams, sim.paramSchema);
    setParams(decoded.params);
    setSeed(decoded.seed);
    stateRef.current = { params: decoded.params, seed: decoded.seed };

    const pool = sim.createWorker
      ? new WorkerPool(() => new WorkerTransport(sim.createWorker!()))
      : new WorkerPool(() => new InlineTransport(), 1);
    poolRef.current = pool;
    if (hostRef.current) {
      viewRef.current = sim.mountResult(hostRef.current, { theme: themeRef.current });
    }
    recompute(decoded.params, decoded.seed);
    return () => {
      abortRef.current?.abort();
      window.clearTimeout(debounceRef.current);
      poolRef.current?.dispose();
      viewRef.current?.dispose();
      poolRef.current = null;
      viewRef.current = null;
    };
    // deps: sim identity only — theme remount handled below
  }, [sim]);

  // theme change: remount the view (charts re-colour) and re-apply last result.
  // Skips the first run — the mount effect above already created the view
  // with the current theme (remounting here would swallow the first result).
  const appliedThemeRef = useRef(theme);
  useEffect(() => {
    if (appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    if (!hostRef.current || !viewRef.current) return;
    viewRef.current.dispose();
    viewRef.current = sim.mountResult(hostRef.current, { theme });
    if (lastRef.current) viewRef.current.update(lastRef.current.result, lastRef.current.params, { ms: lastRef.current.ms });
    if (busy) viewRef.current.setBusy(true, progress);
  }, [theme]);

  const schedule = useCallback((p: Record<string, any>, s: number) => {
    syncUrl(p, s);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => recompute(p, s), 200);
  }, [recompute, syncUrl]);

  const onControlChange = useCallback((key: string, value: unknown) => {
    setParams((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      stateRef.current = { params: next, seed: stateRef.current.seed };
      schedule(next, stateRef.current.seed);
      return next;
    });
  }, [schedule]);

  const newSeed = useCallback(() => {
    const s = Math.floor(Math.random() * 1_000_000_000);
    setSeed(s);
    stateRef.current = { ...stateRef.current, seed: s };
    if (params) { syncUrl(params, s); recompute(params, s); }
  }, [params, recompute, syncUrl]);

  const copyLink = useCallback(async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { /* url still in address bar */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, []);

  const meta = entry.meta;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 pt-5 text-[13px]">
        <a href="#/" className="inline-flex items-center gap-1.5 font-semibold text-slate-500 transition hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400">
          <ArrowLeft className="h-4 w-4" /> All simulations
        </a>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="capitalize text-slate-400 dark:text-slate-500">{meta.category}</span>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="font-semibold text-slate-800 dark:text-slate-100">{meta.title}</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black tracking-wider text-emerald-700 uppercase dark:text-emerald-300">Analysis · batch</span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${busy ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" /> {busy ? 'Computing…' : 'Up to date'}
            </span>
            {status && !busy && <span className="font-mono text-[12px] text-slate-400 dark:text-slate-500">{status}{poolKindRef.current === 'worker' ? ' · via Web Workers' : ''}</span>}
            {workerNote && <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">{workerNote}</span>}
            <div className="ml-auto flex items-center gap-2">
              <label className="hidden items-center gap-1.5 font-mono text-[11px] text-slate-400 md:inline-flex dark:text-slate-500">
                <Hash className="h-3.5 w-3.5" /> seed
                <input
                  value={seed} inputMode="numeric" aria-label="Seed"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ''));
                    if (Number.isFinite(n)) { setSeed(n); stateRef.current = { ...stateRef.current, seed: n }; if (params) schedule(params, n); }
                  }}
                  className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-[12px] text-slate-700 dark:border-white/15 dark:bg-white/[.06] dark:text-slate-100"
                />
              </label>
              <button onClick={newSeed} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5">
                <Dices className="h-4 w-4" /> New seed
              </button>
              <button onClick={() => params && recompute(params, seed)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5">
                <RefreshCw className="h-4 w-4" /> Re-run
              </button>
              <button onClick={copyLink} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white transition ${copied ? 'bg-emerald-500' : 'bg-slate-900 hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'}`}>
                {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>

          {busy && <div className="mb-4"><ProgressBar value={progress} label="Chunks complete" /></div>}
          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300" role="alert">
              <b>Computation failed:</b> {error} <span className="text-rose-500/80 dark:text-rose-300/70">— showing the last good result.</span>
            </div>
          )}

          <div ref={hostRef} className="min-h-[300px]" />
          <p className="mt-3 text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
            Batch sim: no play/pause — change a control and it recomputes (debounced, stale runs cancelled).
            Same seed ⇒ same numbers, regardless of worker count: fixed 1,000-run chunks, per-chunk derived seeds, ordered reduce.
          </p>
        </section>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:self-start dark:border-white/10 dark:bg-slate-900">
          <div className="flex border-b border-slate-200 dark:border-white/10" role="tablist" aria-label="Batch panel">
            <TabBtn active={tab === 'controls'} onClick={() => setTab('controls')} icon={<SlidersHorizontal className="h-4 w-4" />} label="Controls" />
            <TabBtn active={tab === 'how'} onClick={() => setTab('how')} icon={<BookOpen className="h-4 w-4" />} label="How it works" />
            <TabBtn active={tab === 'state'} onClick={() => setTab('state')} icon={<Braces className="h-4 w-4" />} label="State" />
          </div>
          <div className="nice-scroll max-h-[760px] overflow-y-auto p-4">
            {tab === 'controls' && (
              params ? (
                <>
                  <Controls schema={sim.paramSchema} params={params} onChange={(k, v) => onControlChange(String(k), v)} />
                  <button
                    onClick={() => { const d = { ...sim.defaultParams }; setParams(d); setSeed(42); stateRef.current = { params: d, seed: 42 }; syncUrl(d, 42); recompute(d, 42); }}
                    className="mt-5 w-full rounded-lg border border-dashed border-slate-300 py-2 text-[12px] font-semibold text-slate-500 transition hover:border-amber-400 hover:text-amber-600 dark:border-white/20 dark:text-slate-400"
                  >
                    Reset params to defaults
                  </button>
                </>
              ) : <p className="text-[13px] text-slate-400">Loading controls…</p>
            )}
            {tab === 'how' && (
              <div className="space-y-4 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                <p>{sim.about.summary}</p>
                <ul className="space-y-2.5">
                  {sim.about.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /><span>{b}</span></li>
                  ))}
                </ul>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12px] text-emerald-800 dark:text-emerald-200">
                  <b>Tested invariant —</b> {sim.about.invariant}
                </div>
              </div>
            )}
            {tab === 'state' && params && (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">Live URL (diff-only)</p>
                  <code className="block rounded-lg bg-slate-950 p-3 font-mono text-[11px] break-all text-emerald-300 dark:bg-black/60">{`#/sim/${meta.id}?${encodeState(params, sim.defaultParams, seed).toString()}`}</code>
                </div>
                <p className="text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
                  Copy the link and the recipient recomputes the identical result — chunk seeds derive from
                  <code className="font-mono text-[11px]"> (seed, chunkIndex)</code>, so hardware and worker count cannot change the outcome.
                </p>
                <button onClick={copyLink} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900">
                  {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? 'Link copied' : 'Copy shareable link'}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-[12px] font-bold transition ${active ? 'border-emerald-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}>
      {icon} {label}
    </button>
  );
}
