// ─── Simulation Hub · core/runner.ts — v2 ───────────────────────────────────
// Fixed-timestep loop controller.
//  • tick() is pure timing logic (tests drive it by hand, no rAF)
//  • clock is INJECTED (production: performance.now, tests: a fake)
//  • stats: fps / stepMs / renderMs EMAs + rolling max frame time
//  • pointer events are queued and applied at the START of the next tick,
//    before stepping — input always lands on a step boundary (Phase 3 replay)
//  • applyLiveParams() hot-updates live params via sim.applyParams, no re-init

import type { RealtimeSimulation, RenderContext } from './types';
import type { PointerEv } from './input';
import { createRng } from './rng';
import { Ema, RollingMax, type RunnerStats } from './stats';

export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.25;
export const MAX_STEPS_PER_FRAME = 8;

export interface RunnerOptions {
  now?: () => number; // milliseconds
}

export class Runner<P, S> {
  state: S;
  paused = false;
  speed = 1;
  stepCount = 0;
  onFrame: (() => void) | null = null;

  private acc = 0;
  private lastTs: number | null = null;
  private rafId = 0;
  private running = false;
  private queue: PointerEv[] = [];
  private now: () => number;

  private fpsEma = new Ema(0.08);
  private stepEma = new Ema(0.1);
  private renderEma = new Ema(0.1);
  private frameMax = new RollingMax(120);
  private lastSteps = 0;

  constructor(
    private sim: RealtimeSimulation<P, S>,
    private params: P,
    private seed: number,
    private getContext: () => RenderContext,
    opts: RunnerOptions = {},
  ) {
    this.now = opts.now ?? (() => performance.now());
    this.state = sim.init(params, createRng(seed));
  }

  get currentParams(): P { return this.params; }
  get currentSeed(): number { return this.seed; }
  get simTime(): number { return this.stepCount * FIXED_DT; }

  get stats(): RunnerStats {
    return {
      fps: this.fpsEma.current,
      stepMs: this.stepEma.current,
      renderMs: this.renderEma.current,
      maxFrameMs: this.frameMax.current,
      stepsPerFrame: this.lastSteps,
      stepCount: this.stepCount,
    };
  }

  /** Queue a pointer event. While paused it is applied immediately + re-rendered. */
  pointer(ev: PointerEv): void {
    if (!this.sim.onPointer) return;
    if (this.paused) {
      this.state = this.sim.onPointer(this.state, ev);
      this.renderNow();
    } else {
      this.queue.push(ev);
    }
  }

  tick(tsMs: number): void {
    if (this.lastTs === null) this.lastTs = tsMs;
    const rawDelta = tsMs - this.lastTs;
    const frameDt = Math.min(Math.max(rawDelta / 1000, 0), MAX_FRAME_DT);
    this.lastTs = tsMs;
    if (rawDelta > 0) {
      this.fpsEma.push(1000 / rawDelta);
      this.frameMax.push(rawDelta);
    }

    // input lands on a step boundary, before any stepping, in order
    if (this.queue.length > 0 && this.sim.onPointer) {
      for (const ev of this.queue) this.state = this.sim.onPointer(this.state, ev);
      this.queue.length = 0;
    }

    let steps = 0;
    if (!this.paused) {
      this.acc += frameDt * this.speed;
      const t0 = this.now();
      while (this.acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        this.advance();
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      if (steps > 0) this.stepEma.push(this.now() - t0);
    }
    this.lastSteps = steps;
    this.renderNow();
    this.onFrame?.();
  }

  stepOnce(): void {
    if (this.queue.length > 0 && this.sim.onPointer) {
      for (const ev of this.queue) this.state = this.sim.onPointer(this.state, ev);
      this.queue.length = 0;
    }
    this.advance();
    this.renderNow();
    this.onFrame?.();
  }

  renderOnce(): void { this.renderNow(); }

  /** Hot-update: only for params marked live. Falls back to caller for re-init decisions. */
  applyLiveParams(params: P): void {
    this.params = params;
    if (this.sim.applyParams) {
      this.state = this.sim.applyParams(this.state, params);
      this.renderNow();
      this.onFrame?.();
    }
  }

  reset(params: P = this.params, seed: number = this.seed): void {
    this.params = params;
    this.seed = seed;
    this.state = this.sim.init(params, createRng(seed));
    this.stepCount = 0;
    this.acc = 0;
    this.lastTs = null;
    this.queue.length = 0;
    this.renderNow();
    this.onFrame?.();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = null;
    const frame = (ts: number) => {
      if (!this.running) return;
      this.tick(ts);
      // eslint-disable-next-line no-restricted-globals -- rAF wrapper; tick() is the pure core
      this.rafId = requestAnimationFrame(frame);
    };
    // eslint-disable-next-line no-restricted-globals
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private renderNow(): void {
    const t0 = this.now();
    this.sim.render(this.state, this.getContext());
    this.renderEma.push(this.now() - t0);
  }

  private advance(): void {
    this.state = this.sim.step(this.state, FIXED_DT);
    this.stepCount++;
  }
}
