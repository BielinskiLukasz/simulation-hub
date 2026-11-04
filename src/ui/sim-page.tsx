// ─── ui/sim-page.tsx — sim shell dispatcher (Contract v2) ───────────────────
// Loads the sim chunk, then dispatches on kind:
//   realtime → Runner loop, toolbar, HUD, pointer input, live params
//   batch    → BatchPage (worker pool, progress, cancellation)
// Realtime dispose stops rAF, disconnects observers, unbinds pointer/keys.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BookOpen, Braces, Check, Dices, Eraser, Gauge, Hash, Keyboard,
  Link2, MousePointer2, Pause, Play, RotateCcw, SlidersHorizontal, StepForward, Activity,
} from 'lucide-react';
import type { AnySimulation, RealtimeSimulation, RenderContext, SimEntry, ThemeName } from '../core/types';
import { Runner } from '../core/runner';
import type { RunnerStats } from '../core/stats';
import { decodeState, encodeState } from '../core/url-state';
import { buildHash } from '../core/router';
import { bindPointer } from './pointer';
import { Controls } from './controls';
import { BatchPage } from './batch-page';
import { HudOverlay } from './hud';
import { EventPage } from './event-page';
import { mountGridEditor, type EditorHandle } from './grid-editor';
import { exportJson, importJson } from '../core/grid/codec';
import { TracePage } from './trace-page';

const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
const WORLD = { w: 800, h: 600 };
type Tab = 'controls' | 'how' | 'state';

export function SimPage({ entry, query, theme }: { entry: SimEntry; query: URLSearchParams; theme: ThemeName }) {
  const [sim, setSim] = useState<AnySimulation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    entry.load()
      .then(({ default: loaded }) => { if (alive) setSim(loaded); })
      .catch((err: unknown) => { if (alive) setLoadError(err instanceof Error ? err.message : 'Failed to load simulation'); });
    return () => { alive = false; };
  }, [entry]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Failed to load simulation</h1>
        <p className="mt-2 font-mono text-[13px] text-rose-500">{loadError}</p>
        <a href="#/" className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white dark:bg-white dark:text-slate-900">← Back to the hub</a>
      </main>
    );
  }
  if (!sim) {
    return (
      <main className="flex flex-col items-center justify-center gap-3 py-32 text-slate-400">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-amber-500 dark:border-white/15 dark:border-t-amber-400" />
        <p className="font-mono text-[12px]">lazy-loading sim chunk…</p>
      </main>
    );
  }
  if (sim.kind === 'batch') return <BatchPage entry={entry} sim={sim} query={query} theme={theme} />;
  if (sim.kind === 'event') return <EventPage entry={entry} sim={sim} query={query} theme={theme} />;
  if (sim.kind === 'trace') return <TracePage entry={entry} sim={sim} query={query} theme={theme} />;
  return <RealtimePage entry={entry} sim={sim} query={query} theme={theme} />;
}

function RealtimePage({ entry, sim, query, theme }: { entry: SimEntry; sim: RealtimeSimulation<any, any>; query: URLSearchParams; theme: ThemeName }) {
  const [params, setParams] = useState<Record<string, any> | null>(null);
  const [seed, setSeed] = useState(42);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<Tab>('controls');
  const [copied, setCopied] = useState(false);
  const [hud, setHud] = useState(() => query.get('hud') === '1');
  const [stats, setStats] = useState({ steps: 0, time: 0, fps: 0 });
  const [runnerStats, setRunnerStats] = useState<RunnerStats | null>(null);
  const [simStats, setSimStats] = useState<Record<string, number | string>>({});
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<Runner<any, any> | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const framesRef = useRef(0);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  const syncUrl = useCallback((p: Record<string, any>, s: number) => {
    history.replaceState(null, '', buildHash(entry.meta.id, encodeState(p, sim.defaultParams, s)));
  }, [entry.meta.id, sim]);

  useEffect(() => {
    if (!sim.editor || !sim.onEdit) return;
    const host = editorHostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ed = mountGridEditor(host, sim.editor, {
      canvas,
      cellAt: (clientX, clientY) => {
        const st = runnerRef.current?.state as { w?: number; h?: number } | undefined;
        if (!st?.w || !st.h) return null;
        const rect = canvas.getBoundingClientRect();
        const px = (clientX - rect.left) / Math.max(1, rect.width);
        const py = (clientY - rect.top) / Math.max(1, rect.height);
        if (px < 0 || py < 0 || px >= 1 || py >= 1) return null;
        return { x: Math.floor(px * st.w), y: Math.floor(py * st.h) };
      },
      getTarget: () => {
        const st = runnerRef.current?.state;
        if (!st) return { w: 1, h: 1, cells: new Uint8Array(1) };
        return sim.editor!.target(st);
      },
      onEdit: (edit) => { runnerRef.current?.edit(edit); return null; },
      requestRender: () => runnerRef.current?.renderOnce(),
      onExport: () => {
        const st = runnerRef.current?.state;
        if (!st) return;
        const target = sim.editor!.target(st);
        const blob = new Blob([exportJson(target, 0, target.cells.length - 1)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${entry.meta.id}-grid.json`; a.click();
        URL.revokeObjectURL(url);
      },
      onImport: (text) => {
        const doc = importJson(text);
        if (!doc) { alert('Import failed: not a valid grid JSON file.'); return; }
        runnerRef.current?.edit({ op: 'replace', w: doc.w, h: doc.h, cells: doc.cells });
      },
      onCopyLink: () => { void navigator.clipboard.writeText(location.href); },
    });
    editorRef.current = ed;
    return () => { ed.dispose(); editorRef.current = null; };
  }, [sim]);

  useEffect(() => {
    let alive = true;
    let runner: Runner<any, any> | null = null;
    let ro: ResizeObserver | null = null;
    let statsTimer = 0;
    let unbindPointer: (() => void) | null = null;

    const decoded = decodeState(query, sim.defaultParams, sim.paramSchema);
    setParams(decoded.params);
    setSeed(decoded.seed);

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas && wrap) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const getContext = (): RenderContext => ({ ctx, width: WORLD.w, height: WORLD.h, theme: themeRef.current });
        const fit = () => {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const w = Math.max(wrap.clientWidth, 280);
          const h = Math.round((w * 3) / 4);
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          canvas.style.height = `${h}px`;
          ctx.setTransform(canvas.width / WORLD.w, 0, 0, canvas.height / WORLD.h, 0, 0);
        };
        fit();
        runner = new Runner(sim, decoded.params, decoded.seed, getContext);
        runner.onFrame = () => { framesRef.current++; };
        runnerRef.current = runner;
        runner.start();
        if (sim.onPointer) {
          unbindPointer = bindPointer(canvas, WORLD, (ev) => runnerRef.current?.pointer(ev));
        }
        ro = new ResizeObserver(() => { fit(); runner?.renderOnce(); });
        ro.observe(wrap);
        let lastFrames = 0;
        statsTimer = window.setInterval(() => {
          if (!runner || !alive) return;
          const fps = (framesRef.current - lastFrames) * 4;
          lastFrames = framesRef.current;
          setStats({ steps: runner.stepCount, time: runner.simTime, fps });
          if (hudRef.current) {
            setRunnerStats(runner.stats);
            if (sim.getStats) setSimStats(sim.getStats(runner.state));
          }
        }, 250);
      }
    }
    return () => {
      alive = false;
      runner?.stop();
      ro?.disconnect();
      unbindPointer?.();
      window.clearInterval(statsTimer);
      runnerRef.current = null;
    };
    // deps: sim identity — query decoded once per navigation (by design)
  }, [sim, entry, query]);

  useEffect(() => { runnerRef.current?.renderOnce(); }, [theme]);

  const applyParams = useCallback((next: Record<string, any>, s: number) => {
    setParams(next);
    runnerRef.current?.reset(next, s);
    syncUrl(next, s);
  }, [syncUrl]);

  const onControlChange = useCallback((key: string, value: unknown) => {
    setParams((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      const def = (sim.paramSchema as Record<string, { live?: boolean }>)[key];
      const runner = runnerRef.current;
      if (runner && def?.live && sim.applyParams) {
        runner.applyLiveParams(next); // hot update — no re-init
      } else {
        runner?.reset(next, seed);
      }
      syncUrl(next, seed);
      return next;
    });
  }, [seed, sim, syncUrl]);

  const togglePause = useCallback(() => {
    const r = runnerRef.current; if (!r) return;
    r.paused = !r.paused; setPaused(r.paused);
  }, []);
  const stepOnce = useCallback(() => { runnerRef.current?.stepOnce(); }, []);
  const reset = useCallback(() => { if (params) runnerRef.current?.reset(params, seed); }, [params, seed]);
  const newSeed = useCallback(() => {
    if (!params) return;
    const s = Math.floor(Math.random() * 1_000_000_000);
    setSeed(s); applyParams(params, s);
  }, [params, applyParams]);
  const copyLink = useCallback(async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { /* url in address bar */ }
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      else if (e.key === '.') stepOnce();
      else if (e.key === 'r' || e.key === 'R') reset();
      else if (e.key === 'p' || e.key === 'P') setHud((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, stepOnce, reset]);

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
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-black tracking-wider text-sky-700 uppercase dark:text-sky-300">Real-time</span>
        <span className="ml-auto hidden items-center gap-1.5 font-mono text-[11px] text-slate-400 sm:inline-flex dark:text-slate-500">
          <Keyboard className="h-3.5 w-3.5" /> Space play/pause · <b>.</b> step · <b>R</b> reset · <b>P</b> HUD
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-white/10">
              <button onClick={togglePause} className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-3.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-amber-600" aria-pressed={paused}>
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? 'Play' : 'Pause'}
              </button>
              <button onClick={stepOnce} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5" title="Advance one 1/60 s step (.)">
                <StepForward className="h-4 w-4" /> Step
              </button>
              <button onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5" title="Reset with same params + seed (R)">
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
              <button onClick={() => setHud((h) => !h)} aria-pressed={hud} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition ${hud ? 'border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5'}`} title="Perf HUD (P)">
                <Activity className="h-4 w-4" /> HUD
              </button>
              <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block dark:bg-white/10" />
              <span className="hidden items-center gap-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase sm:inline-flex dark:text-slate-500"><Gauge className="h-3.5 w-3.5" /> Speed</span>
              <div className="flex rounded-lg bg-slate-900/[.05] p-0.5 dark:bg-white/[.07]" role="group" aria-label="Simulation speed">
                {SPEEDS.map((s) => (
                  <button key={s} aria-pressed={speed === s}
                    onClick={() => { setSpeed(s); if (runnerRef.current) runnerRef.current.speed = s; }}
                    className={`rounded-md px-2 py-1 font-mono text-[11px] font-bold transition ${speed === s ? 'bg-white text-slate-900 shadow dark:bg-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {s}×
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <label className="hidden items-center gap-1.5 font-mono text-[11px] text-slate-400 md:inline-flex dark:text-slate-500">
                  <Hash className="h-3.5 w-3.5" /> seed
                  <input
                    value={seed} inputMode="numeric" aria-label="Seed"
                    onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (Number.isFinite(n)) { setSeed(n); if (params) applyParams(params, n); } }}
                    className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-[12px] text-slate-700 dark:border-white/15 dark:bg-white/[.06] dark:text-slate-100"
                  />
                </label>
                <button onClick={newSeed} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5">
                  <Dices className="h-4 w-4" /> New seed
                </button>
                <button onClick={copyLink} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white transition ${copied ? 'bg-emerald-500' : 'bg-slate-900 hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'}`}>
                  {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>

            {sim.editor && <div ref={editorHostRef} className="border-b border-slate-200 px-3 py-2 dark:border-white/10" />}
            <div ref={wrapRef} className="relative w-full bg-[#0b0f17]">
              <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: '4 / 3' }} aria-label={`${meta.title} canvas`} />
              <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider uppercase ${paused ? 'bg-amber-500/90 text-white' : 'bg-emerald-500/90 text-white'}`}>
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> {paused ? 'Paused' : 'Running'} · {speed}×
              </span>
              {hud && <HudOverlay stats={runnerStats} entries={simStats} />}
              <span className="absolute right-3 bottom-3 rounded-md bg-black/45 px-2 py-1 font-mono text-[10px] text-slate-300">world 800 × 600 · fixed dt 1/60</span>
              {sim.onPointer && (
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 font-mono text-[10px] text-slate-300">
                  <MousePointer2 className="h-3 w-3" /> {meta.id === 'boids' ? 'click/drag spawn · shift predator · alt obstacle · right-click remove' : meta.id === 'game-of-life' ? 'click/drag paints cells · shift erases' : meta.id === 'double-pendulum' ? 'click/drag aims the pendulum · release from rest' : meta.id === 'raft' ? 'click node = crash/revive · shift+click forces election' : 'click canvas to spawn'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200 font-mono sm:grid-cols-4 dark:divide-white/10 dark:border-white/10">
              <Stat label="steps" value={stats.steps.toLocaleString()} />
              <Stat label="sim time" value={`${stats.time.toFixed(2)} s`} />
              <Stat label="render fps" value={String(stats.fps)} />
              <Stat label="seed" value={String(seed)} accent />
            </div>
          </div>

          <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
            <Braces className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Live params (badged in the panel) hot-update without resetting; others re-init with the same seed. Pointer input is queued by the runner and applied on step boundaries. URL updates via <code className="font-mono text-[11px]">replaceState</code> — copy the link to share the exact run.</span>
          </p>
        </section>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:self-start dark:border-white/10 dark:bg-slate-900">
          <div className="flex border-b border-slate-200 dark:border-white/10" role="tablist" aria-label="Simulation panel">
            <TabBtn active={tab === 'controls'} onClick={() => setTab('controls')} icon={<SlidersHorizontal className="h-4 w-4" />} label="Controls" />
            <TabBtn active={tab === 'how'} onClick={() => setTab('how')} icon={<BookOpen className="h-4 w-4" />} label="How it works" />
            <TabBtn active={tab === 'state'} onClick={() => setTab('state')} icon={<Braces className="h-4 w-4" />} label="State" />
          </div>

          <div className="nice-scroll max-h-[720px] overflow-y-auto p-4">
            {tab === 'controls' && (
              params ? (
                <>
                  <Controls schema={sim.paramSchema} params={params} onChange={(k, v) => onControlChange(String(k), v)} />
                  <button
                    onClick={() => { setSeed(42); applyParams({ ...sim.defaultParams }, 42); }}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-[12px] font-semibold text-slate-500 transition hover:border-amber-400 hover:text-amber-600 dark:border-white/20 dark:text-slate-400"
                  >
                    <Eraser className="h-3.5 w-3.5" /> Reset params to defaults
                  </button>
                  <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200/90">
                    <b>Contract v2:</b> controls badged <span className="rounded bg-emerald-500/20 px-1 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">live</span> apply mid-run via <code className="font-mono text-[11px]">applyParams</code> — try gravity on Bouncing Balls or separation on Boids.
                  </div>
                </>
              ) : <p className="text-[13px] text-slate-400">Loading controls…</p>
            )}

            {tab === 'how' && (
              <div className="space-y-4 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                <p>{sim.about.summary}</p>
                <ul className="space-y-2.5">
                  {sim.about.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /><span>{b}</span></li>
                  ))}
                </ul>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12px] text-emerald-800 dark:text-emerald-200">
                  <b>Tested invariant —</b> {sim.about.invariant}
                </div>
                {sim.concepts && (
                  <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-white/[.07]">
                    {sim.concepts.split(/\n{2,}/).map((block, i) => {
                      const t = block.trim();
                      if (t.startsWith('## ')) return <h3 key={i} className="text-[13px] font-black text-slate-800 dark:text-white">{t.slice(3)}</h3>;
                      return <p key={i} dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code class="font-mono text-[11px]">$1</code>') }} />;
                    })}
                  </div>
                )}
                <div>
                  <p className="mb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">Frame-rate independence</p>
                  <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
                    {['60 Hz display', '144 Hz display', '30 Hz throttle'].map((l) => (
                      <div key={l} className="rounded-lg bg-slate-900/[.04] px-1 py-2 dark:bg-white/[.06]">{l}<br /><b className="text-amber-600 dark:text-amber-400">→ 60 steps/s</b></div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'state' && params && (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">Live URL (diff-only encoding)</p>
                  <code className="block rounded-lg bg-slate-950 p-3 font-mono text-[11px] break-all text-emerald-300 dark:bg-black/60">{`#/sim/${meta.id}?${encodeState(params, sim.defaultParams, seed).toString()}`}</code>
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">Only non-default values are written; seed is always present.</p>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                  <table className="w-full font-mono text-[11px]">
                    <thead><tr className="bg-slate-900/[.04] text-left text-slate-400 dark:bg-white/[.05] dark:text-slate-500"><th className="px-2.5 py-1.5">param</th><th className="px-2.5 py-1.5">value</th><th className="px-2.5 py-1.5">mode</th></tr></thead>
                    <tbody>
                      {Object.keys(sim.defaultParams).map((k) => {
                        const def = (sim.paramSchema as Record<string, { live?: boolean }>)[k];
                        return (
                          <tr key={k} className="border-t border-slate-100 dark:border-white/[.06]">
                            <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400">{k}</td>
                            <td className="px-2.5 py-1.5 font-semibold text-slate-700 dark:text-slate-100">{String(params[k])}</td>
                            <td className="px-2.5 py-1.5">{def?.live ? <span className="font-bold text-emerald-600 dark:text-emerald-400">live</span> : params[k] === sim.defaultParams[k] ? <span className="text-slate-400">default</span> : <span className="font-bold text-amber-600 dark:text-amber-400">re-init</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase dark:text-slate-500">{label}</div>
      <div className={`text-[15px] font-bold ${accent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-100'}`}>{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-[12px] font-bold transition ${active ? 'border-amber-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}>
      {icon} {label}
    </button>
  );
}
