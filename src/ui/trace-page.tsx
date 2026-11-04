// ─── ui/trace-page.tsx — Contract v4 trace shell (single pane + compare) ───
// Algorithms run once into a trace; playback/scrubbing is index-based and
// exact. Compare panes share the input; only paneKeys differ.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, BookOpen, Check, ChevronFirst, ChevronLast, Gauge,
  Layers, Link2, Pause, Play, RotateCcw, ScrollText, SlidersHorizontal, StepBack,
  StepForward, Timer, Trophy,
} from 'lucide-react';
import type { TraceSimulation, TraceView, SimEntry, ThemeName } from '../core/types';
import { TracePlayer } from '../core/trace/player';
import { SyncGroup, type SyncMode } from '../core/trace/sync';
import { decodeState, encodeState } from '../core/url-state';
import { buildHash } from '../core/router';
import { Controls } from './controls';

const RATES = [1, 5, 20, 100, 500] as const;
type Tab = 'controls' | 'log' | 'concepts';

export function TracePage({ entry, sim, query, theme }: { entry: SimEntry; sim: TraceSimulation<any, any, any>; query: URLSearchParams; theme: ThemeName }) {
  const [paramsA, setParamsA] = useState<Record<string, any> | null>(null);
  const [seed, setSeed] = useState(42);
  const [input, setInput] = useState<unknown>(null);
  const [resultA, setResultA] = useState<any>(null);
  const [resultB, setResultB] = useState<any>(null);
  const [compareOn, setCompareOn] = useState(false);
  const [modeId, setModeId] = useState('');
  const [syncMode, setSyncMode] = useState<SyncMode>('steps');
  const [bOverrides, setBOverrides] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<Tab>('controls');
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(60);
  const [uiPos, setUiPos] = useState(0);
  const [uiMax, setUiMax] = useState(1);
  const [ms, setMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewsReady, setViewsReady] = useState(0);

  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const viewA = useRef<TraceView<any, any> | null>(null);
  const viewB = useRef<TraceView<any, any> | null>(null);
  const player = useRef<TracePlayer | null>(null);
  const group = useRef<SyncGroup | null>(null);
  const positions = useRef<number[]>([0, 0]);
  const lastRendered = useRef<number[]>([-1, -1]);
  const generation = useRef(0);
  const started = useRef(false);

  const compareSpec = sim.compare;
  const mode = compareSpec?.modes.find((m) => m.id === modeId) ?? compareSpec?.modes[0];

  const syncUrl = useCallback((p: Record<string, any>, s: number, inp: unknown, cmp: boolean, mId: string, sync: SyncMode, overrides: Record<string, any>) => {
    const qs = encodeState(p, sim.defaultParams, s);
    const encodedInput = sim.input.codec.encode(inp);
    if (encodedInput.length <= 3000) qs.set('in', encodedInput);
    if (cmp) {
      qs.set('cmp', mId);
      qs.set('sync', sync);
      for (const [k, v] of Object.entries(overrides)) {
        if (typeof v === 'boolean') qs.set(`b.${k}`, v ? '1' : '0');
        else if (typeof v === 'string' && v.startsWith('#')) qs.set(`b.${k}`, v.slice(1));
        else qs.set(`b.${k}`, String(v));
      }
    }
    history.replaceState(null, '', buildHash(entry.meta.id, qs));
  }, [entry.meta.id, sim]);

  const effectiveB = useMemo<Record<string, any> | null>(() => {
    if (!paramsA || !mode) return paramsA;
    return { ...paramsA, ...mode.bDefaults, ...bOverrides };
  }, [paramsA, mode, bOverrides]);

  const compute = useCallback((pA: Record<string, any>, pB: Record<string, any> | null, inp: unknown, s: number, cmp: boolean, mId: string, sync: SyncMode, overrides: Record<string, any>) => {
    const gen = ++generation.current;
    setLoading(true);
    let enforcedA = pA;
    let enforcedB = pB;
    if (cmp && compareSpec?.enforce && pA && pB) {
      const res = compareSpec.enforce(pA, pB);
      enforcedA = res.a;
      enforcedB = res.b;
      if (res.warnings.length) setToast(res.warnings[0]!);
    }
    const t0 = performance.now();
    const runA = sim.run(inp, enforcedA);
    Promise.resolve(runA).then((rA) => {
      if (gen !== generation.current) return;
      const finish = (rBv: unknown) => {
        if (gen !== generation.current) return;
        setMs(performance.now() - t0);
        setResultA(rA);
        setResultB(rBv);
        setParamsA(enforcedA);
        if (enforcedB) {
          const g = new SyncGroup([
            { length: rA.length, work: (rA as { work?: { cumulative: ArrayLike<number> } }).work?.cumulative },
            { length: (rBv as { length: number }).length, work: (rBv as { work?: { cumulative: ArrayLike<number> } }).work?.cumulative },
          ]);
          g.mode = sync;
          group.current = g;
          const pl = new TracePlayer(g.maxFor(sync));
          pl.rate = rate;
          pl.playing = false;
          player.current = pl;
          setUiMax(g.maxFor(sync));
        } else {
          group.current = null;
          const pl = new TracePlayer(rA.length);
          pl.rate = rate;
          pl.playing = false;
          player.current = pl;
          setUiMax(rA.length);
        }
        positions.current = [0, 0];
        lastRendered.current = [-1, -1];
        setUiPos(0);
        setLoading(false);
        setPlaying(false);
        syncUrl(enforcedA, s, inp, cmp, mId, sync, overrides);
      };
      if (cmp && enforcedB) {
        Promise.resolve(sim.run(inp, enforcedB)).then((rBv) => finish(rBv));
      } else finish(null);
    }).catch((err: unknown) => {
      setLoading(false);
      setToast(err instanceof Error ? err.message : String(err));
    });
  }, [compareSpec, rate, sim, syncUrl]);

  // initial decode
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const decoded = decodeState(query, sim.defaultParams, sim.paramSchema);
    let inp: unknown = sim.input.initial(decoded.seed);
    const rawIn = query.get('in');
    if (rawIn) {
      const parsed = sim.input.codec.decode(rawIn);
      if (parsed) inp = parsed;
    }
    const cmp = query.get('cmp');
    const modeFromUrl = compareSpec?.modes.find((m) => m.id === cmp) ?? null;
    const compare = !!modeFromUrl;
    const mId = modeFromUrl?.id ?? compareSpec?.modes[0]?.id ?? '';
    const sync = (query.get('sync') as SyncMode | null) ?? 'steps';
    const overrides: Record<string, any> = { ...(modeFromUrl?.bDefaults ?? {}) };
    if (modeFromUrl) {
      for (const key of modeFromUrl.paneKeys.map(String)) {
        const raw = query.get(`b.${key}`);
        if (raw === null) continue;
        const def = (sim.paramSchema as Record<string, any>)[key];
        if (!def) continue;
        if (def.kind === 'boolean') overrides[key] = raw === '1';
        else if (def.kind === 'range' || def.kind === 'number') { const n = Number(raw); if (Number.isFinite(n)) overrides[key] = n; }
        else if (def.kind === 'select') { if (def.options.includes(raw)) overrides[key] = raw; }
        else overrides[key] = raw;
      }
    }
    setSeed(decoded.seed);
    setParamsA(decoded.params);
    setInput(inp);
    setCompareOn(compare);
    setModeId(mId);
    setSyncMode(sync);
    setBOverrides(overrides);
    const pB = modeFromUrl ? { ...decoded.params, ...modeFromUrl.bDefaults, ...overrides } : null;
    compute(decoded.params, pB, inp, decoded.seed, compare, mId, sync, overrides);
    // deps: sim identity — query decoded once
  }, [compute, compareSpec, query, sim]);

  // mount views (also on compare/theme changes)
  useEffect(() => {
    if (!hostA.current || !input || !paramsA) return;
    const ctx = { theme, seed, compare: compareOn, onInputChange: (next: unknown) => { scheduleInput(next); } };
    viewA.current = sim.mountView(hostA.current, ctx);
    viewA.current.setInput(input);
    if (compareOn && hostB.current) {
      viewB.current = sim.mountView(hostB.current, { ...ctx, onInputChange: undefined });
      viewB.current.setInput(input);
    }
    lastRendered.current = [-1, -1];
    setViewsReady((v) => v + 1);
    return () => {
      viewA.current?.dispose();
      viewB.current?.dispose();
      viewA.current = null;
      viewB.current = null;
    };
  }, [sim, compareOn, theme, input === null]);

  // push results into views
  useEffect(() => {
    if (!resultA) return;
    const pa = paramsA;
    viewA.current?.setResult(resultA, pa, 'a');
    if (compareOn && resultB) viewB.current?.setResult(resultB, effectiveB, 'b');
    renderAt(0);
  }, [resultA, resultB, compareOn, paramsA, effectiveB, viewsReady]);

  function positionsFor(master: number): number[] {
    if (!group.current) return [Math.floor(master), 0];
    return group.current.positions(master, syncMode);
  }

  function renderAt(master: number) {
    const pos = positionsFor(master);
    positions.current = pos;
    if (pos[0] !== lastRendered.current[0]) { viewA.current?.render(pos[0]!); lastRendered.current[0] = pos[0]!; }
    if (compareOn && pos[1] !== lastRendered.current[1]) { viewB.current?.render(pos[1]!); lastRendered.current[1] = pos[1]!; }
    setUiPos(master);
  }

  // rAF playback
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (ts: number) => {
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      const pl = player.current;
      if (pl && playing) {
        pl.playing = true;
        pl.rate = rate;
        pl.tick(dt);
        renderAt(pl.position);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, syncMode, compareOn]);

  const seekMaster = (value: number) => {
    const pl = player.current;
    if (!pl) return;
    pl.playing = false;
    pl.seek(value);
    setPlaying(false);
    renderAt(pl.position);
  };
  const step = (dir: number) => seekMaster((player.current?.position ?? 0) + dir);
  const toStart = () => seekMaster(0);
  const toEnd = () => seekMaster(player.current?.length ?? 0);

  const scheduleTimer = useRef(0);
  function scheduleInput(next: unknown) {
    setInput(next);
    window.clearTimeout(scheduleTimer.current);
    scheduleTimer.current = window.setTimeout(() => {
      if (!paramsA) return;
      compute(paramsA, compareOn ? effectiveB : null, next, seed, compareOn, modeId, syncMode, bOverrides);
    }, 90);
  }

  const changeParam = (pane: 'shared' | 'a' | 'b', key: string, value: unknown) => {
    if (!paramsA) return;
    if (compareOn && mode) {
      if (pane === 'b') {
        const nextOverrides = { ...bOverrides, [key]: value };
        setBOverrides(nextOverrides);
        compute(paramsA, { ...paramsA, ...mode.bDefaults, ...nextOverrides }, input, seed, true, modeId, syncMode, nextOverrides);
        return;
      }
      if (mode.paneKeys.includes(key as never)) {
        const nextA = { ...paramsA, [key]: value };
        setParamsA(nextA);
        compute(nextA, { ...nextA, ...mode.bDefaults, ...bOverrides }, input, seed, true, modeId, syncMode, bOverrides);
        return;
      }
      const nextA = { ...paramsA, [key]: value };
      setParamsA(nextA);
      compute(nextA, { ...nextA, ...mode.bDefaults, ...bOverrides }, input, seed, true, modeId, syncMode, bOverrides);
      return;
    }
    const next = { ...paramsA, [key]: value };
    setParamsA(next);
    compute(next, null, input, seed, false, modeId, syncMode, bOverrides);
  };

  const resetAll = () => {
    if (!paramsA) return;
    compute({ ...sim.defaultParams }, null, sim.input.initial(seed), seed, false, modeId, syncMode, {});
    setCompareOn(false);
    setInput(sim.input.initial(seed));
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { /* bar */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying((v) => !v); }
      else if (e.key === '.') { e.preventDefault(); step(1); }
      else if (e.key === ',') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') toStart();
      else if (e.key === 'End') toEnd();
      else if (e.key === 'l' || e.key === 'L') setTab('log');
      else if (e.key === 'r' || e.key === 'R') resetAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const meta = entry.meta;
  const sharedKeys = paramsA ? Object.keys(sim.defaultParams).filter((k) => !(compareOn && mode && mode.paneKeys.map(String).includes(k))) : [];
  const paneKeys: string[] = paramsA && compareOn && mode ? mode.paneKeys.map(String).filter((k) => k in sim.defaultParams) : [];
  const filteredSchema = (keys: string[]) => Object.fromEntries(Object.entries(sim.paramSchema as Record<string, any>).filter(([k]) => keys.includes(k)));
  const sliceParams = (p: Record<string, any>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, p[k]]));

  const summaryA = resultA?.summary as Record<string, any> | undefined;
  const summaryB = resultB?.summary as Record<string, any> | undefined;

  const logEntries = useMemo(() => {
    if (!resultA || !sim.describeStep) return [];
    const data = group.current ? resultA.data : resultA.data;
    const count = resultA.length;
    const start = Math.max(0, Math.min(count - 1, uiPos - 60));
    const end = Math.min(count, start + 140);
    const out: { i: number; cat: string; text: string }[] = [];
    for (let i = start; i < end; i++) {
      const d = sim.describeStep(data, i);
      out.push({ i: i + 1, cat: d.cat, text: d.text });
    }
    return out;
  }, [resultA, sim, uiPos]);

  const scoreOf = (s: Record<string, any> | undefined): number => {
    if (!s) return -Infinity;
    if (s.l1HitRate !== undefined) return Number(s.l1HitRate); // higher hit rate wins
    if (s.cost !== undefined && s.found) return -Number(s.cost); // lower cost wins
    return -Infinity;
  };
  const winner = summaryA && summaryB ? (scoreOf(summaryA) >= scoreOf(summaryB) ? 'A' : 'B') : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 pt-5 text-[13px]">
        <a href="#/" className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400">
          <ArrowLeft className="h-4 w-4" /> All simulations
        </a>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="capitalize text-slate-400 dark:text-slate-500">{meta.category}</span>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="font-semibold text-slate-800 dark:text-slate-100">{meta.title}</span>
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-black tracking-wider text-violet-700 uppercase dark:text-violet-300">Trace</span>
        <span className="ml-auto hidden items-center gap-1.5 font-mono text-[11px] text-slate-400 lg:inline-flex dark:text-slate-500">
          Space play · . step · , back · Home/End · L log · R reset
        </span>
      </div>

      {toast && (
        <div className="fade-up mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[12px] font-semibold text-amber-800 dark:text-amber-200" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast('')} className="text-[11px] uppercase">dismiss</button>
        </div>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
        <section className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className={`grid gap-3 ${compareOn ? 'lg:grid-cols-2' : ''}`}>
              <div>
                {compareOn && <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Layers className="h-3.5 w-3.5" /> Pane A</div>}
                <div ref={hostA} className="min-h-[180px]" />
              </div>
              {compareOn && (
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Layers className="h-3.5 w-3.5" /> Pane B</div>
                  <div ref={hostB} className="min-h-[180px]" />
                </div>
              )}
            </div>
          </div>

          {compareOn && summaryA && summaryB && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[.08] p-3">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <Trophy className="h-4 w-4" /> Race — {syncMode === 'work' ? 'synchronised by expansions' : syncMode === 'normalized' ? 'normalised progress' : 'synchronised by step'}
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                {(['A', 'B'] as const).map((pane) => {
                  const s = pane === 'A' ? summaryA : summaryB;
                  const best = pane === winner;
                  return (
                    <div key={pane} className={`rounded-xl border p-2 font-mono ${best ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-200 dark:border-white/10'}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-bold">Pane {pane}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${s.found === false ? 'bg-rose-500/20 text-rose-600' : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'}`}>
                          {s.found === undefined ? (s.pattern ?? 'ready') : s.found ? 'found' : 'no path'}
                        </span>
                      </div>
                      {s.l1HitRate !== undefined ? (
                        <>L1 hit <b>{(Number(s.l1HitRate) * 100).toFixed(2)}%</b> · L2 <b>{(Number(s.l2HitRate) * 100).toFixed(1)}%</b><br />
                          AMAT <b>{Number(s.amat).toFixed(1)}</b> · memory <b>{s.memoryAccesses}</b><br /></>
                      ) : (
                        <>cost <b>{s.found ? s.cost : '—'}</b> · optimal <b>{s.optimal ? 'yes' : 'no'}</b><br />
                          expanded <b>{s.expanded}</b> · scanned <b>{s.scanned}</b><br /></>
                      )}
                      {best && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">leader on the active metric</span>}
                    </div>
                  );
                })}
              </div>
              {ms !== null && <div className="mt-2 font-mono text-[10px] text-emerald-700/70 dark:text-emerald-300/70">computed in {ms.toFixed(1)} ms · summary metrics are deterministic; compute time is wall-clock</div>}
            </div>
          )}

          {!compareOn && summaryA && (
            <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
              {Object.entries(summaryA).slice(0, 10).map(([k, v]) => (
                <span key={k} className="rounded-lg bg-slate-900/[.04] px-2 py-1 dark:bg-white/[.06]">
                  {k} <b>{typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2)) : String(v)}</b>
                </span>
              ))}
              {ms !== null && <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300"><Timer className="mr-1 inline h-3 w-3" />{ms.toFixed(1)} ms</span>}
            </div>
          )}

          {/* transport */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <button onClick={toStart} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Start (Home)"><ChevronFirst className="h-4 w-4" /></button>
              <button onClick={() => step(-1)} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Step back (,)"><StepBack className="h-4 w-4" /></button>
              <button onClick={() => setPlaying((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-500 px-3.5 text-[13px] font-bold text-white hover:bg-violet-600" aria-pressed={playing}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => step(1)} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Step (.)"><StepForward className="h-4 w-4" /></button>
              <button onClick={toEnd} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="End (End)"><ChevronLast className="h-4 w-4" /></button>
              <input type="range" min={0} max={Math.max(1, uiMax)} value={Math.min(uiPos, uiMax)} aria-label="Scrub the trace"
                onChange={(e) => seekMaster(Number(e.target.value))} className="min-w-[100px] flex-1"
                style={{ ['--fill' as never]: `${(uiPos / Math.max(1, uiMax)) * 100}%` }} />
              <span className="font-mono text-[11px] whitespace-nowrap text-slate-400">{uiPos}/{uiMax} {syncMode === 'work' ? 'expansions' : syncMode === 'normalized' ? '%' : 'steps'}</span>
              <div className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5 text-slate-400" />
                <div className="flex rounded-lg bg-slate-900/[.05] p-0.5 dark:bg-white/[.07]" role="group" aria-label="Playback rate">
                  {RATES.map((r) => (
                    <button key={r} aria-pressed={rate === r} onClick={() => { setRate(r); if (player.current) player.current.rate = r; }}
                      className={`rounded px-1.5 py-1 font-mono text-[10px] font-bold ${rate === r ? 'bg-white text-slate-900 shadow dark:bg-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{r}</button>
                  ))}
                  <button onClick={() => { const pl = player.current; if (pl) { pl.fitRate(5); setRate(pl.rate); } }} className="rounded px-1.5 py-1 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400" title="Fit the whole trace in 5 seconds">fit</button>
                </div>
              </div>
              <button onClick={copyLink} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-bold text-white ${copied ? 'bg-emerald-500' : 'bg-slate-900 dark:bg-white dark:text-slate-900'}`}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Share'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2 dark:border-white/10">
              {compareSpec && (
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <input type="checkbox" checked={compareOn} onChange={(e) => {
                    const on = e.target.checked;
                    setCompareOn(on);
                    if (on && mode) {
                      const overrides = { ...mode.bDefaults };
                      setBOverrides(overrides);
                      compute(paramsA!, { ...paramsA!, ...mode.bDefaults }, input, seed, true, mode.id, syncMode, overrides);
                    } else {
                      compute(paramsA!, null, input, seed, false, modeId, syncMode, {});
                    }
                  }} /> Compare
                </label>
              )}
              {compareSpec && compareOn && (
                <>
                  <select value={modeId} onChange={(e) => {
                    const m = compareSpec.modes.find((x) => x.id === e.target.value);
                    if (!m) return;
                    setModeId(m.id);
                    const overrides = { ...m.bDefaults };
                    setBOverrides(overrides);
                    compute(paramsA!, { ...paramsA!, ...m.bDefaults }, input, seed, true, m.id, syncMode, overrides);
                  }} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] dark:border-white/15 dark:bg-white/[.06]">
                    {compareSpec.modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                    sync:
                    {(['steps', 'work', 'normalized'] as SyncMode[]).map((m) => (
                      <button key={m} aria-pressed={syncMode === m} onClick={() => {
                        setSyncMode(m);
                        if (group.current) { group.current.mode = m; }
                        positions.current = [0, 0]; setUiPos(0); setUiMax(group.current?.maxFor(m) ?? 1);
                        if (player.current) player.current.setLength(group.current?.maxFor(m) ?? player.current.length);
                        renderAt(0);
                      }} className={`rounded px-1.5 py-0.5 font-bold ${syncMode === m ? 'bg-white text-slate-900 shadow dark:bg-slate-100' : 'text-slate-500'}`}>{m}</button>
                    ))}
                  </div>
                  {mode?.note && <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">{mode.note}</span>}
                </>
              )}
              <button onClick={resetAll} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:border-white/15 dark:text-slate-300">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          </div>
          {loading && <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300">Recomputing trace…</div>}
        </section>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:self-start dark:border-white/10 dark:bg-slate-900">
          <div className="flex border-b border-slate-200 dark:border-white/10" role="tablist">
            <TabBtn active={tab === 'controls'} onClick={() => setTab('controls')} icon={<SlidersHorizontal className="h-4 w-4" />} label="Controls" />
            <TabBtn active={tab === 'log'} onClick={() => setTab('log')} icon={<ScrollText className="h-4 w-4" />} label="Step log" />
            <TabBtn active={tab === 'concepts'} onClick={() => setTab('concepts')} icon={<BookOpen className="h-4 w-4" />} label="Concepts" />
          </div>
          <div className="nice-scroll max-h-[760px] overflow-y-auto p-4">
            {tab === 'controls' && paramsA && (
              <div className="space-y-5">
                <Controls schema={filteredSchema(sharedKeys) as never} params={sliceParams(paramsA, sharedKeys)} onChange={(k, v) => changeParam('shared', String(k), v)} />
                {compareOn && mode && paneKeys.length > 0 && (
                  <div className="space-y-4 rounded-xl border border-violet-500/30 bg-violet-500/[.06] p-3">
                    <div>
                      <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-300">Pane A</div>
                      <Controls schema={filteredSchema(paneKeys as string[]) as never} params={sliceParams(paramsA, paneKeys as string[])} onChange={(k, v) => changeParam('a', String(k), v)} />
                    </div>
                    <div className="border-t border-violet-500/20 pt-3">
                      <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-300">Pane B</div>
                      <Controls schema={filteredSchema(paneKeys as string[]) as never} params={sliceParams(effectiveB!, paneKeys as string[])} onChange={(k, v) => changeParam('b', String(k), v)} />
                    </div>
                  </div>
                )}
                {!compareOn && (
                  <div className="rounded-xl bg-slate-900/[.04] p-3 text-[11px] leading-relaxed text-slate-500 dark:bg-white/[.06] dark:text-slate-400">
                    <b>Input editing:</b> paint walls/terrain, drag S/G, then generate a maze above the map. Every edit recomputes the trace (~80 ms debounce) and writes the grid into <code className="font-mono">in=</code> in the URL.
                  </div>
                )}
                <div className="rounded-xl bg-slate-900/[.04] p-3 font-mono text-[11px] text-slate-500 dark:bg-white/[.06] dark:text-slate-400">
                  <div>param hash: <span className="break-all">{encodeState(paramsA, sim.defaultParams, seed).toString()}</span></div>
                  <div className="mt-1">input: <span className="break-all">{sim.input.codec.encode(input).slice(0, 90)}…</span></div>
                </div>
              </div>
            )}
            {tab === 'log' && (
              <div>
                <p className="mb-2 text-[11px] leading-snug text-slate-400">Window around the playhead · click a row to seek. Position {uiPos}/{uiMax}.</p>
                <div className="nice-scroll max-h-[520px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-950 font-mono text-[11px] dark:border-white/10">
                  {logEntries.length === 0 && <p className="p-3 text-slate-500">No step descriptions for this sim.</p>}
                  {logEntries.map((e) => (
                    <button key={e.i} onClick={() => seekMaster(e.i)} className={`flex w-full items-baseline gap-2 px-2.5 py-1 text-left hover:bg-white/[.07] ${e.i === positions.current[0] ? 'bg-violet-500/25 text-white' : 'text-slate-300'}`}>
                      <span className="w-10 shrink-0 text-slate-500">#{e.i}</span>
                      <span className="w-16 shrink-0 truncate text-amber-300/90">{e.cat}</span>
                      <span className="truncate">{e.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === 'concepts' && (
              <div className="space-y-4 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                <p>{sim.about.summary}</p>
                <ul className="space-y-2.5">
                  {sim.about.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" /><span>{b}</span></li>
                  ))}
                </ul>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12px] text-emerald-800 dark:text-emerald-200"><b>Invariant —</b> {sim.about.invariant}</div>
                {sim.concepts && <ConceptsMarkdown text={sim.concepts} />}
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
      className={`inline-flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-[12px] font-bold ${active ? 'border-violet-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 dark:text-slate-500'}`}>
      {icon} {label}
    </button>
  );
}

function ConceptsMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-white/[.07]">
      {text.split(/\n{2,}/).map((block, i) => {
        const t = block.trim();
        if (t.startsWith('## ')) return <h3 key={i} className="text-[14px] font-black text-slate-800 dark:text-white">{t.slice(3)}</h3>;
        return <p key={i} dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code class="font-mono text-[11px]">$1</code>') }} />;
      })}
    </div>
  );
}

