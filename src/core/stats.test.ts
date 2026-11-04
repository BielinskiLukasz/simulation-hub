import { describe, expect, it } from 'vitest';
import { Ema, RollingMax } from './stats';

describe('Ema', () => {
  it('converges to a constant input', () => {
    const e = new Ema(0.1);
    for (let i = 0; i < 300; i++) e.push(60);
    expect(e.current).toBeCloseTo(60, 6);
  });
  it('first sample seeds the average', () => {
    expect(new Ema(0.5).push(10)).toBe(10);
  });
});

describe('RollingMax', () => {
  it('drops old samples outside the window', () => {
    const m = new RollingMax(3);
    m.push(100); m.push(1); m.push(1);
    expect(m.current).toBe(100);
    m.push(1); // 100 falls out of the last-3 window
    expect(m.current).toBe(1);
  });
});
