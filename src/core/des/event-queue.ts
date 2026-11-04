// ─── core/des/event-queue.ts — binary min-heap, (time, id) order ───────────
// Lazy cancellation: cancelled ids are remembered and dropped on pop.
// Snapshots are plain data (heap array + cancelled set + counters).

export interface QueueItem<E> {
  id: number;
  time: number;
  payload: E;
}

export interface QueueSnapshot<E> {
  heap: QueueItem<E>[];
  cancelled: number[];
  nextId: number;
  live: number;
}

export class EventQueue<E> {
  private heap: QueueItem<E>[] = [];
  private cancelled = new Set<number>();
  private nextId = 1;
  private live = 0;

  push(time: number, payload: E): number {
    const item: QueueItem<E> = { id: this.nextId++, time, payload };
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
    this.live++;
    return item.id;
  }

  pop(): QueueItem<E> | undefined {
    while (this.heap.length > 0) {
      const top = this.heap[0]!;
      this.removeTop();
      if (this.cancelled.has(top.id)) {
        this.cancelled.delete(top.id);
        continue;
      }
      this.live--;
      return top;
    }
    return undefined;
  }

  peekTime(): number | undefined {
    while (this.heap.length > 0 && this.cancelled.has(this.heap[0]!.id)) {
      const top = this.heap[0]!;
      this.removeTop();
      this.cancelled.delete(top.id);
      this.live--;
    }
    return this.heap[0]?.time;
  }

  cancel(id: number): void {
    // Only meaningful for live items; unknown/popped ids are a no-op.
    if (this.cancelled.has(id)) return;
    if (this.heap.some((item) => item.id === id)) {
      this.cancelled.add(id);
      this.live--;
    }
  }

  get size(): number {
    return this.live;
  }

  snapshot(): QueueSnapshot<E> {
    return structuredClone({
      heap: this.heap,
      cancelled: [...this.cancelled],
      nextId: this.nextId,
      live: this.live,
    });
  }

  static restore<T>(s: QueueSnapshot<T>): EventQueue<T> {
    const q = new EventQueue<T>();
    const copy = structuredClone(s);
    q.heap = copy.heap;
    q.cancelled = new Set(copy.cancelled);
    q.nextId = copy.nextId;
    q.live = copy.live;
    return q;
  }

  private static less<E>(a: QueueItem<E>, b: QueueItem<E>): boolean {
    return a.time < b.time || (a.time === b.time && a.id < b.id);
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!EventQueue.less(this.heap[i]!, this.heap[parent]!)) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent]!, this.heap[i]!];
      i = parent;
    }
  }

  private removeTop(): void {
    const last = this.heap.pop()!;
    if (this.heap.length === 0) return;
    this.heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < this.heap.length && EventQueue.less(this.heap[l]!, this.heap[smallest]!)) smallest = l;
      if (r < this.heap.length && EventQueue.less(this.heap[r]!, this.heap[smallest]!)) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest]!, this.heap[i]!];
      i = smallest;
    }
  }
}
