// ─── core/stats.ts — frame-time helpers (pure) ──────────────────────────────

/** Exponential moving average. α ≈ 0.1 smooths without hiding trends. */
export class Ema {
  private value: number | null = null;
  constructor(private alpha = 0.1) {}
  push(v: number): number {
    this.value = this.value === null ? v : this.value + this.alpha * (v - this.value);
    return this.value;
  }
  get current(): number { return this.value ?? 0; }
  reset(): void { this.value = null; }
}

/** Maximum over the last N pushed samples (spike detection for the HUD). */
export class RollingMax {
  private buf: number[] = [];
  constructor(private size = 120) {}
  push(v: number): number {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    return this.current;
  }
  get current(): number {
    let m = 0;
    for (const v of this.buf) if (v > m) m = v;
    return m;
  }
  reset(): void { this.buf = []; }
}

export interface RunnerStats {
  fps: number;
  stepMs: number; // EMA of total stepping time per tick
  renderMs: number; // EMA of render time per tick
  maxFrameMs: number; // rolling max frame delta
  stepsPerFrame: number; // steps executed by the most recent tick
  stepCount: number;
}
