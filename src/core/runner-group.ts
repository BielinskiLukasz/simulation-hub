/* eslint-disable @typescript-eslint/no-explicit-any -- lockstep group is type-erased over panes */
// ─── core/runner-group.ts — lockstep group of runners (realtime compare) ──
import { FIXED_DT, MAX_STEPS_PER_FRAME, Runner } from './runner';

export class RunnerGroup {
  paused = false;
  speed = 1;
  private acc = 0;
  private lastTs: number | null = null;

  constructor(readonly runners: Runner<any, any>[]) {}

  get stepCount(): number { return this.runners[0]?.stepCount ?? 0; }

  pointer(ev: Parameters<Runner<any, any>['pointer']>[0]): void {
    for (const r of this.runners) r.pointer(ev);
  }

  edit(edit: Parameters<Runner<any, any>['edit']>[0]): void {
    for (const r of this.runners) r.edit(edit);
  }

  /** Advance all runners by the same number of fixed steps. Returns steps. */
  tick(tsMs: number): number {
    if (this.lastTs === null) this.lastTs = tsMs;
    const frameDt = Math.min(Math.max((tsMs - this.lastTs) / 1000, 0), 0.25);
    this.lastTs = tsMs;
    if (this.paused) return 0;
    this.acc += frameDt * this.speed;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      for (const r of this.runners) r.advanceSteps(1);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    return steps;
  }

  stepOnce(): void { for (const r of this.runners) r.advanceSteps(1); }
  resetAll(params?: unknown, seed?: number): void {
    for (const r of this.runners) r.reset(params as never, seed);
    this.acc = 0;
    this.lastTs = null;
  }
  renderAll(): void { for (const r of this.runners) r.renderOnce(); }
}
