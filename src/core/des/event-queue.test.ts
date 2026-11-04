import { describe, expect, it } from 'vitest';
import { EventQueue } from './event-queue';
import { createRng } from '../rng';

describe('EventQueue', () => {
  it('pops in (time, id) order; equal times in insertion order', () => {
    const q = new EventQueue<string>();
    q.push(10, 'a'); q.push(5, 'b'); q.push(10, 'c'); q.push(5, 'd'); q.push(1, 'e');
    expect([q.pop()?.payload, q.pop()?.payload, q.pop()?.payload, q.pop()?.payload, q.pop()?.payload])
      .toEqual(['e', 'b', 'd', 'a', 'c']);
    expect(q.pop()).toBeUndefined();
  });

  it('10,000 random pushes/pops match a sorted-array reference', () => {
    const rng = createRng(99);
    const q = new EventQueue<number>();
    const ref: { time: number; id: number; payload: number }[] = [];
    for (let i = 0; i < 10000; i++) {
      const time = rng.int(0, 500);
      const id = q.push(time, i);
      ref.push({ time, id, payload: i });
    }
    ref.sort((a, b) => a.time - b.time || a.id - b.id);
    const got = Array.from({ length: 10000 }, () => q.pop()?.payload);
    expect(got).toEqual(ref.map((r) => r.payload));
  });

  it('cancel removes a queued item; unknown/popped cancels are no-ops; size reflects it', () => {
    const q = new EventQueue<string>();
    const a = q.push(1, 'a');
    q.push(2, 'b');
    expect(q.size).toBe(2);
    q.cancel(a);
    expect(q.size).toBe(1);
    expect(q.pop()?.payload).toBe('b');
    q.cancel(99999);
    q.cancel(a);
    expect(q.size).toBe(0);
  });

  it('snapshot → mutate → restore reproduces pre-mutation behaviour (deep independence)', () => {
    const q = new EventQueue<{ v: number }>();
    q.push(3, { v: 1 }); q.push(1, { v: 2 }); q.push(2, { v: 3 });
    const snap = q.snapshot();
    q.pop(); q.push(0, { v: 99 });
    const restored = EventQueue.restore(snap);
    expect(restored.pop()?.payload).toEqual({ v: 2 });
    expect(restored.pop()?.payload).toEqual({ v: 3 });
    snap.heap[0]!.payload.v = -1; // mutating the snapshot must not leak into the restored queue
    expect(restored.pop()?.payload).toEqual({ v: 1 });
  });
});
