import { describe, expect, it } from 'vitest';
import { MetricsRecorder } from './recorder';

describe('MetricsRecorder', () => {
  it('fills every grid point up to now with the piecewise-constant value, idempotently', () => {
    const r = new MetricsRecorder(['a'], 1, 100);
    r.fill(0, [0]);
    r.fill(0.5, [1]);
    expect(r.length).toBe(1);
    r.fill(2, [5]);
    expect(r.length).toBe(3);
    expect(Array.from(r.col('a'))).toEqual([0, 5, 5]);
    r.fill(2.4, [9]);
    expect(r.length).toBe(3);
    expect(r.col('a')[2]).toBe(5);
  });

  it('truncateAfter removes the discarded future and replay regenerates identical samples', () => {
    const r = new MetricsRecorder(['x'], 0.5, 100);
    for (let t = 0; t <= 4; t += 0.25) r.fill(t, [t]);
    const full = Array.from(r.col('x'));
    r.truncateAfter(1.5);
    const cut = r.length;
    expect(cut).toBeLessThan(full.length);
    for (let t = 1.5; t <= 4; t += 0.25) r.fill(t, [t]);
    expect(Array.from(r.col('x'))).toEqual(full);
  });

  it('cap stops and flags; decimate keeps bounded length', () => {
    const cap = new MetricsRecorder(['v'], 1, 10, 'cap');
    for (let t = 0; t < 40; t++) cap.fill(t, [t]);
    expect(cap.capped).toBe(true);
    expect(cap.length).toBeLessThanOrEqual(10);
    const dec = new MetricsRecorder(['v'], 1, 10, 'decimate');
    for (let t = 0; t < 400; t++) dec.fill(t, [t]);
    expect(dec.length).toBeLessThanOrEqual(11);
    expect(dec.col('v')[0]).toBeLessThan(dec.col('v')[dec.length - 1]!);
  });

  it('CSV preserves NaN as an empty cell', () => {
    const r = new MetricsRecorder(['a', 'b'], 1, 10);
    r.fill(0, [1, NaN]);
    r.fill(1, [2, 3]);
    const csv = r.toCsv();
    expect(csv.split('\n')[0]).toBe('time,a,b');
    expect(csv.split('\n')[1]).toBe('0,1,');
    expect(csv.split('\n')[2]).toBe('1,2,3');
  });
});
