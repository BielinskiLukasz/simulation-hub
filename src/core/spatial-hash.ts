// ─── core/spatial-hash.ts — uniform grid + counting sort ────────────────────
// Rebuilt every step with zero allocations: count → prefix-sum → scatter.
// cols/rows are clamped to ≥ 3 so a wrapped 3×3 query never visits a cell
// twice. Set cellSize ≥ perception radius: then the 3×3 block around any
// point is guaranteed to contain every neighbour within that radius.

export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  private counts: Int32Array;
  /** Prefix sums (length cells+1) — exposed read-only so hot loops can iterate cells directly. */
  readonly start: Int32Array;
  private cursor: Int32Array;
  private cellOf: Int32Array;
  /** Item indices sorted by cell — exposed read-only for allocation-free queries. */
  readonly items: Int32Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly cellSize: number,
    capacity: number,
  ) {
    this.cols = Math.max(3, Math.floor(w / cellSize));
    this.rows = Math.max(3, Math.floor(h / cellSize));
    const cells = this.cols * this.rows;
    this.counts = new Int32Array(cells);
    this.start = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.cellOf = new Int32Array(capacity);
    this.items = new Int32Array(capacity);
  }

  rebuild(x: Float32Array, y: Float32Array, n: number): void {
    this.counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cellIndex(x[i]!, y[i]!);
      this.cellOf[i] = c;
      this.counts[c] = this.counts[c]! + 1;
    }
    let sum = 0;
    for (let c = 0; c < this.counts.length; c++) {
      this.start[c] = sum;
      sum += this.counts[c]!;
    }
    this.start[this.counts.length] = sum;
    this.cursor.set(this.start.subarray(0, this.counts.length));
    for (let i = 0; i < n; i++) {
      const c = this.cellOf[i]!;
      this.items[this.cursor[c]!] = i;
      this.cursor[c] = this.cursor[c]! + 1;
    }
  }

  /** Candidate indices from the wrapped 3×3 block around (px, py). Returns count written to `out`. */
  query(px: number, py: number, out: Int32Array): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(px / this.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(py / this.cellSize)));
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = (cy + dy + this.rows) % this.rows;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = (cx + dx + this.cols) % this.cols;
        const cell = yy * this.cols + xx;
        const end = this.start[cell + 1]!;
        for (let k = this.start[cell]!; k < end && n < out.length; k++) {
          out[n++] = this.items[k]!;
        }
      }
    }
    return n;
  }

  private cellIndex(px: number, py: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(px / this.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(py / this.cellSize)));
    return cy * this.cols + cx;
  }
}
