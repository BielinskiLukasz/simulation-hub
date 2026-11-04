import { describe, expect, it } from 'vitest';
import { DiagnosticsRecorder, driftSeries, energyDrift } from './diagnostics';

describe('DiagnosticsRecorder', () => {
  it('decimation keeps size bounded and preserves first/last samples', () => {
    const r = new DiagnosticsRecorder(10);
    for (let i = 0; i < 500; i++) r.push({ time: i, energy: { kinetic: i, potential: 0 } });
    expect(r.samples.length).toBeLessThanOrEqual(11);
    expect(r.samples[0]!.time).toBe(0);
    expect(r.latest!.time).toBeGreaterThan(400);
    expect(r.interval).toBeGreaterThan(1);
  });
  it('drift math and re-baseline', () => {
    const samples = [
      { time: 0, energy: { kinetic: 60, potential: 40 } },
      { time: 1, energy: { kinetic: 61, potential: 40 } },
      { time: 2, energy: { kinetic: 62, potential: 40 } },
    ];
    expect(energyDrift(samples)).toBeCloseTo(0.02, 12);
    expect(energyDrift(samples, 1)).toBeCloseTo(1 / 101, 12);
    expect(driftSeries(samples)[2]!.logDrift).toBeCloseTo(Math.log10(0.02), 9);
  });
});
