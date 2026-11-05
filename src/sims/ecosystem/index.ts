import type { CompareSpec, Diagnostics, RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import {
  applyParams, defaultParams, diagnosticsExtras, init, onPointer, paramSchema, step,
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
  compare: compare as CompareSpec<Record<string, unknown>>,
  about: {
    summary:
      'Plants regrow, herbivores graze them, predators hunt herbivores — every interaction is an energy transfer with a cost. Population booms and busts emerge from local rules, not scripted events, and the same seed replays the same history.',
    bullets: [
      'Spatial queries use the non-wrapping uniform hash from Phase 5: agents near an edge never see across the world. Rebuilt each step with zero allocations.',
      'Territory overlay: herbivore and predator claims spread where agents spend time and decay each step. Watch grazing corridors appear near plant clusters.',
      'Click paints plants, Shift+click adds herbivores, Alt+click adds a predator, right-click removes the nearest agent. Camera: wheel zoom, Space+drag pan, F fit.',
      'Compare mode runs two ecosystems in lockstep on the same seed: predators vs none, long vs short perception, abundant vs scarce regrowth.',
      'Live parameters (regrowth, speeds, perception, metabolism, reproduction energy) apply without resetting positions; initial populations re-init.',
    ],
    invariant: 'Energy is conserved per transfer (a meal only moves energy), populations stay finite for any seeded run, and agents never leave the world bounds.',
  },
  concepts:
    '## Concepts\n\n**Predator–prey cycles.** Herbivores convert plants into herbivore biomass; predators convert herbivores into predators. Each level has a metabolic cost, so overshoot is followed by famine — the Lotka–Volterra boom-and-bust, now spatial.\n\n**Why space matters.** A well-mixed model can sustain cycles that a spatial one extinctions faster, because refuges and local depletion matter. The non-wrapping hash makes edges real: no accidental teleporting neighbours.\n\n**Territory as a faded trace.** Claim values are written by presence and decay every step. They are not a force in the dynamics; they are a readable residue of where each guild spends time.\n\n**References.** Lotka (1925); Volterra (1926); Grimm & Railsback, *Individual-based Modeling and Ecology*.\n\n*Model simplifications: no age structure, no disease, no carrying capacity by habitat, energy is the only currency.*',
};

export default sim;
