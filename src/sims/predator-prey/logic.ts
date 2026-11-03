import type { ParamSchema, Rng } from '../../core/types';

export interface Params {
  prey0: number;
  pred0: number;
  alpha: number;
  beta: number;
  delta: number;
  gamma: number;
  timeScale: number;
  maxAgents: number;
  wander: boolean;
  palette: 'mono' | 'ratio' | 'phase';
  color: string;
}

export const defaultParams: Params = {
  prey0: 40,
  pred0: 9,
  alpha: 1.1,
  beta: 0.4,
  delta: 0.15,
  gamma: 0.4,
  timeScale: 1,
  maxAgents: 260,
  wander: true,
  palette: 'phase',
  color: '#4dd6b4',
};

export const paramSchema: ParamSchema<Params> = {
  prey0: { kind: 'number', label: 'Initial prey', min: 0, max: 400, step: 1 },
  pred0: { kind: 'number', label: 'Initial predators', min: 0, max: 400, step: 1 },
  alpha: { kind: 'range', label: 'α prey birth rate', min: 0.1, max: 3, step: 0.05 },
  beta: { kind: 'range', label: 'β predation rate', min: 0, max: 1.5, step: 0.01 },
  delta: { kind: 'range', label: 'δ predator growth', min: 0, max: 1.5, step: 0.01 },
  gamma: { kind: 'range', label: 'γ predator death', min: 0.05, max: 3, step: 0.05 },
  timeScale: { kind: 'range', label: 'Time scale', min: 0.1, max: 3, step: 0.1, unit: '×' },
  maxAgents: { kind: 'range', label: 'Max agents drawn', min: 40, max: 500, step: 10 },
  wander: { kind: 'boolean', label: 'Hunt & flee steering' },
  palette: { kind: 'select', label: 'Palette', options: ['mono', 'ratio', 'phase'] },
  color: { kind: 'color', label: 'Ink (mono palette)' },
};

export const WORLD = { w: 800, h: 600 };
const MAX_POP = 1e6;

export interface Agent {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface State {
  /** continuous populations — the actual model */
  prey: number;
  pred: number;
  peakPrey: number;
  peakPred: number;
  /** visualisation of those populations */
  preyAgents: Agent[];
  predAgents: Agent[];
  t: number;
  params: Params;
  rng: Rng;
}

function makeAgent(state: State, near?: Agent): Agent {
  const { rng } = state;
  const x = near ? near.x + rng.range(-30, 30) : rng.range(8, WORLD.w - 8);
  const y = near ? near.y + rng.range(-30, 30) : rng.range(8, WORLD.h - 8);
  return {
    x: Math.min(Math.max(x, 2), WORLD.w - 2),
    y: Math.min(Math.max(y, 2), WORLD.h - 2),
    vx: rng.range(-20, 20),
    vy: rng.range(-20, 20),
  };
}

export function init(params: Params, rng: Rng): State {
  const state: State = {
    prey: Math.max(0, params.prey0),
    pred: Math.max(0, params.pred0),
    peakPrey: Math.max(1, params.prey0),
    peakPred: Math.max(1, params.pred0),
    preyAgents: [],
    predAgents: [],
    t: 0,
    params,
    rng,
  };
  syncAgents(state);
  return state;
}

function targetCounts(state: State): { prey: number; pred: number } {
  const cap = Math.max(1, Math.round(state.params.maxAgents));
  const preyN =
    state.prey <= 1e-4 ? 0 : Math.max(1, Math.round(cap * 0.78 * Math.min(state.prey / state.peakPrey, 1)));
  const predN =
    state.pred <= 1e-4 ? 0 : Math.max(1, Math.round(cap * 0.55 * Math.min(state.pred / state.peakPred, 1)));
  return { prey: preyN, pred: predN };
}

function syncAgents(state: State): void {
  const target = targetCounts(state);
  const grow = (list: Agent[], n: number): void => {
    while (list.length < n) list.push(makeAgent(state, list.length ? list[list.length - 1] : undefined));
    while (list.length > n) list.pop();
  };
  grow(state.preyAgents, target.prey);
  grow(state.predAgents, target.pred);
}

function derivatives(x: number, y: number, p: Params): [number, number] {
  return [x * (p.alpha - p.beta * y), y * (p.delta * x - p.gamma)];
}

function rk4(state: State, h: number): void {
  const p = state.params;
  const x = state.prey;
  const y = state.pred;

  const k1 = derivatives(x, y, p);
  const k2 = derivatives(x + (h / 2) * k1[0], y + (h / 2) * k1[1], p);
  const k3 = derivatives(x + (h / 2) * k2[0], y + (h / 2) * k2[1], p);
  const k4 = derivatives(x + h * k3[0], y + h * k3[1], p);

  state.prey = Math.min(Math.max(x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), 0), MAX_POP);
  state.pred = Math.min(Math.max(y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), 0), MAX_POP);
}

function moveAgents(state: State, dt: number): void {
  const { rng, preyAgents, predAgents, params } = state;
  const drag = Math.pow(0.12, dt);
  const steer = params.wander ? 260 : 0;

  for (const a of preyAgents) {
    a.vx += rng.range(-1, 1) * 140 * dt;
    a.vy += rng.range(-1, 1) * 140 * dt;
    if (steer > 0 && predAgents.length > 0) {
      // flee the nearest hunter
      let best: Agent | null = null;
      let bestD = 70 * 70;
      for (const p of predAgents) {
        const d = (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) {
        const d = Math.max(Math.sqrt(bestD), 1);
        a.vx -= ((best.x - a.x) / d) * steer * dt;
        a.vy -= ((best.y - a.y) / d) * steer * dt;
      }
    }
    integrate(a, dt, drag);
  }

  for (const a of predAgents) {
    a.vx += rng.range(-1, 1) * 110 * dt;
    a.vy += rng.range(-1, 1) * 110 * dt;
    if (steer > 0 && preyAgents.length > 0) {
      let best: Agent | null = null;
      let bestD = 150 * 150;
      for (const q of preyAgents) {
        const d = (q.x - a.x) ** 2 + (q.y - a.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
      if (best) {
        const d = Math.max(Math.sqrt(bestD), 1);
        a.vx += ((best.x - a.x) / d) * steer * dt;
        a.vy += ((best.y - a.y) / d) * steer * dt;
      }
    }
    integrate(a, dt, drag);
  }
}

function integrate(a: Agent, dt: number, drag: number): void {
  a.vx *= drag;
  a.vy *= drag;
  const speed = Math.hypot(a.vx, a.vy);
  const cap = 150;
  if (speed > cap) {
    a.vx = (a.vx / speed) * cap;
    a.vy = (a.vy / speed) * cap;
  }
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  if (a.x < 2) { a.x = 2; a.vx = Math.abs(a.vx); }
  else if (a.x > WORLD.w - 2) { a.x = WORLD.w - 2; a.vx = -Math.abs(a.vx); }
  if (a.y < 2) { a.y = 2; a.vy = Math.abs(a.vy); }
  else if (a.y > WORLD.h - 2) { a.y = WORLD.h - 2; a.vy = -Math.abs(a.vy); }
}

export function step(state: State, dt: number): State {
  rk4(state, dt * state.params.timeScale);
  state.peakPrey = Math.max(state.peakPrey, state.prey);
  state.peakPred = Math.max(state.peakPred, state.pred);
  syncAgents(state);
  moveAgents(state, dt);
  state.t += dt;
  return state;
}

export function snapshot(state: State): { prey: number; pred: number; agents: number } {
  return { prey: state.prey, pred: state.pred, agents: state.preyAgents.length + state.predAgents.length };
}
