import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Runner } from '../core/runner';
import type { AnySimulation, Metric, RenderContext } from '../core/types';
import { useTheme } from './kit';

export interface StageStats {
  fps: number;
  steps: number;
  time: number;
  metrics: Metric[];
}

interface StageProps {
  sim: AnySimulation;
  params: Record<string, unknown>;
  seed: number;
  paused?: boolean;
  speed?: number;
  /** bump to advance exactly one fixed step (the Step button / `.` shortcut) */
  stepSignal?: number;
  onStats?: (stats: StageStats) => void;
  children?: ReactNode;
  className?: string;
  label?: string;
}

/**
 * The canvas host: HiDPI backing store, world→viewport scaling, the rAF driver
 * and the Runner's render context. `core/` stays free of `requestAnimationFrame`
 * — this file is the only place that owns a frame loop.
 */
export function SimStage({
  sim,
  params,
  seed,
  paused = false,
  speed = 1,
  stepSignal = 0,
  onStats,
  children,
  className = '',
  label,
}: StageProps) {
  const { theme } = useTheme();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statsRef = useRef(onStats);
  const mountedStep = useRef(stepSignal);

  useEffect(() => {
    statsRef.current = onStats;
  }, [onStats]);

  // One Runner per simulation instance; params/seed flow in through reset().
  const runner = useMemo(
    () => new Runner(sim as never, params as never, seed, null),
    [sim, params, seed],
  );

  useEffect(() => {
    runner.reset(params as never, seed);
     
  }, [runner, params, seed]);

  useEffect(() => {
    runner.paused = paused;
    if (!paused) runner.draw();
  }, [runner, paused]);

  useEffect(() => {
    runner.speed = speed;
  }, [runner, speed]);

  useEffect(() => {
    if (stepSignal === mountedStep.current) return;
    mountedStep.current = stepSignal;
    runner.stepOnce();
  }, [runner, stepSignal]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const world = sim.world;
    const rc: RenderContext = { ctx, width: world.w, height: world.h, theme };
    runner.setRenderContext(rc);

    const layout = (): void => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));

      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const s = Math.min(cssW / world.w, cssH / world.h);
      const ox = (cssW - world.w * s) / 2;
      const oy = (cssH - world.h * s) / 2;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      runner.draw();
    };

    layout();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
    observer?.observe(wrap);
    window.addEventListener('resize', layout);

    // ---- frame loop (the only rAF owner in the app) ----
    let raf = 0;
    let running = true;
    const frame = (ts: number): void => {
      if (!running) return;
      runner.tick(ts);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVisibility = (): void => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const stats = window.setInterval(() => {
      const metrics = sim.metrics ? sim.metrics(runner.state) : [];
      statsRef.current?.({ fps: runner.fps, steps: runner.stepCount, time: runner.simTime, metrics });
    }, 180);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', layout);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(stats);
      runner.setRenderContext(null);
    };
  }, [runner, sim, theme]);

  return (
    <div ref={wrapRef} className={`relative h-full w-full ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label={label ?? sim.meta.title} />
      {children}
    </div>
  );
}