// ─── ui/event-page.tsx — shell for kind:'event' sims (Contract v3) ──────────
// Player-driven: canvas render, timeline (click-to-seek), virtualized event
// log, scrubber + step back/forward, branching actions, invariant badge,
// concepts tab, and sim extra tabs (compare). Dispose cancels everything.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, BookOpen, Check, ChevronFirst, ChevronLast, Download, Gauge,
  Hash, Link2, ListFilter, MousePointer2, Pause, Play, RotateCcw, ScrollText,
  ShieldCheck, ShieldAlert, SlidersHorizontal, StepBack, StepForward, Table2,
} from 'lucide-react';
import type { EventSimulation, LogEntry, SimEntry, ThemeName } from '../core/types';
import { Player } from '../core/des/player';
import { filterLog } from '../core/des/log-filter';
import { decodeState, encodeState } from '../core/url-state';
import { buildHash } from '../core/router';
import { Controls } from './controls';
import { ProcessTableEditor } from './process-table';
import { mountTimeline, type TimelineHandle } from './timeline';
import { MetricsRecorder } from '../core/metrics/recorder';
import { Dashboard } from './dashboard';
import { BatchPanel } from './batch-panel';

const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 20] as const;
const WORLD = { w: 800, h: 600 };
type Tab = 'controls' | 'actions' | 'log' | 'concepts' | 'extra' | 'editor' | 'stats' | 'batch';

export function EventPage({ entry, sim, query, theme }: { entry: SimEntry; sim: EventSimulation<any, any, any, any>; query: URLSearchParams; theme: ThemeName }) {
  const [params, setParams] = useState<Record<string, any> | null>(null);
  const [input, setInput] = useState<unknown>(null);
  const [seed, setSeed] = useState(42);
  const [tab, setTab] = useState<Tab>('controls');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [, setUiTick] = useState(0);
  const bump = useCallback(() => { setUiTick((v) => v + 1); setRecRev((v) => v + 1); }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timelineHostRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<TimelineHandle | null>(null);
  const extraHostRef = useRef<HTMLDivElement>(null);
  const extraRef = useRef<{ dispose(): void } | null>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{ dispose(): void } | null>(null);
  const inputRef = useRef<unknown>(null);
  const playerRef = useRef<Player<any, any, any, any> | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const lastHeadRef = useRef(-1);
  const recorderRef = useRef<MetricsRecorder | null>(null);
  const metricsBufRef = useRef<Float64Array>(new Float64Array(0));
  const [recRev, setRecRev] = useState(0);

  const syncUrl = useCallback((p: Record<string, any>, s: number) => {
    const qs = encodeState(p, sim.defaultParams, s);
    const player = playerRef.current;
    if (player && player.inputLog.length > 0) {
      const encoded = JSON.stringify(player.inputLog.map((i) => ({ at: i.atEvent, a: i.action })));
      if (encoded.length <= 1800) qs.set('actions', encoded); // longer sessions: Export JSON
    }
    if (sim.input && inputRef.current !== null && inputRef.current !== undefined) {
      try {
        const encodedInput = sim.input.codec.encode(inputRef.current);
        if (encodedInput && encodedInput.length <= 120000) qs.set('in', encodedInput);
      } catch { /* unencodable input stays out of the URL */ }
    }
    history.replaceState(null, '', buildHash(entry.meta.id, qs));
  }, [entry.meta.id, sim]);

  const doAct = useCallback((action: unknown) => {
    const player = playerRef.current;
    if (!player) return;
    recorderRef.current?.truncateAfter(player.now);
    const res = player.act(action);
    if (res.branched) {
      setToast(`Branched at event ${player.head}: discarded the old future (${res.discarded} later input${res.discarded === 1 ? '' : 's'})`);
      window.setTimeout(() => setToast(''), 4200);
    }
    if (params) syncUrl(params, seed);
    bump();
  }, [bump, params, seed, syncUrl]);

  // ── player + canvas + timeline lifecycle ──────────────────────────────────
  useEffect(() => {
    const decoded = decodeState(query, sim.defaultParams, sim.paramSchema);
    setParams(decoded.params);
    setSeed(decoded.seed);
    let initialInput: unknown;
    if (sim.input) {
      initialInput = sim.input.initial(decoded.seed);
      const rawIn = query.get('in');
      if (rawIn) {
        const parsed = sim.input.codec.decode(rawIn);
        if (parsed !== null) initialInput = parsed;
      }
      // Input generators double as example loaders (Circuit).
      const genId = query.get('gen');
      const generator = sim.input.generators?.find((g) => g.id === genId);
      if (generator) initialInput = generator.generate(initialInput, { ...generator.defaults }, { next: () => 0, range: (a: number) => a, int: (a: number) => a, pick: (items: readonly unknown[]) => items[0], state: () => decoded.seed } as never);
      inputRef.current = initialInput;
      setInput(initialInput);
    }
    const player = new Player(sim, decoded.params, decoded.seed, { snapshotEvery: 200, input: initialInput });
    playerRef.current = player;
    if (sim.metrics) {
      const spec = sim.metrics;
      const dt = spec.every.by === 'time' ? spec.every.dt : 1;
      recorderRef.current = new MetricsRecorder(spec.metrics.map((m) => m.id), dt, 50000, spec.policy ?? 'cap');
      metricsBufRef.current = new Float64Array(spec.metrics.length);
      const rec = recorderRef.current;
      spec.sample(player.state, player.shared, metricsBufRef.current);
      rec.fill(player.now, metricsBufRef.current);
    }

    // replay a shared session's inputs, if the link carries them
    try {
      const raw = query.get('actions');
      if (raw) {
        const inputs = JSON.parse(raw) as { at: number; a: unknown }[];
        const sorted = [...inputs].sort((x, y) => x.at - y.at);
        for (const input of sorted) {
          while (player.head < input.at && player.stepEvent()) { /* advance */ }
          if (player.head === input.at) player.act(input.a);
        }
        setPlaying(false);
      }
    } catch { /* malformed actions param: start fresh */ }

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    let raf = 0;
    let lastTs: number | null = null;
    let ro: ResizeObserver | null = null;
    if (canvas && wrap) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
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
        ro = new ResizeObserver(fit);
        ro.observe(wrap);
        const frame = (ts: number) => {
          if (lastTs === null) lastTs = ts;
          const dt = Math.min((ts - lastTs) / 1000, 0.1);
          lastTs = ts;
          if (playingRef.current) player.advance(dt, speedRef.current);
          sim.render(player.state, { ctx, width: WORLD.w, height: WORLD.h, theme: themeRef.current }, { now: player.now, head: player.head }, player.shared);
          if (recorderRef.current && sim.metrics) {
            try { sim.metrics.sample(player.state, player.shared, metricsBufRef.current); recorderRef.current.fill(player.now, metricsBufRef.current); } catch { /* transient during reset */ }
          }
          timelineRef.current?.setPlayhead(player.now);
          if (player.head !== lastHeadRef.current) {
            lastHeadRef.current = player.head;
            if (sim.deriveTimeline && timelineRef.current) {
              timelineRef.current.setData(sim.deriveTimeline(player.log, player.now, player.params_, player.shared), player.now);
            }
            bump();
          }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      }
    }
    if (timelineHostRef.current && sim.deriveTimeline) {
      timelineRef.current = mountTimeline(timelineHostRef.current, {
        theme: themeRef.current,
        follow: true,
        onSeek: (t) => { player.seekTime(Math.floor(t)); recorderRef.current?.truncateAfter(player.now); setPlaying(false); bump(); },
      });
      timelineRef.current.setData(sim.deriveTimeline(player.log, player.now, player.params_, player.shared), player.now);
    }
    bump();
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      timelineRef.current?.dispose();
      timelineRef.current = null;
      extraRef.current?.dispose();
      extraRef.current = null;
      playerRef.current = null;
    };
    // deps: sim identity — params/seed decoded once per navigation
  }, [sim, entry, query, bump]);

  // theme → timeline recolor
  useEffect(() => { timelineRef.current?.setTheme(theme); }, [theme]);

  // extra tab mount/dispose
  useEffect(() => {
    if (tab !== 'extra' || !sim.mountExtraTab || !extraHostRef.current || !params) return;
    extraRef.current = sim.mountExtraTab(extraHostRef.current, { params, seed, theme, input: inputRef.current, state: playerRef.current?.state, shared: playerRef.current?.shared } as never);
    return () => { extraRef.current?.dispose(); extraRef.current = null; };
  }, [tab, sim, params, seed, theme, input]);

  // Contract v5 custom editor (Circuit netlist editor)
  useEffect(() => {
    const editorSpec = sim.input?.editor;
    if (tab !== 'editor' || !editorHostRef.current || !editorSpec || !('kind' in editorSpec)) return;
    const spec = editorSpec;
    const handle = spec.mount(editorHostRef.current, {
      getInput: () => inputRef.current,
      commit: (next: unknown, _label: string) => {
        void _label;
        inputRef.current = next;
        setInput(next);
        if (params) {
          playerRef.current?.reset(params, seed, next);
          setPlaying(true);
          lastHeadRef.current = -1;
          syncUrl(params, seed);
        }
        bump();
      },
      camera: { get: () => ({ cx: 0, cy: 0, zoom: 1 }), set: () => undefined, viewport: () => ({ scale: 1, offsetX: 0, offsetY: 0 }) },
      signals: () => (playerRef.current && sim.getSignals ? sim.getSignals(playerRef.current.state, playerRef.current.shared) : null),
      act: (action: unknown) => doAct(action),
    });
    editorRef.current = handle;
    return () => { handle.dispose(); editorRef.current = null; };
  }, [tab, sim, params, seed, bump, doAct, syncUrl]);

  const player = playerRef.current;
  const head = player?.head ?? 0;
  const maxComputed = player?.maxComputed ?? 0;
  const now = player?.now ?? 0;
  const finished = player?.finished ?? false;
  const violations = useMemo(() => player?.invariantViolations() ?? [], [player, head]);
  const stats = player && sim.getStats ? sim.getStats(player.state) : null;
  const actions = player && sim.getActions ? sim.getActions(player.state, player.shared) : [];

  const applyParamsAndReset = useCallback((next: Record<string, any>, s: number) => {
    setParams(next);
    playerRef.current?.reset(next, s);
    setPlaying(true);
    lastHeadRef.current = -1;
    syncUrl(next, s);
    bump();
  }, [bump, syncUrl]);

  const onControlChange = useCallback((key: string, value: unknown) => {
    setParams((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      playerRef.current?.reset(next, seed);
      setPlaying(true);
      lastHeadRef.current = -1;
      syncUrl(next, seed);
      bump();
      return next;
    });
  }, [bump, seed, syncUrl]);

  const copyLink = useCallback(async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { /* url in bar */ }
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const p = playerRef.current;
      if (!p) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying((v) => !v); }
      else if (e.key === '.') { p.stepEvent(); setPlaying(false); bump(); }
      else if (e.key === ',') { p.stepBack(); setPlaying(false); bump(); }
      else if (e.key === 'Home') { p.seekEvent(0); bump(); }
      else if (e.key === 'End') { p.seekEvent(p.maxComputed); bump(); }
      else if (e.key === 'l' || e.key === 'L') setTab('log');
      else if (e.key === 'r' || e.key === 'R') { if (params) applyParamsAndReset(params, seed); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyParamsAndReset, bump, params, seed]);

  const onCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sim.onCanvasAction || !player) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WORLD.w;
    const y = ((e.clientY - rect.top) / rect.height) * WORLD.h;
    const action = sim.onCanvasAction(player.state, x, y, { shift: e.shiftKey, alt: e.altKey, button: e.button }, player.shared);
    if (action) doAct(action);
  };

  const meta = entry.meta;
  const textEditorDef = params ? Object.entries(sim.paramSchema as Record<string, { kind: string; editor?: string }>)
    .find(([, d]) => d.kind === 'text' && d.editor === 'process-table') : undefined;

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
        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-black tracking-wider text-rose-700 uppercase dark:text-rose-300">Event-driven</span>
        {sim.invariants && (
          <button onClick={() => setTab('log')} title={violations.length ? violations[0]!.message : 'All invariants hold at this position'}
            className={`ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${violations.length ? 'bg-rose-500 text-white' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
            {violations.length ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {violations.length ? `${violations.length} invariant violation${violations.length > 1 ? 's' : ''}` : `${sim.invariants.length} invariants hold`}
          </button>
        )}
        <span className="ml-auto hidden font-mono text-[11px] text-slate-400 lg:inline dark:text-slate-500">Space play · . step · , back · Home/End · L log · R reset</span>
      </div>

      {toast && (
        <div className="fade-up mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13px] font-semibold text-amber-800 dark:text-amber-200" role="status">{toast}</div>
      )}
      {finished && head >= maxComputed && (
        <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-[13px] font-semibold text-emerald-800 dark:text-emerald-200">
          Simulation finished at t={Math.floor(now)}{sim.playback.unit} after {head} events. Time-travel still works — scrub back and branch.
        </div>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div ref={wrapRef} className="relative w-full bg-[#0b0f17]">
              <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: '4 / 3' }} aria-label={`${meta.title} canvas`}
                onPointerDown={onCanvasPointer} onContextMenu={(e) => e.preventDefault()} />
              <span className="absolute top-3 left-3 rounded-md bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-200">
                t={Math.floor(now)}{sim.playback.unit} · event {head}/{maxComputed}
              </span>
              {stats && (
                <span className="absolute right-3 bottom-3 flex gap-1.5">
                  {Object.entries(stats).slice(0, 5).map(([k, v]) => (
                    <span key={k} className="rounded-md bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-200">{k} <b className="text-amber-300">{String(v)}</b></span>
                  ))}
                </span>
              )}
              {sim.onCanvasAction && (
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 font-mono text-[10px] text-slate-300">
                  <MousePointer2 className="h-3 w-3" /> click the canvas to act (recorded in the input log)
                </span>
              )}
            </div>

            {/* transport */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2.5 dark:border-white/10">
              <button onClick={() => { player?.seekEvent(0); setPlaying(false); bump(); }} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Jump to start (Home)"><ChevronFirst className="h-4 w-4" /></button>
              <button onClick={() => { player?.stepBack(); setPlaying(false); bump(); }} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Step back one event (,)"><StepBack className="h-4 w-4" /></button>
              <button onClick={() => setPlaying((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-500 px-3.5 text-[13px] font-bold text-white transition hover:bg-rose-600" aria-pressed={!playing}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => { player?.stepEvent(); setPlaying(false); bump(); }} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Step one event (.)"><StepForward className="h-4 w-4" /></button>
              <button onClick={() => { player?.seekEvent(player.maxComputed); bump(); }} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Jump to furthest computed (End)"><ChevronLast className="h-4 w-4" /></button>
              <input
                type="range" min={0} max={Math.max(maxComputed, 0)} value={head} aria-label="Scrub through events"
                onChange={(e) => { player?.seekEvent(Number(e.target.value)); setPlaying(false); bump(); }}
                className="min-w-[120px] flex-1"
                style={{ ['--fill' as never]: `${maxComputed ? (head / maxComputed) * 100 : 0}%` }}
              />
              <span className="font-mono text-[11px] whitespace-nowrap text-slate-400 dark:text-slate-500">ev {head}/{maxComputed}</span>
              <div className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5 text-slate-400" />
                <div className="flex rounded-lg bg-slate-900/[.05] p-0.5 dark:bg-white/[.07]" role="group" aria-label="Playback speed">
                  {SPEEDS.map((s) => (
                    <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}
                      className={`rounded-md px-1.5 py-1 font-mono text-[10px] font-bold transition ${speed === s ? 'bg-white text-slate-900 shadow dark:bg-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{s}×</button>
                  ))}
                </div>
              </div>
              <button onClick={() => params && applyParamsAndReset(params, seed)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 dark:border-white/15 dark:text-slate-300" title="Reset (R)">
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
              <button onClick={copyLink} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white transition ${copied ? 'bg-emerald-500' : 'bg-slate-900 hover:bg-slate-700 dark:bg-white dark:text-slate-900'}`}>
                {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>

          {/* timeline */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-white/10">
              <h2 className="text-[12px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">Timeline — click to seek · wheel zooms · drag pans · double-click fits</h2>
              <span className="font-mono text-[11px] text-slate-400">playhead t={Math.floor(now)}{sim.playback.unit}</span>
            </div>
            {sim.deriveTimeline
              ? <div ref={timelineHostRef} className="h-[168px] w-full" />
              : <p className="px-4 py-5 text-[13px] text-slate-400">This sim does not derive a timeline.</p>}
          </div>
        </section>

        {/* side tabs */}
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:self-start dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap border-b border-slate-200 dark:border-white/10" role="tablist" aria-label="Event panel">
            <TabBtn active={tab === 'controls'} onClick={() => setTab('controls')} icon={<SlidersHorizontal className="h-4 w-4" />} label="Controls" />
            {actions.length > 0 && <TabBtn active={tab === 'actions'} onClick={() => setTab('actions')} icon={<MousePointer2 className="h-4 w-4" />} label="Actions" />}
            <TabBtn active={tab === 'log'} onClick={() => setTab('log')} icon={<ScrollText className="h-4 w-4" />} label="Event log" />
            <TabBtn active={tab === 'concepts'} onClick={() => setTab('concepts')} icon={<BookOpen className="h-4 w-4" />} label="Concepts" />
            {sim.mountExtraTab && <TabBtn active={tab === 'extra'} onClick={() => setTab('extra')} icon={<Table2 className="h-4 w-4" />} label={sim.extraTabLabel ?? 'Compare'} />}
            {(sim.input?.editor as { kind?: string } | undefined)?.kind === 'custom' && <TabBtn active={tab === 'editor'} onClick={() => setTab('editor')} icon={<MousePointer2 className="h-4 w-4" />} label="Editor" />}
          </div>

          <div className="nice-scroll max-h-[780px] overflow-y-auto p-4">
            {tab === 'controls' && (
              params ? (
                <div className="space-y-5">
                  <Controls schema={sim.paramSchema} params={params} onChange={(k, v) => onControlChange(String(k), v)} />
                  {sim.input?.generators && sim.input.generators.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">Load example / generate</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sim.input.generators.map((g) => (
                          <button key={g.id} onClick={() => {
                            const next = g.generate(inputRef.current, { ...g.defaults }, { next: () => 0, range: (a: number) => a, int: (a: number) => a, pick: (items: readonly unknown[]) => items[0], state: () => seed } as never);
                            inputRef.current = next;
                            setInput(next);
                            playerRef.current?.reset(params, seed, next);
                            setPlaying(true);
                            lastHeadRef.current = -1;
                            syncUrl(params, seed);
                            bump();
                          }} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-500 capitalize hover:border-rose-400 hover:text-rose-500 dark:border-white/15 dark:text-slate-300">{g.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {textEditorDef && (
                    <ProcessTableEditor
                      value={String(params[textEditorDef[0]])}
                      onChange={(v) => onControlChange(textEditorDef[0], v)}
                    />
                  )}
                  <label className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    <Hash className="h-3.5 w-3.5" /> seed
                    <input value={seed} inputMode="numeric" aria-label="Seed"
                      onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (Number.isFinite(n) && params) { setSeed(n); applyParamsAndReset(params, n); } }}
                      className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-[12px] text-slate-700 dark:border-white/15 dark:bg-white/[.06] dark:text-slate-100" />
                  </label>
                  <button onClick={() => { const s = Math.floor(Math.random() * 1_000_000_000); setSeed(s); if (params) applyParamsAndReset(params, s); }}
                    className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-[12px] font-semibold text-slate-500 transition hover:border-rose-400 hover:text-rose-500 dark:border-white/20 dark:text-slate-400">
                    New seed (re-runs from t=0)
                  </button>
                  <p className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">Changing any control resets the event run (params + seed fully determine it). Your actions are recorded in an input log and encoded into the copied link when short enough.</p>
                </div>
              ) : <p className="text-[13px] text-slate-400">Loading…</p>
            )}

            {tab === 'actions' && (
              <div className="space-y-2.5">
                <p className="text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">Actions apply at the current event position and are recorded. Scrub into the past first to branch history.</p>
                {actions.map((a, i) => (
                  <button key={i} onClick={() => doAct(a.action)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-[13px] font-semibold text-slate-700 transition hover:border-rose-400 hover:bg-rose-500/[.06] dark:border-white/10 dark:text-slate-100">
                    {a.label}
                  </button>
                ))}
                {player && player.inputLog.length > 0 && (
                  <div className="rounded-xl bg-slate-900/[.04] p-3 font-mono text-[11px] text-slate-500 dark:bg-white/[.06] dark:text-slate-400">
                    {player.inputLog.length} recorded input{player.inputLog.length === 1 ? '' : 's'} · position {head}/{maxComputed}
                  </div>
                )}
              </div>
            )}

            {tab === 'log' && player && (
              <LogPanel
                log={player.log}
                head={head}
                unit={sim.playback.unit}
                hiddenCats={sim.defaultHiddenCategories ?? []}
                onSeek={(i) => { player.seekEvent(i); setPlaying(false); bump(); }}
                exportData={() => ({ sim: meta.id, params, seed, inputs: player.inputLog, log: player.log })}
              />
            )}

            {tab === 'concepts' && (
              <div className="space-y-4 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                <p>{sim.about.summary}</p>
                <ul className="space-y-2.5">
                  {sim.about.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" /><span>{b}</span></li>
                  ))}
                </ul>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12px] text-emerald-800 dark:text-emerald-200">
                  <b>Tested invariant —</b> {sim.about.invariant}
                </div>
                {sim.concepts && <ConceptsMarkdown text={sim.concepts} />}
              </div>
            )}

            {tab === 'stats' && <Dashboard key={recRev} spec={sim.metrics} rec={recorderRef.current?.view() ?? null} theme={theme} now={player?.now} />}
            {tab === 'batch' && sim.batch && <BatchPanel spec={sim.batch} params={params ?? sim.defaultParams} />}
            {tab === 'extra' && <div ref={extraHostRef} />}
            {tab === 'editor' && <div ref={editorHostRef} />}
          </div>
        </aside>
      </div>
    </main>
  );
}

// ── virtualized, filterable event log ────────────────────────────────────────

const ROW_H = 24;

function LogPanel({ log, head, unit, hiddenCats, onSeek, exportData }: {
  log: readonly LogEntry[];
  head: number;
  unit: string;
  hiddenCats: string[];
  onSeek: (i: number) => void;
  exportData: () => unknown;
}) {
  const [catsOff, setCatsOff] = useState<Set<string>>(() => new Set(hiddenCats));
  const [actor, setActor] = useState<string>('all');
  const [text, setText] = useState('');
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const cats = useMemo(() => [...new Set(log.map((e) => e.cat))].sort(), [log]);
  const actors = useMemo(() => [...new Set(log.map((e) => e.actor))], [log]);

  const indices = useMemo(() => filterLog(log, {
    cats: new Set(cats.filter((c) => !catsOff.has(c))),
    actors: actor === 'all' ? undefined : new Set([actor === 'null' ? null : Number(actor)]),
    text: text || undefined,
  }), [log, cats, catsOff, actor, text]);

  useEffect(() => {
    if (follow && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [indices.length, follow]);

  const H = 460;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4);
  const visibleCount = Math.ceil(H / ROW_H) + 8;
  const slice = indices.slice(start, start + visibleCount);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sim-session.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <ListFilter className="h-3.5 w-3.5 text-slate-400" />
        {cats.map((c) => (
          <button key={c} aria-pressed={!catsOff.has(c)}
            onClick={() => setCatsOff((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${catsOff.has(c) ? 'bg-slate-900/[.05] text-slate-400 line-through dark:bg-white/[.06]' : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'}`}>{c}</button>
        ))}
        <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filter by actor"
          className="ml-auto rounded-md border border-slate-300 bg-white px-1.5 py-1 font-mono text-[11px] dark:border-white/15 dark:bg-white/[.06]">
          <option value="all">all actors</option>
          {actors.map((a) => <option key={String(a)} value={String(a)}>{a === null ? 'system' : `actor ${a}`}</option>)}
        </select>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search log…" aria-label="Search log"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] dark:border-white/15 dark:bg-white/[.06]" />
        <label className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-400">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow
        </label>
        <button onClick={exportJson} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:border-white/15 dark:text-slate-300">
          <Download className="h-3.5 w-3.5" /> JSON
        </button>
      </div>
      <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="nice-scroll overflow-y-auto rounded-xl border border-slate-200 bg-slate-950 font-mono text-[11px] dark:border-white/10" style={{ height: H }} role="list" aria-label="Event log">
        <div style={{ height: indices.length * ROW_H, position: 'relative' }}>
          {slice.map((logIdx, vi) => {
            const e = log[logIdx]!;
            const isCurrent = e.i === head;
            const isPast = e.i <= head;
            return (
              <button key={logIdx} role="listitem" onClick={() => onSeek(e.i)}
                className={`absolute right-0 left-0 flex items-baseline gap-2 px-2.5 text-left ${isCurrent ? 'bg-rose-500/25 text-white' : isPast ? 'text-slate-300 hover:bg-white/[.07]' : 'text-slate-500'}`}
                style={{ top: (start + vi) * ROW_H, height: ROW_H, lineHeight: `${ROW_H}px` }}>
                <span className="w-12 shrink-0 text-slate-500">#{e.i}</span>
                <span className="w-16 shrink-0 text-slate-400">{e.t}{unit}</span>
                <span className="w-16 shrink-0 truncate text-amber-300/90">{e.cat}</span>
                <span className="truncate">{e.text}</span>
              </button>
            );
          })}
          {indices.length === 0 && <p className="px-3 py-4 text-slate-500">No entries match the filters.</p>}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">{indices.length.toLocaleString()} entries · click a row to travel to that event</p>
    </div>
  );
}

// ── tiny markdown-lite renderer for trusted sim-authored concepts ────────────

function ConceptsMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-white/[.07]">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith('## ')) return <h3 key={i} className="text-[14px] font-black text-slate-800 dark:text-white">{t.slice(3)}</h3>;
        return <p key={i} dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code class="font-mono text-[11px]">$1</code>') }} />;
      })}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-[12px] font-bold transition ${active ? 'border-rose-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}>
      {icon} {label}
    </button>
  );
}
