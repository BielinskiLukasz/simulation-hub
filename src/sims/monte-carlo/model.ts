// ─── Monte Carlo · model.ts ─────────────────────────────────────────────────
// Conventions (also in the README — write them once, test against them):
//  • All amounts are in TODAY'S money (real terms); use a REAL expected return.
//  • Time step is monthly. Each month, in order: (1) contribution/withdrawal
//    at the START of the month, (2) growth over the month.
//  • Monthly log-return: ln(1+r) = μ/12 − σ²/24 + (σ/√12)·Z, Z ~ N(0,1).
//    The −σ²/24 term makes E[gross monthly growth] exactly exp(μ/12).
//  • Balance floored at 0; once a withdrawing run hits 0 it stays 0.

import type { ParamSchema } from '../../core/types';

export interface Params {
  initialBalance: number;
  monthlyContribution: number;
  accumYears: number;
  withdrawYears: number;
  expectedRealReturn: number; // % per year (real)
  volatility: number; // % per year
  withdrawalStrategy: string; // 'fixed-real' | 'percent-of-balance'
  monthlyWithdrawal: number;
  withdrawalRate: number; // % of balance per year
  targetBalance: number;
  runs: number;
}

export const defaultParams: Params = {
  initialBalance: 50000,
  monthlyContribution: 1000,
  accumYears: 25,
  withdrawYears: 25,
  expectedRealReturn: 4.5,
  volatility: 15,
  withdrawalStrategy: 'fixed-real',
  monthlyWithdrawal: 3000,
  withdrawalRate: 4,
  targetBalance: 1000000,
  runs: 10000,
};

export const paramSchema: ParamSchema<Params> = {
  initialBalance: { kind: 'number', label: 'Initial balance', min: 0, step: 1000 },
  monthlyContribution: { kind: 'number', label: 'Monthly contribution', min: 0, step: 100 },
  accumYears: { kind: 'range', label: 'Accumulation years', min: 0, max: 50, step: 1 },
  withdrawYears: { kind: 'range', label: 'Withdrawal years', min: 0, max: 50, step: 1 },
  expectedRealReturn: { kind: 'range', label: 'Expected real return', min: -2, max: 12, step: 0.1, unit: '%/yr' },
  volatility: { kind: 'range', label: 'Volatility', min: 0, max: 35, step: 0.5, unit: '%/yr' },
  withdrawalStrategy: { kind: 'select', label: 'Withdrawal strategy', options: ['fixed-real', 'percent-of-balance'] },
  monthlyWithdrawal: { kind: 'number', label: 'Monthly withdrawal (fixed)', min: 0, step: 100, hint: 'Used by fixed-real' },
  withdrawalRate: { kind: 'range', label: 'Withdrawal rate', min: 0, max: 10, step: 0.25, unit: '%/yr', hint: 'Used by percent-of-balance' },
  targetBalance: { kind: 'number', label: 'Success target (no withdrawals)', min: 0, step: 10000, hint: 'Success when withdrawYears = 0' },
  runs: { kind: 'range', label: 'Simulation runs', min: 1000, max: 50000, step: 1000, hint: 'Chunked at 1,000 runs — deterministic at any worker count' },
};

export interface Chunk {
  index: number;
  runs: number;
  seed: number;
  params: Params;
}

export interface ChunkPart {
  index: number;
  runs: number;
  /** balances[run * checkpoints + checkpoint] — yearly checkpoints, Float32 storage. */
  balances: Float32Array;
}

export function horizonYears(p: Params): number {
  return p.accumYears + p.withdrawYears;
}

/**
 * SELF-CONTAINED on purpose: this function's source is serialised into a
 * Blob Web Worker (runtime/worker-factory.ts), so it must not reference any
 * imported helpers. The RNG below is exactly core/rng's mulberry32 +
 * Box–Muller — worker-factory.test.ts proves serialised ≡ direct output.
 */
export function processChunk(chunk: Chunk): ChunkPart {
  const p = chunk.params;
  const years = p.accumYears + p.withdrawYears;
  const checkpoints = years + 1;
  const months = years * 12;
  const accumMonths = p.accumYears * 12;
  const mu = p.expectedRealReturn / 100;
  const sigma = p.volatility / 100;
  const drift = mu / 12 - (sigma * sigma) / 24;
  const volM = sigma / Math.sqrt(12);

  // mulberry32 (identical algorithm to core/rng.createRng)
  let a = chunk.seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Box–Muller with cached spare (identical to core/rng.createNormal)
  let spare: number | null = null;
  const normal = (): number => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };

  const balances = new Float32Array(chunk.runs * checkpoints);

  for (let run = 0; run < chunk.runs; run++) {
    let bal = p.initialBalance;
    const base = run * checkpoints;
    balances[base] = bal;
    for (let m = 1; m <= months; m++) {
      // (1) start-of-month flow
      if (m <= accumMonths) {
        bal += p.monthlyContribution;
      } else if (bal > 0) {
        bal -= p.withdrawalStrategy === 'percent-of-balance'
          ? bal * (p.withdrawalRate / 100 / 12)
          : p.monthlyWithdrawal;
        if (bal < 0) bal = 0;
      }
      // (2) growth
      if (bal > 0) {
        bal *= Math.exp(drift + volM * normal());
        if (bal < 0) bal = 0;
      }
      if (m % 12 === 0) balances[base + m / 12] = bal;
    }
  }
  return { index: chunk.index, runs: chunk.runs, balances };
}

/** Closed-form path with σ = 0 (float64): the annuity-due trajectory. */
export function deterministicFinal(p: Params): number {
  const years = horizonYears(p);
  const months = years * 12;
  const accumMonths = p.accumYears * 12;
  const g = Math.exp(p.expectedRealReturn / 100 / 12);
  let bal = p.initialBalance;
  for (let m = 1; m <= months; m++) {
    if (m <= accumMonths) bal += p.monthlyContribution;
    else if (bal > 0) {
      bal -= p.withdrawalStrategy === 'percent-of-balance'
        ? bal * (p.withdrawalRate / 100 / 12)
        : p.monthlyWithdrawal;
      if (bal < 0) bal = 0;
    }
    if (bal > 0) bal *= g;
  }
  return bal;
}

/** First month (1-based) at which the σ=0 path is depleted, or null. */
export function deterministicDepletionMonth(p: Params): number | null {
  const months = horizonYears(p) * 12;
  const accumMonths = p.accumYears * 12;
  const g = Math.exp(p.expectedRealReturn / 100 / 12);
  let bal = p.initialBalance;
  for (let m = 1; m <= months; m++) {
    if (m <= accumMonths) bal += p.monthlyContribution;
    else if (bal > 0) {
      bal -= p.withdrawalStrategy === 'percent-of-balance'
        ? bal * (p.withdrawalRate / 100 / 12)
        : p.monthlyWithdrawal;
      if (bal <= 0) return m;
    }
    if (bal > 0) bal *= g;
  }
  return bal <= 0 && p.withdrawYears > 0 ? months : null;
}
