import { describe, expect, it } from 'vitest';
import { TraceCursor, type TraceCursorSpec } from './cursor';
import { TracePlayer } from './player';
import { SyncGroup, workPosition } from './sync';

interface Counter { n: number; sum: number }

function spec(length: number, every = 16): TraceCursorSpec<Counter> {
  return {
    length,
    every,
    create: () => ({ n: 0, sum: 0 }),
    apply: (s, i) => { s.n++; s.sum += i; },
    clone: (s) => ({ ...s }),
  };
}

describe('TraceCursor position semantics', () => {
  it('position 0 = initial, position length = final; forward/backward/forward is exact', () => {
    const c = new TraceCursor(spec(1000));
    expect(c.position).toBe(0);
    expect(c.state).toEqual({ n: 0, sum: 0 });
    c.seek(1000);
    const final = { ...c.state };
    expect(final.n).toBe(1000);
    expect(final.sum).toBe((999 * 1000) / 2);
    c.seek(137);
    expect(c.state).toEqual({ n: 137, sum: (136 * 137) / 2 });
    c.seek(1000);
    expect(c.state).toEqual(final);
  });

  it('seeking across checkpoint boundaries and arbitrary order always matches direct application', () => {
    const c = new TraceCursor(spec(500, 64));
    const direct = (n: number): Counter => {
      const s: Counter = { n: 0, sum: 0 };
      for (let i = 0; i < n; i++) { s.n++; s.sum += i; }
      return s;
    };
    for (const n of [500, 3, 256, 255, 129, 0, 499, 64, 63]) {
      expect(c.seek(n)).toEqual(direct(n));
      expect(c.position).toBe(n);
    }
    expect(c.checkpointCount).toBeGreaterThanOrEqual(8);
  });

  it('clamps out-of-range positions', () => {
    const c = new TraceCursor(spec(10, 4));
    expect(c.seek(-5)).toEqual({ n: 0, sum: 0 });
    expect(c.seek(999).n).toBe(10);
  });
});

describe('TracePlayer', () => {
  it('fractional rates accumulate and clamp at the end; seeks and step-backs work', () => {
    const p = new TracePlayer(100);
    p.rate = 2.5;
    p.playing = true;
    for (let i = 0; i < 40; i++) p.tick(0.1); // 4 s × 2.5 = 10 steps
    expect(p.position).toBeGreaterThanOrEqual(9);
    expect(p.position).toBeLessThanOrEqual(11);
    p.playing = false;
    const at = p.position;
    p.stepBack();
    expect(p.position).toBe(at - 1);
    p.stepForward(2);
    expect(p.position).toBe(at + 1);
    p.toEnd();
    expect(p.position).toBe(100);
    p.playing = true;
    p.tick(10);
    expect(p.position).toBe(100);
    expect(p.playing).toBe(false);
    p.toStart();
    expect(p.position).toBe(0);
    p.fitRate(5);
    expect(p.rate).toBeCloseTo(20, 5);
  });

  it('ignores ticks while paused', () => {
    const p = new TracePlayer(50);
    p.playing = false;
    p.tick(1);
    expect(p.position).toBe(0);
  });
});

describe('SyncGroup', () => {
  const A = { length: 100, work: Int32Array.from({ length: 6 }, (_, i) => [0, 10, 20, 30, 40, 50][i]!) };
  const B = { length: 20, work: Int32Array.from({ length: 6 }, (_, i) => [0, 5, 10, 15, 20, 25][i]!) };

  it('steps: both panes share the step index, clamped to their own length', () => {
    const g = new SyncGroup([A, B]);
    g.mode = 'steps';
    expect(g.positions(50)).toEqual([50, 20]);
    expect(g.maxFor()).toBe(100);
  });

  it('work: each pane sits at the largest position with cumulative ≤ target (plateaus OK)', () => {
    const g = new SyncGroup([A, B]);
    g.mode = 'work';
    expect(g.positions(15)).toEqual([1, 3]);
    expect(g.maxFor()).toBe(50);
    const plateau = [0, 5, 5, 5, 10];
    expect(workPosition(plateau, 5)).toBe(3);
    expect(workPosition(plateau, 7)).toBe(3);
    expect(workPosition(plateau, 99)).toBe(4);
  });

  it('normalized: same fraction, finishing together', () => {
    const g = new SyncGroup([A, B]);
    g.mode = 'normalized';
    expect(g.positions(0.5)).toEqual([50, 10]);
    expect(g.positions(1)).toEqual([100, 20]);
  });
});
