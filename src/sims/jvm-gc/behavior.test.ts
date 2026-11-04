import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../core/des/headless';
import { assertPlainData, assertReplayEquivalence } from '../../core/des/testing';
import { defaultParams, gcSim, type Params } from './logic';
import sim from './index';

function run(params: Partial<Params>, seed: number, seconds: number) {
  return runHeadless(gcSim, { ...defaultParams, ...params }, seed, {
    untilTime: seconds * 1_000_000, maxEvents: 200000,
  });
}

describe('jvm-gc behaviour (fixed seeds)', () => {
  it('web-requests: generational total GC time < mark-sweep total GC time', () => {
    const gen = run({ collector: 'generational', workload: 'web-requests' }, 42, 30);
    const ms = run({ collector: 'mark-sweep', workload: 'web-requests' }, 42, 30);
    expect(gen.state.heap.oom).toBe(false);
    expect(ms.state.heap.oom).toBe(false);
    expect(gen.state.heap.stats.totalPauseUs).toBeLessThan(ms.state.heap.stats.totalPauseUs);
  });

  it('leaky workload ends in OutOfMemoryError', () => {
    const r = run({ collector: 'generational', workload: 'leaky' }, 42, 120);
    expect(r.state.heap.oom).toBe(true);
    expect(r.log.some((e) => e.text.includes('OutOfMemoryError'))).toBe(true);
  });

  it('big-arrays: mark-sweep without compact GCs more than mark-compact (fragmentation)', () => {
    const plain = run({ collector: 'mark-sweep', compact: false, workload: 'big-arrays' }, 7, 30);
    const compact = run({ collector: 'mark-sweep', compact: true, workload: 'big-arrays' }, 7, 30);
    expect(plain.state.heap.stats.markSweepGc).toBeGreaterThanOrEqual(compact.state.heap.stats.markSweepGc);
  });

  it('cost model sanity: pauses are positive and total pause grows with live data', () => {
    const light = run({ collector: 'mark-sweep', workload: 'custom', allocRate: 800, shortMs: 2000, longLivedPct: 2, leakPct: 0, largeObjPct: 0, oldToYoungPct: 0 }, 3, 20);
    const heavy = run({ collector: 'mark-sweep', workload: 'custom', allocRate: 800, shortMs: 2000, longLivedPct: 40, leakPct: 4, largeObjPct: 0, oldToYoungPct: 0 }, 3, 20);
    expect(heavy.state.heap.stats.totalPauseUs).toBeGreaterThan(light.state.heap.stats.totalPauseUs);
  });

  it('state is plain data; replay equivalence holds for both collectors', () => {
    const { state } = run({ collector: 'generational' }, 5, 5);
    expect(() => assertPlainData(state)).not.toThrow();
    for (const collector of ['generational', 'mark-sweep'] as const) {
      assertReplayEquivalence(sim, { ...defaultParams, collector }, 5, { events: 120, cuts: [0, 40, 119] });
    }
  });
});
