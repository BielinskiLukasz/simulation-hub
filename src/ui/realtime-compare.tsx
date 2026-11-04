// ─── ui/realtime-compare.tsx — two realtime runners in exact lockstep ──────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Link2, Lock, LockOpen, Pause, Play, RotateCcw, StepForward, Unlink } from 'lucide-react';
import type { Camera as CameraState, RealtimeSimulation, RenderContext, SimEntry, ThemeName } from '../core/types';
import { Runner } from '../core/runner';
import { RunnerGroup } from '../core/runner-group';
import { DiagnosticsRecorder } from '../core/diagnostics';
import { fitRect, followStep, toViewport, visibleWorldRect } from '../core/camera';
import { encodeState } from '../core/url-state';
import { buildHash } from '../core/router';
import { attachCameraControls, type CameraControls } from './camera-controls';
import { bindPointer } from './pointer';
import { Controls } from './controls';
import { DiagnosticsPanel } from './diagnostics-panel';

const WORLD = { w: 800, h: 600 };

export function RealtimeComparePage({ entry, sim, query, theme, params: initialParams, seed, onClose }: {
  entry: SimEntry;
  sim: RealtimeSimulation<any, any>;
  query: URLSearchParams;
  theme: ThemeName;
  params: Record<string, any>;
  seed: number;
  onClose: () => void;
}) {
  const spec = sim.compare!;
  const [modeId, setModeId] = useState(() => query.get('cmp') ?? spec.modes[0]!.id);
  const mode = spec.modes.find((m) => m.id === modeId) ?? spec.modes[0]!;
  const [paramsA, setParamsA] = useState<Record<string, any>>(initialParams);
  const [overrides, setOverrides] = useState<Record<string, any>>(() => {
    const out: Record<string, any> = { ...mode.bDefaults };
    for (const key of mode.paneKeys.map(String)) {
      const raw = query.get(`b.${key}`);
      if (raw === null) continue;
      const def = (sim.paramSchema as Record<string, any>)[key];
      if (!def) continue;
      if (def.kind === 'boolean') out[key] = raw === '1';
      else if (def.kind === 'range' || def.kind === 'number') { const n = Number(raw); if (Number.isFinite(n)) out[key] = n; }
      else if (def.kind === 'select' && def.options.includes(raw)) out[key] = raw;
      else out[key] = raw;
    }
    return out;
  });
  const effectiveB = useMemo(() => ({ ...paramsA, ...mode.bDefaults, ...overrides }), [paramsA, mode, overrides]);
  const [playing, setPlaying] = useState(true);
  const [linked, setLinked] = useState(true);
  const [follow, setFollow] = useState(false);
  const [, setTick] = useState(0);

  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const canvasA = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const groupRef = useRef<RunnerGroup | null>(null);
  const cameras = useRef<CameraState[]>([{ cx: 400, cy: 300, zoom: 1 }, { cx: 400, cy: 300, zoom: 1 }]);
  const recorders = useRef([new DiagnosticsRecorder(), new DiagnosticsRecorder()]);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const linkedRef = useRef(linked);
  linkedRef.current = linked;
  const followRef = useRef(follow);
  followRef.current = follow;

  const syncUrl = useCallback((a: Record<string, any>, ov: Record<string, any>, mId: string) => {
    const qs = encodeState(a, sim.defaultParams, seed);
    qs.set('cmp', mId);
    for (const [k, v] of Object.entries(ov)) qs.set(`b.${k}`, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    history.replaceState(null, '', buildHash(entry.meta.id, qs));
  }, [entry.meta.id, seed, sim]);

  useEffect(() => { syncUrl(paramsA, overrides, modeId); }, [paramsA, overrides, modeId, syncUrl]);

  useEffect(() => {
    const canvases = [canvasA.current!, canvasB.current!];
    const wraps = [hostA.current!, hostB.current!];
    if (!canvases[0] || !canvases[1] || !wraps[0] || !wraps[1]) return;
    let raf = 0;
    const disposers: (() => void)[] = [];
    const paramsList = [paramsA, effectiveB];
    const runners: Runner<any, any>[] = [];

    const makeContext = (pane: number): (() => RenderContext) => () => {
      const canvas = canvases[pane]!;
      const ctx = canvas.getContext('2d')!;
      const camera = cameras.current[pane]!;
      const view = sim.camera ? {
        camera,
        viewport: toViewport(camera, WORLD),
        worldRect: visibleWorldRect(camera, WORLD),
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        px: (n: number) => n / camera.zoom,
      } : undefined;
      return { ctx, width: WORLD.w, height: WORLD.h, theme: themeRef.current, view };
    };

    canvases.forEach((canvas, pane) => {
      const wrap = wraps[pane]!;
      const ctx = canvas.getContext('2d')!;
      const fit = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(wrap.clientWidth, 260);
        const h = Math.round(w * 3 / 4);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.height = `${h}px`;
        ctx.setTransform(canvas.width / WORLD.w, 0, 0, canvas.height / WORLD.h, 0, 0);
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(wrap);
      disposers.push(() => ro.disconnect());

      const runner = new Runner(sim, paramsList[pane], seed, makeContext(pane));
      runners.push(runner);
      if (sim.camera) cameras.current[pane] = sim.camera.initial(runner.state);
      if (sim.diagnostics) {
        const specDiag = sim.diagnostics;
        runner.onStep = () => {
          const every = Math.max(1, specDiag.everySteps(runner.state));
          if (runner.stepCount % every === 0) recorders.current[pane]!.push(specDiag.sample(runner.state));
        };
      }
      if (sim.camera) {
        const controls: CameraControls = attachCameraControls(canvas, {
          getCamera: () => cameras.current[linkedRef.current ? 0 : pane]!,
          setCamera: (c) => {
            if (linkedRef.current) cameras.current = [c, c];
            else cameras.current[pane] = c;
            groupRef.current?.renderAll();
          },
          size: () => WORLD,
          minZoom: sim.camera.minZoom,
          maxZoom: sim.camera.maxZoom,
          usesRightClick: sim.camera.usesRightClick,
          onChange: () => groupRef.current?.renderAll(),
        });
        disposers.push(() => controls.dispose());
      }
      if (sim.onPointer) {
        const unbind = bindPointer(canvas, WORLD, (ev) => groupRef.current?.pointer(ev), sim.camera ? () => toViewport(cameras.current[linkedRef.current ? 0 : pane]!, WORLD) : undefined);
        disposers.push(unbind);
      }
    });

    if (linkedRef.current && cameras.current[0]) cameras.current = [cameras.current[0], cameras.current[0]];
    const group = new RunnerGroup(runners);
    groupRef.current = group;
    group.renderAll();

    let last = performance.now();
    const frame = (ts: number) => {
      void last;
      last = ts;
      if (playingRef.current) group.tick(ts);
      if (followRef.current && sim.camera?.follow) {
        runners.forEach((runner, pane) => {
          const target = sim.camera!.follow!(runner.state);
          if (target) {
            const idx = linkedRef.current ? 0 : pane;
            cameras.current[idx] = followStep(cameras.current[idx]!, target, 1 / 30, 0.35);
            if (linkedRef.current) cameras.current[1] = cameras.current[0]!;
          }
        });
        group.renderAll();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const timer = window.setInterval(() => setTick((v) => v + 1), 300);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      disposers.forEach((d) => d());
      groupRef.current = null;
    };
  }, [sim, paramsA, effectiveB, seed]);

  const group = groupRef.current;
  const sharedKeys = Object.keys(sim.defaultParams).filter((k) => !mode.paneKeys.map(String).includes(k));
  const paneKeys = mode.paneKeys.map(String);
  const filtered = (keys: string[]) => Object.fromEntries(Object.entries(sim.paramSchema as Record<string, any>).filter(([k]) => keys.includes(k)));
  const slice = (p: Record<string, any>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, p[k]]));

  const reset = () => {
    const g = groupRef.current;
    if (!g) return;
    g.runners[0]?.reset(paramsA, seed);
    g.runners[1]?.reset(effectiveB, seed);
    recorders.current = [new DiagnosticsRecorder(), new DiagnosticsRecorder()];
    setTick((v) => v + 1);
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 pt-5 text-[13px]">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-amber-600 dark:text-slate-400">
          <ArrowLeft className="h-4 w-4" /> Single pane
        </button>
        <span className="font-semibold text-slate-800 dark:text-slate-100">{entry.meta.title} — Compare</span>
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-black tracking-wider text-sky-700 uppercase dark:text-sky-300">lockstep</span>
        <select value={modeId} onChange={(e) => { setModeId(e.target.value); const m = spec.modes.find((x) => x.id === e.target.value); if (m) setOverrides({ ...m.bDefaults }); }} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12px] dark:border-white/15 dark:bg-white/[.06]">
          {spec.modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      {mode.note && <p className="mt-2 font-mono text-[11px] text-amber-600 dark:text-amber-400">{mode.note}</p>}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-3">
          <div className="grid gap-3 xl:grid-cols-2">
            {(['A', 'B'] as const).map((label, i) => (
              <div key={label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-white/10">
                  <span className="font-mono text-[11px] font-black">Pane {label}</span>
                  <span className="font-mono text-[10px] text-slate-400">steps {group?.runners[i]?.stepCount ?? 0} · {group?.runners[i]?.stats.stepMs.toFixed(2) ?? '—'} ms</span>
                </div>
                <div ref={i === 0 ? hostA : hostB} className="relative w-full bg-[#0b0f17]">
                  <canvas ref={i === 0 ? canvasA : canvasB} className="block w-full" style={{ aspectRatio: '4 / 3' }} aria-label={`Compare pane ${label}`} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <button onClick={() => setPlaying((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-500 px-3.5 text-[13px] font-bold text-white">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? 'Pause' : 'Play'}
            </button>
            <button onClick={() => groupRef.current?.stepOnce()} className="rounded-lg border border-slate-300 p-2 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Step both (lockstep)"><StepForward className="h-4 w-4" /></button>
            <button onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 dark:border-white/15 dark:text-slate-300"><RotateCcw className="h-4 w-4" /> Reset both</button>
            <span className="font-mono text-[11px] text-slate-400">shared step {group?.stepCount ?? 0} · same seed {seed} · input mirrored</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setLinked((v) => !v)} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold ${linked ? 'border-sky-400 text-sky-600' : 'border-slate-300 text-slate-400 dark:border-white/15'}`} title="Link cameras">
                {linked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />} cameras
              </button>
              <button onClick={() => {
                if (!sim.camera) return;
                const g = groupRef.current;
                const rect = g?.runners[0] ? sim.camera.fit?.(g.runners[0].state) : null;
                if (rect) { const c = fitRect(rect, WORLD, 30, sim.camera); cameras.current = [c, c]; g?.renderAll(); }
              }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:border-white/15 dark:text-slate-300"><Camera className="h-3.5 w-3.5" /> Fit</button>
              {sim.camera?.follow && <button onClick={() => setFollow((v) => !v)} aria-pressed={follow} className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold ${follow ? 'border-sky-400 text-sky-600' : 'border-slate-300 text-slate-400 dark:border-white/15'}`}>Follow</button>}
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400"><Unlink className="h-3 w-3" /> exact lockstep</span>
            </div>
          </div>

          {sim.diagnostics && <DiagnosticsPanel samples={recorders.current[0]!.samples} samplesB={recorders.current[1]!.samples} labelB="B" />}
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 dark:border-white/10 dark:bg-slate-900">
          <h3 className="mb-3 text-[12px] font-black tracking-wider text-slate-500 uppercase dark:text-slate-300">Shared controls</h3>
          <Controls schema={filtered(sharedKeys) as never} params={slice(paramsA, sharedKeys)} onChange={(k, v) => setParamsA((p) => ({ ...p, [String(k)]: v }))} />
          <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 dark:border-white/[.07]">
            <div>
              <div className="mb-2 text-[11px] font-black tracking-wide text-sky-600 uppercase dark:text-sky-300">Pane A</div>
              <Controls schema={filtered(paneKeys) as never} params={slice(paramsA, paneKeys)} onChange={(k, v) => setParamsA((p) => ({ ...p, [String(k)]: v }))} />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-black tracking-wide text-sky-600 uppercase dark:text-sky-300">Pane B</div>
              <Controls schema={filtered(paneKeys) as never} params={slice(effectiveB, paneKeys)} onChange={(k, v) => setOverrides((o) => ({ ...o, [String(k)]: v }))} />
            </div>
          </div>
          <button onClick={() => { void navigator.clipboard.writeText(location.href); }} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-[13px] font-bold text-white dark:bg-white dark:text-slate-900">
            <Link2 className="h-4 w-4" /> Copy compare link
          </button>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">Both runners share one accumulator (RunnerGroup), the same seed, and mirrored pointer input. Pane differences are only the keys above.</p>
        </aside>
      </div>
    </main>
  );
}
