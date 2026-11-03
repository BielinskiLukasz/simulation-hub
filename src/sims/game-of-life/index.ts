import type { Metric, Simulation } from '../../core/types';
import { meta } from './meta';
import { RULES, WORLD, defaultParams, init, paramSchema, step, type Params, type State } from './logic';
import { render } from './render';

function metrics(state: State): Metric[] {
  const rule = RULES[state.params.rule] ?? RULES.life;
  return [
    { label: 'gen', value: String(state.gen) },
    { label: 'alive', value: state.alive.toLocaleString('en-US') },
    { label: 'grid', value: `${state.cols}×${state.rows}` },
    { label: 'rule', value: rule.label.replace(/^[^ ]+ /, '') },
  ];
}

const gameOfLife: Simulation<Params, State> = {
  meta,
  defaultParams,
  paramSchema,
  world: WORLD,
  init,
  step,
  render,
  metrics,
};

export default gameOfLife;
