import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../core/des/headless';
import { assertPlainData, assertReplayEquivalence } from '../../core/des/testing';
import { computeMetrics, encodeWorkload, parseWorkload } from './algorithms';
import { defaultParams, schedulerSim, type Params } from './logic';

function run(params: Partial<Params>, seed = 42) {
  const p: Params = { ...defaultParams, contextSwitch: 0, ...params };
  const sim = { ...schedulerSim };
  const r = runHeadless(sim, p, seed, { maxEvents: 100000 });
  return { ...r, metrics: computeMetrics(r.state.procs, r.state.slices, r.state.switches) };
}

describe('cpu-scheduler textbook cases (context switch = 0)', () => {
  it('convoy: FCFS avg wait 17 · SJF 3 · RR(q=4) ≈ 5.67', () => {
    const convoy = { workloadPreset: 'convoy' } as const;
    expect(run({ ...convoy, algorithm: 'fcfs' }).metrics.avgWaiting).toBeCloseTo(17, 9);
    expect(run({ ...convoy, algorithm: 'sjf' }).metrics.avgWaiting).toBeCloseTo(3, 9);
    expect(run({ ...convoy, algorithm: 'rr', quantum: 4 }).metrics.avgWaiting).toBeCloseTo(17 / 3, 6);
  });

  it('textbook SJF: order P1 P2 P4 P3, avg wait 7.75; SRTF 6.5', () => {
    const t = { workloadPreset: 'textbook-sjf' } as const;
    const sjf = run({ ...t, algorithm: 'sjf' });
    expect(sjf.metrics.avgWaiting).toBeCloseTo(7.75, 9);
    expect(sjf.metrics.perProc.map((m) => m.waiting)).toEqual([0, 7, 15, 9]);
    const srtf = run({ ...t, algorithm: 'srtf' });
    expect(srtf.metrics.avgWaiting).toBeCloseTo(6.5, 9);
    expect(srtf.metrics.perProc.map((m) => m.waiting)).toEqual([9, 0, 15, 2]);
  });

  it('priority: preemptive and non-preemptive differ as expected', () => {
    const wl = { workloadPreset: 'custom', workload: '0:10:3;1:2:1' } as const;
    const non = run({ ...wl, algorithm: 'priority', preemptivePriority: false });
    const pre = run({ ...wl, algorithm: 'priority', preemptivePriority: true });
    expect(non.metrics.perProc[1]!.waiting).toBe(9); // P2 waits for P1 to finish
    expect(pre.metrics.perProc[1]!.waiting).toBe(0); // P2 preempts at t=1
    expect(pre.metrics.makespan).toBe(12);
  });

  it('context-switch cost is paid per switch to a different process', () => {
    const r = run({ workloadPreset: 'convoy', algorithm: 'fcfs', contextSwitch: 2 });
    expect(r.state.switches).toBe(2); // P1→P2, P2→P3
    expect(r.metrics.makespan).toBe(24 + 3 + 3 + 2 * 2);
  });

  it('workload encode/parse round-trips', () => {
    const specs = [{ arrival: 0, burst: 24, priority: 2 }, { arrival: 3, burst: 5, priority: 1 }];
    expect(parseWorkload(encodeWorkload(specs))).toEqual(specs);
  });
});

describe('cpu-scheduler properties (seeded random workloads)', () => {
  it('slices sum to bursts, never overlap; FCFS/SJF give exactly one slice per process', () => {
    for (const algo of ['fcfs', 'sjf', 'rr', 'srtf'] as const) {
      const { state } = run({ workloadPreset: 'random', randomCount: 12, algorithm: algo }, 7);
      const sorted = [...state.slices].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
      for (const p of state.procs) {
        const sum = state.slices.filter((s) => s.pid === p.pid).reduce((a, s) => a + (s.end - s.start), 0);
        expect(sum).toBe(p.burst);
        if (algo === 'fcfs' || algo === 'sjf') expect(state.slices.filter((s) => s.pid === p.pid).length).toBe(1);
      }
    }
  });

  it('waiting = turnaround − burst and turnaround = completion − arrival for every process', () => {
    const { metrics, state } = run({ workloadPreset: 'random', randomCount: 10, algorithm: 'rr', quantum: 3 }, 9);
    for (const m of metrics.perProc) {
      const p = state.procs[m.pid - 1]!;
      expect(m.turnaround).toBe(p.completedAt - p.arrival);
      expect(m.waiting).toBe(m.turnaround - p.burst);
      expect(m.waiting).toBeGreaterThanOrEqual(0);
    }
  });

  it('SRTF average waiting ≤ FCFS/SJF/RR on random workloads (optimality, cs = 0)', () => {
    for (const seed of [3, 5, 8]) {
      const base = { workloadPreset: 'random', randomCount: 10 } as const;
      const srtf = run({ ...base, algorithm: 'srtf' }, seed).metrics.avgWaiting;
      for (const algo of ['fcfs', 'sjf', 'rr'] as const) {
        const other = run({ ...base, algorithm: algo, quantum: 4 }, seed).metrics.avgWaiting;
        expect(srtf).toBeLessThanOrEqual(other + 1e-9);
      }
    }
  });

  it('state is plain data and replay equivalence holds', () => {
    const { state } = run({ workloadPreset: 'random', randomCount: 8, algorithm: 'rr' }, 4);
    expect(() => assertPlainData(state)).not.toThrow();
    const sim = { ...schedulerSim };
    for (const seed of [1, 2, 3]) {
      assertReplayEquivalence(sim, { ...defaultParams, workloadPreset: 'convoy', algorithm: 'rr' }, seed, {
        events: 40, cuts: [0, 5, 17, 39],
      });
    }
  });
});
