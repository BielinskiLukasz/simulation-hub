import { describe, it } from 'vitest';
import { createRng } from '../../core/rng';
import { Runner } from '../../core/runner';
import { assertFrameRateIndependence, hashFloat64 } from '../../core/testing';
import { defaultParams, init, step, type Params, type State } from './logic';
import sim from './index';

describe('ecosystem frame-rate and ledgers', () => {
  it('frame-rate independence with grass and LV', () => {
    const p = { ...defaultParams, plants: 150, herbivores: 20, predators: 4, lvMode: 'manual' } as Params;
    const direct = init(p, createRng(11));
    const hashes = new Map<number, number>();
    hashes.set(0, hashFloat64([direct.x, direct.y, direct.energy]));
    for (let i = 1; i <= 60; i++) { step(direct, 1 / 60); hashes.set(i, hashFloat64([direct.x, direct.y, direct.energy])); }
    let current: Runner<Params, State> | null = null;
    assertFrameRateIndependence({
      directHashAt: (n) => hashes.get(n)!,
      makeRunner: () => { current = new Runner({ ...sim, render: () => undefined }, p, 11, () => ({ ctx: null as never, width: 800, height: 600, theme: 'dark' })); return current; },
      hashRunner: () => hashFloat64([current!.state.x, current!.state.y, current!.state.energy]),
      maxSteps: 60,
    });
  });
});
