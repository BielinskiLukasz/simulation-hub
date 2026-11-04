import type { ParamSchema, Rng } from '../../core/types';

/** Reference truth for the error readout. */
export const TRUE_PI = Math.PI;

export type Sampler = 'plain' | 'antithetic' | 'stratified';

export interface PiParams {
  samples: number;
  sampler: Sampler;
  cloudPoints: number;
  bins: number;
}

export const defaultParams: PiParams = {
  samples: 200_000,
  sampler: 'plain',
  cloudPoints: 6000,
  bins: 24,
};

export const paramSchema: ParamSchema<PiParams> = {
  samples: { kind: 'range', label: 'Samples', min: 1000, max: 1_000_000, step: 1000 },
  sampler: { kind: 'select', label: 'Sampler', options: ['plain', 'antithetic', 'stratified'] },
  cloudPoints: { kind: 'range', label: 'Points drawn', min: 0, max: 20_000, step: 500 },
  bins: { kind: 'range', label: 'Histogram bins', min: 6, max: 60, step: 1 },
};

/** π̂ = 4 · hits / N */
export function estimate(hits: number, n: number): number {
  return n > 0 ? (4 * hits) / n : 0;
}

/** Standard error of π̂ for Bernoulli trials with p = hits/N. */
export function standardError(hits: number, n: number): number {
  if (n <= 0) return 0;
  const p = hits / n;
  return 4 * Math.sqrt(Math.max(0, p * (1 - p)) / n);
}

function inside(x: number, y: number): number {
  return x * x + y * y <= 1 ? 1 : 0;
}

export interface SampleOutcome {
  hits: number;
  /** (x, y, inside) triples for the scatter, or null when nothing was requested */
  cloud: Float32Array | null;
}

/** Pure sampling. One RNG stream in, hits out — no clock, no Math.random. */
export function sampleChunk(rng: Rng, n: number, sampler: Sampler, cloudCap: number): SampleOutcome {
  const cap = Math.max(0, Math.min(Math.round(cloudCap), n));
  const cloud = cap > 0 ? new Float32Array(cap * 3) : null;
  let written = 0;
  let hits = 0;

  const record = (x: number, y: number, h: number): void => {
    hits += h;
    if (cloud && written < cap) {
      cloud[written * 3] = x;
      cloud[written * 3 + 1] = y;
      cloud[written * 3 + 2] = h;
      written++;
    }
  };

  if (sampler === 'antithetic') {
    const pairs = Math.floor(n / 2);
    for (let i = 0; i < pairs; i++) {
      const x = rng.next();
      const y = rng.next();
      const a = inside(x, y);
      const b = inside(1 - x, 1 - y);
      hits += a + b;
      if (cloud && written < cap) {
        cloud[written * 3] = x;
        cloud[written * 3 + 1] = y;
        cloud[written * 3 + 2] = a;
        written++;
        if (written < cap) {
          cloud[written * 3] = 1 - x;
          cloud[written * 3 + 1] = 1 - y;
          cloud[written * 3 + 2] = b;
          written++;
        }
      }
    }
    if (n % 2 === 1) {
      const x = rng.next();
      const y = rng.next();
      record(x, y, inside(x, y));
    }
    return { hits, cloud };
  }

  if (sampler === 'stratified') {
    const k = Math.max(1, Math.min(1000, Math.round(Math.sqrt(n))));
    const cells = k * k;
    for (let i = 0; i < n; i++) {
      const c = i % cells;
      const sx = c % k;
      const sy = (c / k) | 0;
      const x = (sx + rng.next()) / k;
      const y = (sy + rng.next()) / k;
      record(x, y, inside(x, y));
    }
    return { hits, cloud };
  }

  for (let i = 0; i < n; i++) {
    const x = rng.next();
    const y = rng.next();
    record(x, y, inside(x, y));
  }
  return { hits, cloud };
}
