import type { Metric, Simulation } from '../../core/types';
import { meta } from './meta';
import { WORLD, defaultParams, init, paramSchema, step, type Params, type State } from './logic';
import { render } from './render';

function metrics(state: State): Metric[] {
  const ratio = state.pred > 0 ? state.prey / state.pred : Number.POSITIVE_INFINITY;
  return [
    { label: 'prey x(t)', value: state.prey.toFixed(1) },
    { label: 'predators y(t)', value: state.pred.toFixed(1) },
    { label: 'x/y', value: Number.isFinite(ratio) ? ratio.toFixed(2) : '∞' },
  ];
}

const predatorPrey: Simulation<Params, State> = {
  meta,
  defaultParams,
  paramSchema,
  world: WORLD,
  init,
  step,
  render,
  metrics,
};

export default predatorPrey;
