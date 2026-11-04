// ─── core/algo/min-heap.ts — indexed binary heap, deterministic tie-break ──
// Order: (f, h, insertion sequence). decreaseKey is O(log n).

export interface HeapEntry {
  id: number;
  f: number;
  h: number;
}

export class IndexedMinHeap {
  private ids: number[] = [];
  private fs: number[] = [];
  private hs: number[] = [];
  private seqs: number[] = [];
  private pos: Int32Array;
  private seq = 0;

  constructor(capacity: number) {
    this.pos = new Int32Array(capacity).fill(-1);
  }

  get size(): number { return this.ids.length; }
  has(id: number): boolean { return this.pos[id] !== undefined && this.pos[id]! >= 0; }

  private less(i: number, j: number): boolean {
    const fi = this.fs[i]!; const fj = this.fs[j]!;
    if (fi !== fj) return fi < fj;
    const hi = this.hs[i]!; const hj = this.hs[j]!;
    if (hi !== hj) return hi < hj;
    return this.seqs[i]! < this.seqs[j]!;
  }

  private swap(i: number, j: number): void {
    [this.ids[i], this.ids[j]] = [this.ids[j]!, this.ids[i]!];
    [this.fs[i], this.fs[j]] = [this.fs[j]!, this.fs[i]!];
    [this.hs[i], this.hs[j]] = [this.hs[j]!, this.hs[i]!];
    [this.seqs[i], this.seqs[j]] = [this.seqs[j]!, this.seqs[i]!];
    this.pos[this.ids[i]!] = i;
    this.pos[this.ids[j]!] = j;
  }

  push(id: number, f: number, h: number): boolean {
    if (this.pos[id]! >= 0) return this.decreaseKey(id, f, h);
    const i = this.ids.length;
    this.ids.push(id); this.fs.push(f); this.hs.push(h); this.seqs.push(this.seq++);
    this.pos[id] = i;
    this.bubbleUp(i);
    return true;
  }

  decreaseKey(id: number, f: number, h: number): boolean {
    const i = this.pos[id]!;
    if (i < 0) return this.push(id, f, h);
    if (f > this.fs[i]! || (f === this.fs[i] && h >= this.hs[i]!)) return false;
    this.fs[i] = f; this.hs[i] = h;
    this.bubbleUp(i);
    return true;
  }

  pop(): HeapEntry | null {
    if (!this.ids.length) return null;
    const top: HeapEntry = { id: this.ids[0]!, f: this.fs[0]!, h: this.hs[0]! };
    const lastId = this.ids.pop()!;
    const lf = this.fs.pop()!; const lh = this.hs.pop()!; const ls = this.seqs.pop()!;
    this.pos[top.id] = -1;
    if (this.ids.length) {
      this.ids[0] = lastId; this.fs[0] = lf; this.hs[0] = lh; this.seqs[0] = ls;
      this.pos[lastId] = 0;
      this.sink(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  private sink(i: number): void {
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < this.ids.length && this.less(l, m)) m = l;
      if (r < this.ids.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
