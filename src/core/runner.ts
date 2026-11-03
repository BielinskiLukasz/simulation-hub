// ─── Simulation Hub · core/runner.ts ────────────────────────────────────────
// Fixed-timestep loop controller. tick() is PURE timing logic (unit-testable
// without requestAnimationFrame); start()/stop() are the thin rAF wrapper.
// 60 Hz physics at 60 Hz, 144 Hz, or throttled 30 Hz displays — identically.

import type { RenderContext, Simulation } from './types';
import { createRng } from './rng';

export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.25; // clamp after the tab was in the background
export const MAX_STEPS_PER_FRAME = 8;

export class Runner<P, S> {
  state: S;
  paused = false;
  speed = 1;
  stepCount = 0;
  /** Optional hook (UI stats). Called after every rendered frame, not every step. */
  onFrame: (() => void) | null = null;

  private acc = 0;
  private lastTs: number | null = null;
  private rafId = 0;
  private running = false;

  constructor(
    private sim: Simulation<P, S>,
    private params: P,
    private seed: number,
    private getContext: () => RenderContext,
  ) {
    this.state = sim.init(params, createRng(seed));
  }

  get currentParams(): P { return this.params; }
  get currentSeed(): number { return this.seed; }
  get simTime(): number { return this.stepCount * FIXED_DT; }

  /** Pure timing core — drive it by hand in tests, by rAF in the browser. */
  tick(tsMs: number): void {
    if (this.lastTs === null) this.lastTs = tsMs;
    const frameDt = Math.min(Math.max((tsMs - this.lastTs) / 1000, 0), MAX_FRAME_DT);
    this.lastTs = tsMs;

    if (!this.paused) {
      this.acc += frameDt * this.speed;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        this.advance();
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0; // drop backlog: no spiral of death
    }
    this.sim.render(this.state, this.getContext());
    this.onFrame?.();
  }

  stepOnce(): void {
    this.advance();
    this.sim.render(this.state, this.getContext());
    this.onFrame?.();
  }

  renderOnce(): void {
    this.sim.render(this.state, this.getContext());
  }

  reset(params: P = this.params, seed: number = this.seed): void {
    this.params = params;
    this.seed = seed;
    this.state = this.sim.init(params, createRng(seed));
    this.stepCount = 0;
    this.acc = 0;
    this.lastTs = null;
    this.sim.render(this.state, this.getContext());
    this.onFrame?.();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = null;
    const frame = (ts: number) => {
      if (!this.running) return;
      this.tick(ts);
      // eslint-disable-next-line no-restricted-globals -- rAF wrapper lives here; tick() above is the pure, tested core
      this.rafId = requestAnimationFrame(frame);
    };
    // eslint-disable-next-line no-restricted-globals
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private advance(): void {
    this.state = this.sim.step(this.state, FIXED_DT);
    this.stepCount++;
  }
}
