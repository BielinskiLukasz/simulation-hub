import type { Metric, Simulation } from '../../core/types';
import { meta } from './meta';
import {
  WORLD,
  defaultParams,
  init,
  meanNeighbours,
  paramSchema,
  step,
  type Params,
  type State,
} from './logic';
import { render } from './render';

function metrics(state: State): Metric[] {
  return [
    { label: 'boids', value: String(state.boids.length) },
    { label: 'avg neighbours', value: meanNeighbours(state).toFixed(1) },
    { label: 'world', value: state.params.wrap ? 'torus' : 'box' },
  ];
}

const boids: Simulation<Params, State> = {
  meta,
  defaultParams,
  paramSchema,
  world: WORLD,
  init,
  step,
  render,
  metrics,
};

export default boids;
