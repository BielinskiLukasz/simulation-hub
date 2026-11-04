import type { RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import { render } from './render';
import { defaultParams, paramSchema, sandSim, type Params, type State } from './logic';

const sim: RealtimeSimulation<Params, State> = {
  kind: 'realtime',
  meta,
  defaultParams,
  paramSchema,
  init: sandSim.init,
  step: sandSim.step,
  render,
  applyParams: sandSim.applyParams,
  onEdit: sandSim.onEdit,
  getStats: sandSim.getStats,
  editor: sandSim.editor,
  about: {
    summary:
      'A 400×300 cellular-automaton sandbox: sand piles, water levels and sinks sand, gases rise and dissipate, fire spreads through plants and lava quenches into stone. Materials and reactions are data tables; the hot loop allocates nothing.',
    bullets: [
      'Paint while it runs: the shared editor writes through the runner’s edit queue, so edits land on step boundaries (reproducible with the same seed + edit script).',
      'Scan order is bottom→top with alternating left/right direction, and a per-tick stamp prevents any particle moving twice in one step — no drift, no double moves.',
      'Data-driven reactions: lava + water → stone + steam, fire + plant → fire, plant + water → growth. Add a reaction by adding one table row.',
      '400×300 at 60 fps: rendering is one ImageData write per frame, no fillRect per cell.',
      'Scene presets: hourglass, forest, lava-lake, rain, empty. Edges can be solid walls or open (particles leave the world).',
    ],
    invariant: 'With no reactions in play, the sand/water/stone counts are conserved; sand settles into piles with slope ≤ 1.',
  },
  concepts:
    '## Concepts\n\n**Falling sand ca.** The classic cellular automaton: powders fall and slide, liquids spread, gases rise. Order of updates matters; scanning bottom-to-top and alternating horizontal direction prevents directional bias and double moves.\n\n**Density swap.** Sand sinks through water because it is denser: when a particle tries to move into a lighter liquid, the two swap. That single rule yields stratification without any fluid solver.\n\n**Reactions as data.** Quenching lava into stone is one table row (`lava + water → stone + steam`), not a special case. The hot loop performs one lookup per neighbour.\n\n**This is a model.** No pressure, viscosity fields, or thermal simulation — just enough rules to be legible. Noita’s GDC talk is the canonical reference for scaling this idea with chunking.',
};

export default sim;
