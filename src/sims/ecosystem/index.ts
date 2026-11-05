import type { BatchSpec, ChartSpec, CompareSpec, Diagnostics, RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import {
  applyParams, calibrateLv, defaultParams, diagnosticsExtras, drought, init, meanEnergy, onPointer,
  paramSchema, releasePredators, runOneEcosystem, step, territoryPct, totalEnergy,
  type Params, type State,
} from './logic';
import { render } from './render';

const compare: CompareSpec<Record<string, unknown>> = {
  modes: [
    { id: 'predators', label: 'With predators vs plants only', paneKeys: ['predators'], bDefaults: { predators: 0 }, note: 'Same seed and plants: watch herbivores overshoot and crash without predation.' },
    { id: 'perception', label: 'Perception 96 vs 170', paneKeys: ['perception'], bDefaults: { perception: 170 }, note: 'Longer sight → faster grazing and earlier collapse.' },
    { id: 'regrowth', label: 'Regrowth 45 vs 15 /s', paneKeys: ['plantRegrowth'], bDefaults: { plantRegrowth: 15 }, note: 'Scarce food limits the food web.' },
  ],
};

const sim: RealtimeSimulation<Params, State> = {
  kind: 'realtime',
  meta,
  defaultParams,
  paramSchema,
  init,
  step: (s, dt) => step(s, dt),
  render,
  applyParams,
  onPointer,
  getStats: (s) => ({
    plants: s.counts[0]!,
    herbivores: s.counts[1]!,
    predators: s.counts[2]!,
    eaten: s.eaten[0]! + s.eaten[1]!,
  }),
  camera: {
    initial: () => ({ cx: 400, cy: 300, zoom: 1 }),
    fit: () => ({ x: 0, y: 0, w: 800, h: 600 }),
    minZoom: 0.4,
    maxZoom: 6,
  },
  diagnostics: {
    sample: (s): Diagnostics => ({ time: s.time, extras: diagnosticsExtras(s) }),
    everySteps: () => 5,
  },
  metrics: {
    metrics: [
      { id: 'prey', label: 'Herbivores', fmt: 'int' },
      { id: 'pred', label: 'Predators', fmt: 'int' },
      { id: 'lvPrey', label: 'LV herbivores', fmt: 'float' },
      { id: 'lvPred', label: 'LV predators', fmt: 'float' },
      { id: 'grassFrac', label: 'Herbivore territory', fmt: 'pct' },
      { id: 'meanEnergyPrey', label: 'Mean prey energy', fmt: 'float' },
      { id: 'energyTotal', label: 'Agent energy', fmt: 'float' },
    ],
    sample: (s, _shared, out) => {
      out[0] = s.counts[1]!;
      out[1] = s.counts[2]!;
      out[2] = s.lv[0]!;
      out[3] = s.lv[1]!;
      out[4] = territoryPct(s).herb;
      out[5] = meanEnergy(s, 1);
      out[6] = totalEnergy(s);
    },
    every: { by: 'steps', n: 10 },
    policy: 'decimate',
    charts: [
      { id: 'populations', title: 'ABM (solid) vs Lotka–Volterra (mean-field) overlay', kind: 'lines', series: ['prey', 'pred', 'lvPrey', 'lvPred'] },
      { id: 'phase', title: 'Phase portrait — prey vs predators (LV)', kind: 'xy', x: 'lvPrey', series: ['lvPred'] },
      { id: 'energy', title: 'Energy & territory', kind: 'lines', series: ['meanEnergyPrey', 'grassFrac'], hideByDefault: true },
    ] as ChartSpec[],
  },
  actions: [
    { id: 'calibrate', label: 'Calibrate LV from ABM', hint: 'Estimate α β δ γ from trailing counters and reset the ODE to current populations' },
    { id: 'drought', label: 'Drought', hint: 'Remove plants around the centre' },
    { id: 'release', label: 'Release predators', hint: 'Add 12 predators' },
  ],
  onAction: (s, id) => {
    if (id === 'calibrate') return calibrateLv(s);
    if (id === 'drought') return drought(s);
    if (id === 'release') return releasePredators(s);
    return s;
  },
  batch: {
    metrics: [
      { id: 'meanPrey', label: 'Mean herbivores', kind: 'scalar' },
      { id: 'meanPred', label: 'Mean predators', kind: 'scalar' },
      { id: 'oscillates', label: 'Sustained oscillations', kind: 'indicator' },
      { id: 'extinctPrey', label: 'Prey extinction', kind: 'indicator' },
      { id: 'extinctPred', label: 'Predator extinction', kind: 'indicator' },
    ],
    runOne(params, seed) {
      const r = runOneEcosystem(params, seed, 60 * 45);
      return { values: Float64Array.from([r.meanPrey, r.meanPred, r.oscillates, r.extinctPrey, r.extinctPred]) };
    },
    sweep: { key: 'plantRegrowth', label: 'regrowth /s', values: [10, 20, 35, 45, 70, 90] },
    defaults: { runs: 8, maxRuns: 60 },
  } as BatchSpec<Params>,
  compare: compare as CompareSpec<Record<string, unknown>>,
  about: {
    summary:
      'Plants regrow, herbivores graze them, predators hunt herbivores — every interaction is an energy transfer with a cost. Population booms and busts emerge from local rules, not scripted events, and the same seed replays the same history.',
    bullets: [
      'Spatial queries use the non-wrapping uniform hash from Phase 5: agents near an edge never see across the world. Rebuilt each step with zero allocations.',
      'Territory overlay: herbivore and predator claims spread where agents spend time and decay each step. Watch grazing corridors appear near plant clusters.',
      'Click paints plants, Shift+click adds herbivores, Alt+click adds a predator, right-click removes the nearest agent. Camera: wheel zoom, Space+drag pan, F fit.',
      'Compare mode runs two ecosystems in lockstep on the same seed: predators vs none, long vs short perception, abundant vs scarce regrowth.',
      'Live parameters (regrowth, speeds, perception, metabolism, reproduction energy, LV rates) apply without resetting positions; initial populations re-init.',
      'Actions: Calibrate LV fits mean-field rates from trailing counters and resets the ODE to current populations; Drought clears plants around the centre; Release predators adds 12.',
      'Batch tab: 12 seeds per sweep point of plant regrowth, with Wilson intervals for oscillation/extinction indicators — ABM oscillations are fragile, unlike the mean-field ODE.',
    ],
    invariant: 'Populations stay finite and in-bounds for any seeded run; the population ledger (births − deaths) is exact; the LV companion is a pure RK4 overlay on the same clock.',
  },
  concepts:
    '## Concepts\n\n**Predator–prey cycles.** Herbivores convert plants into herbivore biomass; predators convert herbivores into predators. Each level has a metabolic cost, so overshoot is followed by famine — the Lotka–Volterra boom-and-bust, now spatial.\n\n**Why space matters.** A well-mixed model can sustain cycles that a spatial one extinctions faster, because refuges and local depletion matter. The non-wrapping hash makes edges real: no accidental teleporting neighbours.\n\n**Territory as a faded trace.** Claim values are written by presence and decay every step. They are not a force in the dynamics; they are a readable residue of where each guild spends time.\n\n**References.** Lotka (1925); Volterra (1926); Grimm & Railsback, *Individual-based Modeling and Ecology*.\n\n*Model simplifications: no age structure, no disease, no carrying capacity by habitat, energy is the only currency.*',
};

export default sim;
