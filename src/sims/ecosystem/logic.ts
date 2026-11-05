// ─── Ecosystem · logic.ts — spatial agents, energy flow, territory ─────────
// Deterministic: rng only, index-order loops, swap-into-place compaction.
// Neighbours come from the NON-WRAPPING SpatialHash (Phase 5 addition), so
// agents near an edge never see the far side. World is y-down, 800×600.

import type { ParamSchema, Rng } from '../../core/types';
import type { PointerEv } from '../../core/input';
import { SpatialHash } from '../../core/spatial-hash';
import { createRng } from '../../core/rng';
import { lvStep, lvFirstIntegral, lvEquilibrium, estimateRates, type LVState } from './lv';
import type { BatchSpec } from '../../core/types';

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
  alpha: number;
  beta: number;
  delta: number;
  gamma: number;
  grassRegrow: number;
  grassEnergy: number;
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
  lvMode: 'measured',
  alpha: 0.5,
  beta: 0.002,
  delta: 0.002,
  gamma: 0.3,
  grassRegrow: 2,
  grassEnergy: 40,
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
  lvMode: { kind: 'select', label: 'Lotka–Volterra overlay', options: ['off', 'manual', 'measured'], live: true },
  alpha: { kind: 'range', label: 'LV α (prey growth)', min: 0, max: 2, step: 0.01, live: true, group: 'ODE overlay' },
  beta: { kind: 'range', label: 'LV β (predation)', min: 0, max: 0.02, step: 0.0005, live: true, group: 'ODE overlay' },
  delta: { kind: 'range', label: 'LV δ (predator growth)', min: 0, max: 0.02, step: 0.0005, live: true, group: 'ODE overlay' },
  gamma: { kind: 'range', label: 'LV γ (predator death)', min: 0, max: 2, step: 0.01, live: true, group: 'ODE overlay' },
  grassRegrow: { kind: 'range', label: 'Grass regrow ticks', min: 10, max: 240, step: 5, live: true, group: 'Grass grid' },
  grassEnergy: { kind: 'range', label: 'Energy per grass cell', min: 5, max: 160, step: 5, live: true, group: 'Grass grid' },
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
  grass: Uint8Array;
  regrow: Uint16Array;
  lv: LVState | null;
  integralPrey: number;
  integralPred: number;
  integralProduct: number;
  grassEaten: number;
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
    grass: (() => { const g = new Uint8Array(60 * 40); g.fill(1); return g; })(),
    regrow: new Uint16Array(60 * 40),
    lv: params.lvMode === 'off' ? null : { prey: params.herbivores, pred: params.predators, time: 0, alpha: params.alpha, beta: params.beta, delta: params.delta, gamma: params.gamma },
    integralPrey: 0,
    integralPred: 0,
    integralProduct: 0,
    grassEaten: 0,
    time: 0,
    births: [0, 0, 0],
    deaths: [0, 0, 0],
    eaten: [0, 0],
    rng,
    params: { ...params },
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
  // Grass grid: regrow eaten cells and consume under grazers.
  for (let c = 0; c < state.regrow.length; c++) if (state.regrow[c]! > 0) {
    state.regrow[c] = state.regrow[c]! - 1;
    if (state.regrow[c]! <= 0) state.grass[c] = 1;
  }
  if (state.lv && p.lvMode !== 'off') {
    if (p.lvMode === 'measured' && state.time > 20 && state.integralPrey > 0 && state.integralPred > 0 && state.integralProduct > 0) {
      const rates = estimateRates({
        integralPrey: state.integralPrey, integralPred: state.integralPred, integralProduct: state.integralProduct,
        preyBorn: state.births[HERB]!, preyEaten: state.eaten[0]!, preyStarved: state.deaths[HERB]!,
        predBorn: state.births[PRED]!, predStarved: state.deaths[PRED]!,
        meanPrey: state.counts[HERB]!, meanPred: state.counts[PRED]!,
      });
      state.lv.alpha = rates.alpha; state.lv.beta = rates.beta; state.lv.delta = rates.delta; state.lv.gamma = rates.gamma;
    }
    lvStep(state.lv, dt);
  }
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
  const boost = 1 + state.eaten[0]! * 0 + state.eaten[1]! * 0;

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
        state.eaten[isPred ? 1 : 0] = state.eaten[isPred ? 1 : 0]! + 1;
        state.energy[i] = state.energy[i]! + p.energyGain * boost * (isPred ? 1.35 : 1);
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
    if (species === HERB) {
      const gx = Math.min(59, Math.max(0, Math.floor((nx / WORLD.w) * 60)));
      const gy = Math.min(39, Math.max(0, Math.floor((ny / WORLD.h) * 40)));
      const cell = gy * 60 + gx;
      if (state.grass[cell] === 1) {
        state.grass[cell] = 0;
        state.regrow[cell] = Math.max(10, Math.round(p.grassRegrow));
        state.energy[i] = state.energy[i]! + p.grassEnergy;
        state.grassEaten++;
      }
    }
    state.energy[i] = state.energy[i]! - p.metabolism * dt;
    claimTerritory(state, nx, ny, species, dt * (isPred ? 0.05 : 0.02));

    if (state.energy[i]! <= 0) {
      state.dead[i] = 1;
      state.counts[species] = state.counts[species]! - 1;
      state.deaths[species] = state.deaths[species]! + 1;
      continue;
    }
    const plantOk = state.counts[PLANT]! >= p.plantsToWin;
    if (!isPred && state.energy[i]! >= p.reproduceAt && plantOk && state.n < CAPACITY - 4) {
      state.energy[i] = state.energy[i]! / 2;
      const i2 = spawn(state, HERB, nx + rng.range(-8, 8), ny + rng.range(-8, 8), state.energy[i]!);
      if (i2 >= 0) state.births[HERB] = state.births[HERB]! + 1;
    } else if (isPred && state.energy[i]! >= p.reproduceAt * 1.4 && state.counts[HERB]! > 30 && state.n < CAPACITY - 4) {
      state.energy[i] = state.energy[i]! / 2;
      const i2 = spawn(state, PRED, nx + rng.range(-8, 8), ny + rng.range(-8, 8), state.energy[i]!);
      if (i2 >= 0) state.births[PRED] = state.births[PRED]! + 1;
    }
  }
  compact(state);
  const prey = state.counts[HERB]!;
  const pred = state.counts[PRED]!;
  state.integralPrey += prey * dt;
  state.integralPred += pred * dt;
  state.integralProduct += prey * pred * dt;
  state.time += dt;
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


/** Contract v6 actions: calibrate the ODE, drought a patch, release predators. */
export function onAction(state: State, id: string): State {
  const rng = state.rng;
  if (id === 'calibrate') {
    if (state.lv) {
      state.lv.prey = state.counts[HERB]!;
      state.lv.pred = state.counts[PRED]!;
      if (state.integralPrey > 0 && state.integralPred > 0 && state.integralProduct > 0) {
        const rates = estimateRates({
          integralPrey: state.integralPrey, integralPred: state.integralPred, integralProduct: state.integralProduct,
          preyBorn: state.births[HERB]!, preyEaten: state.eaten[0]!, preyStarved: state.deaths[HERB]!,
          predBorn: state.births[PRED]!, predStarved: state.deaths[PRED]!,
          meanPrey: state.counts[HERB]!, meanPred: state.counts[PRED]!,
        });
        state.lv.alpha = rates.alpha; state.lv.beta = rates.beta; state.lv.delta = rates.delta; state.lv.gamma = rates.gamma;
      }
    }
  } else if (id === 'drought') {
    for (let c = 0; c < state.grass.length; c++) { state.grass[c] = 0; state.regrow[c] = Math.max(60, Math.round(state.params.grassRegrow * 1.5)); }
  } else if (id === 'release-predators') {
    for (let k = 0; k < 12; k++) spawn(state, PRED, rng.range(40, WORLD.w - 40), rng.range(40, WORLD.h - 40), 120);
  }
  return state;
}

export const ecosystemBatch: BatchSpec<Params> = {
  metrics: [
    { id: 'extinctPrey', label: 'Prey extinction', kind: 'indicator' },
    { id: 'extinctPred', label: 'Predator extinction', kind: 'indicator' },
    { id: 'meanPrey', label: 'Mean prey', kind: 'scalar' },
    { id: 'meanPred', label: 'Mean predators', kind: 'scalar' },
    { id: 'oscillates', label: 'Oscillates', kind: 'indicator' },
  ],
  series: [{ id: 'populations', label: 'populations', dt: 2, n: 30 }],
  runOne(params, seed) {
    const state = init({ ...params, lvMode: 'off' }, createRng(seed));
    const series: number[] = [];
    for (let i = 0; i < 900; i++) {
      step(state, 1 / 60);
      if (i % 60 === 0) series.push(state.counts[HERB]!);
    }
    const extinctPrey = state.counts[HERB] === 0 ? 1 : 0;
    const extinctPred = state.counts[PRED] === 0 ? 1 : 0;
    const prey = state.counts[HERB]!;
    const pred = state.counts[PRED]!;
    // Oscillation = at least two local predator maxima across the recorded series.
    let peaks = 0;
    for (let i = 1; i < series.length - 1; i++) if (series[i]! > series[i - 1]! && series[i]! >= series[i + 1]!) peaks++;
    return {
      values: Float64Array.from([extinctPrey, extinctPred, prey, pred, peaks >= 2 ? 1 : 0]),
      series: [Float32Array.from(series)],
    };
  },
  sweep: { key: 'plantRegrowth', label: 'regrowth', values: [15, 30, 45, 80, 120] },
  defaults: { runs: 20, maxRuns: 100 },
};

export { lvFirstIntegral, lvEquilibrium };
