import type { ParamSchema, Rng } from '../../core/types';

export interface Params {
  arms: number;
  gravity: number;
  length: number;
  damping: number;
  spread: number;
  trail: boolean;
  trailLength: number;
  palette: 'mono' | 'fan' | 'energy';
  color: string;
}

export const defaultParams: Params = {
  arms: 14,
  gravity: 9.8,
  length: 132,
  damping: 0,
  spread: 0.35,
  trail: true,
  trailLength: 220,
  palette: 'fan',
  color: '#ff8a3d',
};

export const paramSchema: ParamSchema<Params> = {
  arms: { kind: 'range', label: 'Pendulums', min: 1, max: 40, step: 1 },
  gravity: { kind: 'range', label: 'Gravity', min: 1, max: 30, step: 0.1, unit: 'm/s²' },
  length: { kind: 'range', label: 'Arm length', min: 40, max: 220, step: 2, unit: 'px' },
  damping: { kind: 'number', label: 'Damping', min: 0, max: 1.5, step: 0.01 },
  spread: { kind: 'range', label: 'Angular spread', min: 0, max: 3, step: 0.01, unit: '°' },
  trail: { kind: 'boolean', label: 'Draw trails' },
  trailLength: { kind: 'range', label: 'Trail memory', min: 20, max: 400, step: 10 },
  palette: { kind: 'select', label: 'Palette', options: ['mono', 'fan', 'energy'] },
  color: { kind: 'color', label: 'Ink (mono palette)' },
};

export const WORLD = { w: 800, h: 600 };
const SUBSTEPS = 4;

export interface Arm {
  th1: number;
  th2: number;
  w1: number;
  w2: number;
  /** ring buffer of second-bob positions, in unit coordinates (x, y) pairs */
  trail: number[];
  head: number;
  count: number;
}

export interface State {
  arms: Arm[];
  t: number;
  params: Params;
  rng: Rng;
}

export function init(params: Params, rng: Rng): State {
  const armsCount = Math.max(1, Math.round(params.arms));
  const cap = Math.max(4, Math.round(params.trailLength));
  const spread = (params.spread * Math.PI) / 180;
  const base = 2.35; // released well past horizontal
  const arms: Arm[] = [];

  for (let i = 0; i < armsCount; i++) {
    arms.push({
      th1: base + i * spread + rng.range(-0.0004, 0.0004),
      th2: base * 0.86 + i * spread * 1.35 + rng.range(-0.0004, 0.0004),
      w1: 0,
      w2: 0,
      trail: new Array<number>(cap * 2).fill(0),
      head: 0,
      count: 0,
    });
  }

  return { arms, t: 0, params, rng };
}

/** Angular accelerations for equal masses and equal unit arm lengths. */
function derivs(th1: number, th2: number, w1: number, w2: number, g: number): [number, number, number, number] {
  const d = th1 - th2;
  const den = 3 - Math.cos(2 * d);
  const a1 =
    (-3 * g * Math.sin(th1) - g * Math.sin(th1 - 2 * th2) - 2 * Math.sin(d) * (w2 * w2 + w1 * w1 * Math.cos(d))) / den;
  const a2 = (2 * Math.sin(d) * (2 * w1 * w1 + 2 * g * Math.cos(th1) + w2 * w2 * Math.cos(d))) / den;
  return [w1, w2, a1, a2];
}

function rk4(arm: Arm, h: number, g: number): void {
  const { th1, th2, w1, w2 } = arm;

  const k1 = derivs(th1, th2, w1, w2, g);
  const k2 = derivs(th1 + (h / 2) * k1[0], th2 + (h / 2) * k1[1], w1 + (h / 2) * k1[2], w2 + (h / 2) * k1[3], g);
  const k3 = derivs(th1 + (h / 2) * k2[0], th2 + (h / 2) * k2[1], w1 + (h / 2) * k2[2], w2 + (h / 2) * k2[3], g);
  const k4 = derivs(th1 + h * k3[0], th2 + h * k3[1], w1 + h * k3[2], w2 + h * k3[3], g);

  arm.th1 += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  arm.th2 += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  arm.w1 += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  arm.w2 += (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
}

function pushTrail(arm: Arm): void {
  const x = Math.sin(arm.th1) + Math.sin(arm.th2);
  const y = Math.cos(arm.th1) + Math.cos(arm.th2);
  arm.trail[arm.head * 2] = x;
  arm.trail[arm.head * 2 + 1] = y;
  const cap = arm.trail.length / 2;
  arm.head = (arm.head + 1) % cap;
  arm.count = Math.min(arm.count + 1, cap);
}

export function step(state: State, dt: number): State {
  const { params } = state;
  const g = params.gravity;
  const h = dt / SUBSTEPS;
  const decay = params.damping > 0 ? Math.max(0, 1 - params.damping * dt) : 1;

  for (const arm of state.arms) {
    for (let s = 0; s < SUBSTEPS; s++) rk4(arm, h, g);
    if (decay !== 1) {
      arm.w1 *= decay;
      arm.w2 *= decay;
    }
    if (params.trail) pushTrail(arm);
  }

  state.t += dt;
  return state;
}

/** Total mechanical energy of one arm (unit masses, unit lengths). */
export function energy(arm: Arm, g: number): number {
  const ke = arm.w1 * arm.w1 + 0.5 * arm.w2 * arm.w2 + arm.w1 * arm.w2 * Math.cos(arm.th1 - arm.th2);
  const pe = -2 * g * Math.cos(arm.th1) - g * Math.cos(arm.th2);
  return ke + pe;
}

export function bob2(arm: Arm): { x: number; y: number } {
  return { x: Math.sin(arm.th1) + Math.sin(arm.th2), y: Math.cos(arm.th1) + Math.cos(arm.th2) };
}

export function snapshot(state: State): { th1: number; th2: number; w1: number; w2: number }[] {
  return state.arms.map((a) => ({ th1: a.th1, th2: a.th2, w1: a.w1, w2: a.w2 }));
}
