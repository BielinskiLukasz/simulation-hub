import type { Metric, Simulation } from '../../core/types';
import { meta } from './meta';
import {
  WORLD,
  defaultParams,
  energy,
  init,
  paramSchema,
  step,
  type Params,
  type State,
} from './logic';
import { render } from './render';

function metrics(state: State): Metric[] {
  const first = state.arms[0];
  const e = first ? energy(first, state.params.gravity) : 0;
  return [
    { label: 'arms', value: String(state.arms.length) },
    { label: 'energy[0]', value: e.toFixed(3) },
    { label: 'integrator', value: 'rk4 · h=1/240' },
  ];
}

const doublePendulum: Simulation<Params, State> = {
  meta,
  defaultParams,
  paramSchema,
  world: WORLD,
  init,
  step,
  render,
  metrics,
};

export default doublePendulum;
