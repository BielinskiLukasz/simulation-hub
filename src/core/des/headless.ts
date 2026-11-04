// ─── core/des/headless.ts — run an event sim without any UI ────────────────
// Used by tests, compare tabs, and (later) the Phase-6 batch runner.

import type { EventSimulation, LogEntry } from '../types';
import { Engine } from './engine';

export interface HeadlessOptions {
  untilTime?: number;
  maxEvents?: number;
}

export interface HeadlessResult<S> {
  state: S;
  log: LogEntry[];
  head: number;
  now: number;
}

export function runHeadless<P, S, E, A>(
  sim: EventSimulation<P, S, E, A>,
  params: P,
  seed: number,
  opts: HeadlessOptions = {},
): HeadlessResult<S> {
  const engine = new Engine(sim, params, seed);
  if (opts.untilTime !== undefined) engine.runUntil(opts.untilTime, opts.maxEvents);
  else if (opts.maxEvents !== undefined) {
    // step-capped mode: stop quietly at the cap (tests, compare previews)
    let n = 0;
    while (n < opts.maxEvents && engine.step()) n++;
  } else engine.runToEnd();
  return { state: engine.state, log: engine.log, head: engine.head, now: engine.now };
}
