// ─── core/ode.ts — small classical RK4 for first-order systems ─────────────

export type Deriv = (t: number, y: Float64Array, out: Float64Array) => void;

export function rk4(f: Deriv, t: number, y: Float64Array, dt: number, scratch?: {
  k1: Float64Array; k2: Float64Array; k3: Float64Array; k4: Float64Array; tmp: Float64Array;
}): void {
  const n = y.length;
  const s = scratch ?? {
    k1: new Float64Array(n), k2: new Float64Array(n), k3: new Float64Array(n), k4: new Float64Array(n), tmp: new Float64Array(n),
  };
  f(t, y, s.k1);
  for (let i = 0; i < n; i++) s.tmp[i] = y[i]! + (dt / 2) * s.k1[i]!;
  f(t + dt / 2, s.tmp, s.k2);
  for (let i = 0; i < n; i++) s.tmp[i] = y[i]! + (dt / 2) * s.k2[i]!;
  f(t + dt / 2, s.tmp, s.k3);
  for (let i = 0; i < n; i++) s.tmp[i] = y[i]! + dt * s.k3[i]!;
  f(t + dt, s.tmp, s.k4);
  for (let i = 0; i < n; i++) y[i] = y[i]! + (dt / 6) * (s.k1[i]! + 2 * s.k2[i]! + 2 * s.k3[i]! + s.k4[i]!);
}
