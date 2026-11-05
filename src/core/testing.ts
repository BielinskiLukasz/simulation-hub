// ─── core/testing.ts — frame-rate independence helpers ─────────────────────

export function hashFloat64(arrays: readonly ArrayLike<number>[]): number {
  let hash = 0x811c9dc5;
  const view = new DataView(new ArrayBuffer(8));
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      view.setFloat64(0, arr[i]!, true);
      for (let b = 0; b < 8; b++) {
        hash ^= view.getUint8(b);
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return hash >>> 0;
}

export interface RunnerLike {
  stepCount: number;
  tick(tsMs: number): void;
}

export function framePatterns(steps: number): Record<string, number[]> {
  const make = (hz: number, jitter = 0) => {
    const out = [0];
    let t = 0;
    for (let i = 0; i < steps * 2; i++) {
      t += 1000 / hz + (jitter ? ((i * 37) % 7 - 3) : 0);
      out.push(Math.max(out[out.length - 1]! + 1, t));
    }
    return out;
  };
  const bursty: number[] = [0];
  for (let i = 0; i < steps; i += 10) bursty.push(i * (1000 / 60) * 10 + 500);
  return { hz30: make(30), hz60: make(60), hz144: make(144), jittery: make(60, 1), bursty };
}

/**
 * Reference-driven assertion: after every tick, the runner's (stepCount,
 * hash) must equal the direct-stepped reference at that step count.
 */
export function assertFrameRateIndependence(opts: {
  directHashAt(step: number): number;
  makeRunner(): RunnerLike;
  hashRunner(): number;
  maxSteps: number;
}): void {
  const patterns = framePatterns(opts.maxSteps);
  for (const [name, stamps] of Object.entries(patterns)) {
    const runner = opts.makeRunner();
    for (const ts of stamps) {
      runner.tick(ts);
      const sc = runner.stepCount;
      if (sc > opts.maxSteps) break;
      const expected = opts.directHashAt(sc);
      const got = opts.hashRunner();
      if (got !== expected) throw new Error(`frame-rate dependence (${name}) at step ${sc}: ${got} !== ${expected}`);
      if (sc >= opts.maxSteps) break;
    }
  }
}
