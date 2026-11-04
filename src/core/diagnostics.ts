// ─── core/diagnostics.ts — conserved-quantity samples, drift, decimation ──

import type { Diagnostics } from './types';

export class DiagnosticsRecorder {
  samples: Diagnostics[] = [];
  interval = 1;
  private seen = 0;
  constructor(private capacity = 600) {}

  push(sample: Diagnostics): void {
    this.seen++;
    if (this.seen % this.interval !== 0 && this.samples.length > 0) return;
    this.samples.push(sample);
    if (this.samples.length > this.capacity) {
      const kept: Diagnostics[] = [];
      for (let i = 0; i < this.samples.length; i += 2) kept.push(this.samples[i]!);
      if (kept[kept.length - 1] !== this.samples[this.samples.length - 1]) kept.push(this.samples[this.samples.length - 1]!);
      this.samples = kept;
      this.interval *= 2;
    }
  }

  clear(): void { this.samples = []; this.interval = 1; this.seen = 0; }
  get latest(): Diagnostics | undefined { return this.samples[this.samples.length - 1]; }
}

export function totalEnergy(d: Diagnostics | undefined): number | null {
  if (!d?.energy) return null;
  return d.energy.kinetic + d.energy.potential;
}

export function energyDrift(samples: readonly Diagnostics[], baselineIndex = 0): number | null {
  const base = totalEnergy(samples[baselineIndex]);
  const last = totalEnergy(samples[samples.length - 1]);
  if (base === null || last === null || base === 0) return null;
  return (last - base) / Math.abs(base);
}

export function driftSeries(samples: readonly Diagnostics[], baselineIndex = 0): { t: number; logDrift: number; energy: number | null }[] {
  const base = totalEnergy(samples[baselineIndex]);
  return samples.map((s) => {
    const e = totalEnergy(s);
    const drift = base !== null && e !== null && base !== 0 ? (e - base) / Math.abs(base) : null;
    return { t: s.time, logDrift: drift === null ? -12 : Math.log10(Math.max(1e-12, Math.abs(drift))), energy: e };
  });
}

export function momentumMagnitude(d: Diagnostics | undefined): number | null {
  if (!d?.momentum) return null;
  return Math.sqrt(d.momentum.x * d.momentum.x + d.momentum.y * d.momentum.y);
}
