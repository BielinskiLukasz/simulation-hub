// ─── Ecosystem · lv.ts — Lotka–Volterra ODE + rate estimation ─────────────
// x' = αx − βxy, y' = δxy − γy. Integrated with core/ode RK4.
// V = δx − γ ln x + βy − α ln y is constant along solutions.

import { rk4 } from '../../core/ode';

export interface LVState { prey: number; pred: number; time: number; alpha: number; beta: number; delta: number; gamma: number }

export function lvDeriv(p: LVState) {
  return (_t: number, y: Float64Array, out: Float64Array) => {
    const x = Math.max(0, y[0]!);
    const z = Math.max(0, y[1]!);
    out[0] = p.alpha * x - p.beta * x * z;
    out[1] = p.delta * x * z - p.gamma * z;
  };
}

export function lvStep(s: LVState, dt: number): void {
  const y = new Float64Array([s.prey, s.pred]);
  rk4(lvDeriv(s), s.time, y, dt);
  s.prey = Math.max(0, y[0]!);
  s.pred = Math.max(0, y[1]!);
  s.time += dt;
}

/** Invariant first integral (up to constants). */
export function lvFirstIntegral(p: LVState): number {
  return p.delta * p.prey - p.gamma * Math.log(Math.max(1e-9, p.prey)) + p.beta * p.pred - p.alpha * Math.log(Math.max(1e-9, p.pred));
}

export function lvEquilibrium(p: LVState): { prey: number; pred: number } {
  return { prey: p.gamma / p.delta, pred: p.alpha / p.beta };
}

export function lvSmallPeriod(p: LVState): number {
  return (2 * Math.PI) / Math.sqrt(Math.max(1e-9, p.alpha * p.gamma));
}

/** Estimate per-capita rates from the trailing counter trace (mean-field approximation). */
export function estimateRates(counters: {
  integralPrey: number; integralPred: number; integralProduct: number;
  preyBorn: number; preyEaten: number; preyStarved: number; predBorn: number; predStarved: number;
  meanPrey: number; meanPred: number;
}): { alpha: number; beta: number; delta: number; gamma: number } {
  const safe = (num: number, den: number) => (Math.abs(den) > 1e-9 && Number.isFinite(num / den) ? Math.max(0, Math.min(2, num / den)) : 0.05);
  return {
    alpha: safe(counters.preyBorn - counters.preyStarved, counters.integralPrey),
    beta: safe(counters.preyEaten, counters.integralProduct),
    delta: safe(counters.predBorn, counters.integralProduct),
    gamma: safe(counters.predStarved, counters.integralPred),
  };
}
