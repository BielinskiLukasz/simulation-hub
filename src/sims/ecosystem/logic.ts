// ─── Ecosystem · logic.ts — spatial agents, energy flow, territory ─────────
// Deterministic: rng only, index-order loops, swap-into-place compaction.
// Neighbours come from the NON-WRAPPING SpatialHash (Phase 5 addition), so
// agents near an edge never see the far side. World is y-down, 800×600.

import type { ParamSchema, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';
import { SpatialHash } from '../../core/spatial-hash';
import { rk4 } from '../../core/ode';
import { createRng, deriveSeed } from '../../core/rng';

export const PLANT = 0;
export const HERB = 1;
export const PRED = 2;

export interface Params {
  plants: number;
  herbivores: number;
  predators: number;
  plantRegrowth: number; // plants per second
  herbivoreSpeed: number;
  predatorSpeed: number;
  perception: number;
  energyGain: number;
  reproduceAt: number;
  metabolism: number;
  plantsToWin: number;
  territory: boolean;
  lvMode: string;
  alpha: number; beta: number; delta: number; gamma: number;
}

export const defaultParams: Params = {
  plants: 420,
  herbivores: 90,
  predators: 14,
  plantRegrowth: 45,
  herbivoreSpeed: 62,
  predatorSpeed: 88,
  perception: 96,
  energyGain: 55,
  reproduceAt: 140,
  metabolism: 3,
  plantsToWin: 120,
  territory: true,
  lvMode: 'manual',
  alpha: 1.1, beta: 0.04, delta: 0.02, gamma: 0.9,
};

export const paramSchema: ParamSchema<Params> = {
  plants: { kind: 'range', label: 'Initial plants', min: 0, max: 1200, step: 20, hint: 'Re-inits' },
  herbivores: { kind: 'range', label: 'Initial herbivores', min: 0, max: 500, step: 5, hint: 'Re-inits' },
  predators: { kind: 'range', label: 'Initial predators', min: 0, max: 120, step: 1, hint: 'Re-inits' },
  plantRegrowth: { kind: 'range', label: 'Plant regrowth', min: 0, max: 200, step: 5, unit: '/s', live: true },
  herbivoreSpeed: { kind: 'range', label: 'Herbivore speed', min: 10, max: 160, step: 2, unit: 'px/s', live: true },
  predatorSpeed: { kind: 'range', label: 'Predator speed', min: 10, max: 220, step: 2, unit: 'px/s', live: true },
  perception: { kind: 'range', label: 'Perception radius', min: 20, max: 200, step: 4, unit: 'px', live: true },
  energyGain: { kind: 'range', label: 'Energy per meal', min: 5, max: 160, step: 5, live: true },
  reproduceAt: { kind: 'range', label: 'Reproduce at energy', min: 40, max: 400, step: 10, live: true },
  metabolism: { kind: 'range', label: 'Metabolism', min: 0.5, max: 15, step: 0.5, unit: '/s', live: true },
  plantsToWin: { kind: 'range', label: 'Reproduction plants needed', min: 20, max: 400, step: 10, live: true },
  territory: { kind: 'boolean', label: 'Show territory claim', live: true },
  lvMode: { kind: 'select', label: 'Lotka–Volterra parameters', options: ['manual', 'measured'], hint: '“measured” is set by the Calibrate action', live: true },
  alpha: { kind: 'range', label: 'LV prey growth α', min: 0.1, max: 3, step: 0.05, live: true },
  beta: { kind: 'range', label: 'LV predation β', min: 0.005, max: 0.2, step: 0.005, live: true },
  delta: { kind: 'range', label: 'LV conversion δ', min: 0.002, max: 0.2, step: 0.002, live: true },
  gamma: { kind: 'range', label: 'LV predator death γ', min: 0.1, max: 3, step: 0.05, live: true },
};

export const WORLD = { w: 800, h: 600 } as const;
export const CAPACITY = 6000;
export const TERRITORY_COLS = 80;
export const TERRITORY_ROWS = 60;

export interface State {
  n: number;
  species: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  energy: Float32Array;
  dead: Uint8Array;
  counts: [number, number, number];
  claim: Float32Array; // territory grid: >0 herbivore claim, <0 predator claim
  hash: SpatialHash;
  scratch: Int32Array;
  regrowCarry: number;
  time: number;
  births: [number, number, number];
  deaths: [number, number, number];
  eaten: [number, number];
  rng: Rng;
  params: Params;
  lv: Float64Array; // [prey, predators] mean-field companion
  odeScratch: { k1: Float64Array; k2: Float64Array; k3: Float64Array; k4: Float64Array; tmp: Float64Array };
  rate: { preyBorn: number; preyStarved: number; preyEaten: number; predBorn: number; predStarved: number; predEaten: number; sumPrey: number; sumPred: number; sumXY: number; lvResets: number };
}

export function init(params: Params, rng: Rng): State {
  const state: State = {
    n: 0,
    species: new Uint8Array(CAPACITY),
    x: new Float32Array(CAPACITY),
    y: new Float32Array(CAPACITY),
    vx: new Float32Array(CAPACITY),
    vy: new Float32Array(CAPACITY),
    energy: new Float32Array(CAPACITY),
    dead: new Uint8Array(CAPACITY),
    counts: [0, 0, 0],
    claim: new Float32Array(TERRITORY_COLS * TERRITORY_ROWS),
    hash: new SpatialHash(WORLD.w, WORLD.h, Math.max(40, params.perception), CAPACITY, false),
    scratch: new Int32Array(CAPACITY),
    regrowCarry: 0,
    time: 0,
    births: [0, 0, 0],
    deaths: [0, 0, 0],
    eaten: [0, 0],
    rng,
    params: { ...params },
    lv: Float64Array.from([params.herbivores, params.predators]),
    odeScratch: { k1: new Float64Array(2), k2: new Float64Array(2), k3: new Float64Array(2), k4: new Float64Array(2), tmp: new Float64Array(2) },
    rate: { preyBorn: 0, preyStarved: 0, preyEaten: 0, predBorn: 0, predStarved: 0, predEaten: 0, sumPrey: 0, sumPred: 0, sumXY: 0, lvResets: 0 },
  };
  for (let i = 0; i < Math.min(params.plants, CAPACITY); i++) spawn(state, PLANT, rng.range(10, WORLD.w - 10), rng.range(10, WORLD.h - 10), 0);
  for (let i = 0; i < Math.min(params.herbivores, CAPACITY - 200); i++) spawn(state, HERB, rng.range(20, WORLD.w - 20), rng.range(20, WORLD.h - 20), 70);
  for (let i = 0; i < Math.min(params.predators, 120); i++) spawn(state, PRED, rng.range(20, WORLD.w - 20), rng.range(20, WORLD.h - 20), 110);
  return state;
}

export function spawn(state: State, species: number, x: number, y: number, energy: number): number {
  if (state.n >= CAPACITY) return -1;
  const i = state.n++;
  state.species[i] = species;
  state.x[i] = Math.min(WORLD.w - 1, Math.max(1, x));
  state.y[i] = Math.min(WORLD.h - 1, Math.max(1, y));
  state.vx[i] = 0; state.vy[i] = 0;
  state.energy[i] = energy;
  state.dead[i] = 0;
  state.counts[species] = state.counts[species]! + 1;
  return i;
}

function recount(state: State): void {
  state.counts = [0, 0, 0];
  for (let i = 0; i < state.n; i++) state.counts[state.species[i]!] = state.counts[state.species[i]!]! + 1;
}

function compact(state: State): void {
  let write = 0;
  for (let i = 0; i < state.n; i++) {
    if (state.dead[i]) continue;
    if (write !== i) {
      state.species[write] = state.species[i]!;
      state.x[write] = state.x[i]!;
      state.y[write] = state.y[i]!;
      state.vx[write] = state.vx[i]!;
      state.vy[write] = state.vy[i]!;
      state.energy[write] = state.energy[i]!;
    }
    state.dead[i] = 0;
    write++;
  }
  state.n = write;
  recount(state);
}

function claimTerritory(state: State, x: number, y: number, species: number, amount: number): void {
  const cx = Math.min(TERRITORY_COLS - 1, Math.max(0, Math.floor((x / WORLD.w) * TERRITORY_COLS)));
  const cy = Math.min(TERRITORY_ROWS - 1, Math.max(0, Math.floor((y / WORLD.h) * TERRITORY_ROWS)));
  const idx = cy * TERRITORY_COLS + cx;
  const current = state.claim[idx]!;
  const v = current + (species === PRED ? -amount : amount);
  state.claim[idx] = Math.max(-1, Math.min(1, v));
}

export function step(state: State, dt: number): State {
  const p = state.params;
  const rng = state.rng;
  for (let i = 0; i < state.claim.length; i++) state.claim[i] = state.claim[i]! * 0.996;
  state.regrowCarry += p.plantRegrowth * dt;
  while (state.regrowCarry >= 1) {
    state.regrowCarry--;
    if (state.counts[PLANT]! < Math.min(p.plants, CAPACITY)) {
      const i = spawn(state, PLANT, rng.range(8, WORLD.w - 8), rng.range(8, WORLD.h - 8), 0);
      if (i >= 0) state.births[PLANT] = state.births[PLANT]! + 1;
    }
  }

  state.hash = new SpatialHash(WORLD.w, WORLD.h, Math.max(40, p.perception), CAPACITY, false);
  state.hash.rebuild(state.x, state.y, state.n);

  const initialN = state.n;
  const scratch = state.scratch;
  state.rate.sumPrey += state.counts[HERB]! * dt;
  state.rate.sumPred += state.counts[PRED]! * dt;
  state.rate.sumXY += state.counts[HERB]! * state.counts[PRED]! * dt;

  for (let i = 0; i < initialN; i++) {
    if (state.dead[i]) continue;
    const species = state.species[i]!;
    if (species === PLANT) continue;
    const isPred = species === PRED;
    const x = state.x[i]!;
    const y = state.y[i]!;
    const speed = isPred ? p.predatorSpeed : p.herbivoreSpeed;
    let best = -1;
    let bestD2 = p.perception * p.perception;
    const m = state.hash.query(x, y, scratch);
    for (let k = 0; k < m; k++) {
      const j = scratch[k]!;
      if (j === i || state.dead[j]) continue;
      const targetSpecies = state.species[j]!;
      if (isPred ? targetSpecies !== HERB : targetSpecies !== PLANT) continue;
      const dx = state.x[j]! - x;
      const dy = state.y[j]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = j; }
    }
    let ax = 0;
    let ay = 0;
    if (best >= 0) {
      const dx = state.x[best]! - x;
      const dy = state.y[best]! - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      ax = (dx / d) * speed;
      ay = (dy / d) * speed;
      const eatDist = isPred ? 9 : 7;
      if (d < eatDist) {
        state.dead[best] = 1;
        state.counts[state.species[best]!] = state.counts[state.species[best]!]! - 1;
        state.deaths[state.species[best]!] = state.deaths[state.species[best]!]! + 1;
        if (isPred) { state.eaten[1] = state.eaten[1]! + 1; state.rate.predEaten++; }
        else { state.eaten[0] = state.eaten[0]! + 1; state.rate.preyEaten++; }
        state.energy[i] = state.energy[i]! + p.energyGain * (isPred ? 1.35 : 1);
      }
    } else {
      // wander deterministically
      const ang = rng.range(0, Math.PI * 2);
      ax = Math.cos(ang) * speed * 0.55;
      ay = Math.sin(ang) * speed * 0.55;
    }
    const turn = Math.min(1, dt * (isPred ? 6 : 4));
    state.vx[i] = state.vx[i]! + (ax - state.vx[i]!) * turn;
    state.vy[i] = state.vy[i]! + (ay - state.vy[i]!) * turn;
    let nx = x + state.vx[i]! * dt;
    let ny = y + state.vy[i]! * dt;
    if (nx < 4) { nx = 4; state.vx[i] = Math.abs(state.vx[i]!); }
    if (nx > WORLD.w - 4) { nx = WORLD.w - 4; state.vx[i] = -Math.abs(state.vx[i]!); }
    if (ny < 4) { ny = 4; state.vy[i] = Math.abs(state.vy[i]!); }
    if (ny > WORLD.h - 4) { ny = WORLD.h - 4; state.vy[i] = -Math.abs(state.vy[i]!); }
    state.x[i] = nx; state.y[i] = ny;
    state.energy[i] = state.energy[i]! - p.metabolism * dt;
    claimTerritory(state, nx, ny, species, dt * (isPred ? 0.05 : 0.02));

    if (state.energy[i]! <= 0) {
      state.dead[i] = 1;
      state.counts[species] = state.counts[species]! - 1;
      state.deaths[species] = state.deaths[species]! + 1;
      if (species === HERB) state.rate.preyStarved++; else if (species === PRED) state.rate.predStarved++;
      continue;
    }
    const plantOk = state.counts[PLANT]! >= p.plantsToWin;
    if (!isPred && state.energy[i]! >= p.reproduceAt && plantOk && state.n < CAPACITY - 4) {
      state.energy[i] = state.energy[i]! / 2;
      const i2 = spawn(state, HERB, nx + rng.range(-8, 8), ny + rng.range(-8, 8), state.energy[i]!);
      if (i2 >= 0) { state.births[HERB] = state.births[HERB]! + 1; state.rate.preyBorn++; }
    } else if (isPred && state.energy[i]! >= p.reproduceAt * 1.4 && state.counts[HERB]! > 30 && state.n < CAPACITY - 4) {
      state.energy[i] = state.energy[i]! / 2;
      const i2 = spawn(state, PRED, nx + rng.range(-8, 8), ny + rng.range(-8, 8), state.energy[i]!);
      if (i2 >= 0) { state.births[PRED] = state.births[PRED]! + 1; state.rate.predBorn++; }
    }
  }
  compact(state);
  // mean-field Lotka–Volterra companion, advanced with the same dt (RK4).
  const p2 = state.params;
  rk4((_t, y, out) => {
    const prey = Math.max(0, y[0]!);
    const pred = Math.max(0, y[1]!);
    out[0] = p2.alpha * prey - p2.beta * prey * pred;
    out[1] = p2.delta * prey * pred - p2.gamma * pred;
  }, state.time, state.lv, dt, state.odeScratch);
  state.lv[0] = Math.max(0, state.lv[0]!);
  state.lv[1] = Math.max(0, state.lv[1]!);
  state.time += dt;
  return state;
}

/** Estimate per-capita rates from trailing counters; resets the ODE to counts. */
export function calibrateLv(state: State): State {
  const r = state.rate;
  const prey = Math.max(1, state.counts[HERB]!);
  const pred = Math.max(1, state.counts[PRED]!);
  const sumPrey = Math.max(1e-6, r.sumPrey);
  const sumPred = Math.max(1e-6, r.sumPred);
  const sumXY = Math.max(1e-6, r.sumXY);
  state.params = {
    ...state.params,
    lvMode: 'measured',
    alpha: Math.max(0.05, (r.preyBorn - r.preyStarved) / sumPrey),
    beta: Math.max(0.0005, r.preyEaten / Math.max(1e-6, sumXY / Math.max(1, prey))),
    delta: Math.max(0.0005, r.predBorn / Math.max(1e-6, sumXY / Math.max(1, pred))),
    gamma: Math.max(0.05, r.predStarved / sumPred),
  };
  state.lv[0] = state.counts[HERB]!;
  state.lv[1] = state.counts[PRED]!;
  r.lvResets++;
  r.sumPrey = 0; r.sumPred = 0; r.sumXY = 0;
  r.preyBorn = 0; r.preyStarved = 0; r.preyEaten = 0;
  r.predBorn = 0; r.predStarved = 0; r.predEaten = 0;
  return state;
}

export function drought(state: State, x = 400, y = 300, radius = 160): State {
  for (let i = 0; i < state.n; i++) {
    if (state.species[i] !== PLANT) continue;
    if ((state.x[i]! - x) ** 2 + (state.y[i]! - y) ** 2 <= radius * radius) { state.dead[i] = 1; }
  }
  compact(state);
  return state;
}

export function releasePredators(state: State, count = 12): State {
  for (let i = 0; i < count; i++) spawn(state, PRED, state.rng.range(40, WORLD.w - 40), state.rng.range(40, WORLD.h - 40), 110);
  return state;
}

export function applyParams(state: State, params: Params): State {
  state.params = { ...params };
  return state;
}

export function onPointer(state: State, ev: PointerEv): State {
  if (ev.type !== 'down' && ev.type !== 'click') return state;
  if (ev.button === 2) {
    let best = -1;
    let bestD = 32 * 32;
    for (let i = 0; i < state.n; i++) {
      const dx = state.x[i]! - ev.x;
      const dy = state.y[i]! - ev.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      state.counts[state.species[best]!] = state.counts[state.species[best]!]! - 1;
      state.dead[best] = 1;
      compact(state);
    }
    return state;
  }
  if (ev.alt) spawn(state, PRED, ev.x, ev.y, 120);
  else if (ev.shift) { spawn(state, HERB, ev.x, ev.y, 70); spawn(state, HERB, ev.x + 8, ev.y, 70); }
  else for (let k = 0; k < 6; k++) spawn(state, PLANT, ev.x + state.rng.range(-18, 18), ev.y + state.rng.range(-18, 18), 0);
  return state;
}

export function territoryPct(state: State): { herb: number; pred: number; neutral: number } {
  let herb = 0, pred = 0;
  for (let i = 0; i < state.claim.length; i++) {
    const v = state.claim[i]!;
    if (v > 0.08) herb++; else if (v < -0.08) pred++;
  }
  const total = state.claim.length;
  return { herb: herb / total, pred: pred / total, neutral: 1 - (herb + pred) / total };
}

export function diagnosticsExtras(state: State): Record<string, number> {
  const t = territoryPct(state);
  return {
    plants: state.counts[PLANT]!,
    herbivores: state.counts[HERB]!,
    predators: state.counts[PRED]!,
    herbTerritory: Math.round(t.herb * 100),
    predTerritory: Math.round(t.pred * 100),
    eaten: state.eaten[0]! + state.eaten[1]!,
  };
}


export function meanEnergy(state: State, species: number): number {
  let total = 0; let count = 0;
  for (let i = 0; i < state.n; i++) if (state.species[i] === species) { total += state.energy[i]!; count++; }
  return count ? total / count : NaN;
}

export function totalEnergy(state: State): number {
  let total = 0;
  for (let i = 0; i < state.n; i++) total += state.energy[i]!;
  return total;
}

export function runOneEcosystem(p: Params, seed: number, steps = 60 * 45): { extinctPrey: number; extinctPred: number; meanPrey: number; meanPred: number; predPeaks: number; oscillates: number; seriesPrey: Float32Array; seriesPred: Float32Array } {
  const state = init(p, createRng(seed));
  const sampleEvery = 60;
  const n = Math.floor(steps / sampleEvery);
  const sPrey = new Float32Array(n);
  const sPred = new Float32Array(n);
  let predPeaks = 0; let lastPred = state.counts[PRED]!; let rising = false;
  let sumPrey = 0; let sumPred = 0;
  for (let i = 0; i < steps; i++) {
    step(state, 1 / 60);
    sumPrey += state.counts[HERB]!; sumPred += state.counts[PRED]!;
    if (i % sampleEvery === 0) {
      const k = Math.floor(i / sampleEvery);
      if (k < n) { sPrey[k] = state.counts[HERB]!; sPred[k] = state.counts[PRED]!; }
    }
    const pred = state.counts[PRED]!;
    if (pred > lastPred) rising = true;
    else if (rising && pred < lastPred) { predPeaks++; rising = false; }
    lastPred = pred;
  }
  return {
    extinctPrey: state.counts[HERB] === 0 ? 1 : 0,
    extinctPred: state.counts[PRED] === 0 ? 1 : 0,
    meanPrey: sumPrey / steps,
    meanPred: sumPred / steps,
    predPeaks,
    oscillates: predPeaks >= 2 ? 1 : 0,
    seriesPrey: sPrey,
    seriesPred: sPred,
  };
}

export { createRng, deriveSeed };
