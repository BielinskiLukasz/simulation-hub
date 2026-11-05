// ─── core/stats/moments.ts — mergeable running moments (Welford/Chan) ──────

export class Welford {
  n = 0;
  private _mean = 0;
  private m2 = 0;

  push(x: number): void {
    if (!Number.isFinite(x)) return;
    this.n++;
    const d = x - this._mean;
    this._mean += d / this.n;
    this.m2 += d * (x - this._mean);
  }

  /** Chan et al. parallel merge — numerically stable for large offsets. */
  merge(other: Welford): void {
    if (other.n === 0) return;
    if (this.n === 0) {
      this.n = other.n;
      this._mean = other._mean;
      this.m2 = other.m2;
      return;
    }
    const n = this.n + other.n;
    const d = other._mean - this._mean;
    this.m2 = this.m2 + other.m2 + (d * d * this.n * other.n) / n;
    this._mean += (d * other.n) / n;
    this.n = n;
  }

  get mean(): number { return this._mean; }
  get variance(): number { return this.n > 1 ? this.m2 / (this.n - 1) : 0; }
  get sd(): number { return Math.sqrt(this.variance); }
  get sem(): number { return this.n > 0 ? this.sd / Math.sqrt(this.n) : 0; }
}

export function momentsOf(values: ArrayLike<number>): Welford {
  const w = new Welford();
  for (let i = 0; i < values.length; i++) w.push(values[i]!);
  return w;
}
