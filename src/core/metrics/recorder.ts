// ─── core/metrics/recorder.ts — columnar, truncatable metric recorder ─────
// Grid sampling for event sims: sample at t = 0, step, 2·step, … ≤ now with
// the piecewise-constant state. Idempotent (no duplicate grid times) and
// truncatable for seek-back/branching. Realtime sims append by step count.

export class MetricsRecorder {
  readonly ids: string[];
  readonly times: Float64Array;
  private cols: Float64Array[];
  private n = 0;
  private step: number;
  private nextGrid = 0;
  capped = false;

  constructor(ids: string[], dt: number, capacity = 50000, private policy: 'cap' | 'decimate' = 'cap') {
    if (!(dt > 0)) throw new Error('MetricsRecorder: dt must be > 0');
    this.ids = ids;
    this.step = dt;
    this.times = new Float64Array(capacity);
    this.cols = ids.map(() => new Float64Array(capacity));
  }

  get length(): number { return this.n; }
  get interval(): number { return this.step; }

  private write(t: number, values: ArrayLike<number>): void {
    if (this.n >= this.times.length) {
      if (this.policy === 'cap') { this.capped = true; return; }
      let w = 0;
      for (let i = 0; i < this.n; i += 2, w++) {
        this.times[w] = this.times[i]!;
        for (let c = 0; c < this.cols.length; c++) this.cols[c]![w] = this.cols[c]![i]!;
      }
      this.n = w;
      this.step *= 2;
    }
    this.times[this.n] = t;
    for (let c = 0; c < this.cols.length; c++) this.cols[c]![this.n] = values[c] ?? NaN;
    this.n++;
  }

  fill(now: number, values: ArrayLike<number>): void {
    while (this.nextGrid <= now + 1e-9 && !this.capped) {
      this.write(this.nextGrid, values);
      this.nextGrid += this.step;
    }
  }

  appendStep(stepCount: number, every: number, values: ArrayLike<number>): void {
    if (every <= 0 || stepCount % every !== 0) return;
    this.write(stepCount / every, values);
  }

  truncateAfter(time: number): void {
    let lo = 0; let hi = this.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid]! <= time + 1e-9) lo = mid + 1; else hi = mid;
    }
    this.n = lo;
    this.nextGrid = this.n > 0 ? this.times[this.n - 1]! + this.step : 0;
    this.capped = false;
  }

  col(id: string): Float64Array {
    const i = this.ids.indexOf(id);
    return i < 0 ? new Float64Array(0) : this.cols[i]!.subarray(0, this.n);
  }

  view(): { length: number; times: Float64Array; col(id: string): Float64Array } {
    return {
      length: this.n,
      times: this.times.subarray(0, this.n),
      col: (id: string) => this.col(id),
    };
  }

  toCsv(): string {
    const lines = [`time,${this.ids.join(',')}`];
    for (let i = 0; i < this.n; i++) {
      const row = [String(this.times[i])];
      for (const c of this.cols) {
        const v = c[i]!;
        row.push(Number.isNaN(v) ? '' : String(v));
      }
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }
}
