// ─── core/des/headless.ts — run an event sim without any UI ────────────────
// Used by tests, compare tabs, and (later) the Phase-6 batch runner.

import type { EventSimulation, LogEntry } from '../types';
import { Engine } from './engine';

export interface HeadlessOptions {
  untilTime?: number;
  maxEvents?: number;
  input?: unknown;
}

export interface HeadlessResult<S> {
  state: S;
  log: LogEntry[];
  head: number;
  now: number;
}

export function runHeadless<P, S, E, A, I = unknown, Sh = unknown>(
  sim: EventSimulation<P, S, E, A, I, Sh>,
  params: P,
  seed: number,
  opts: HeadlessOptions = {},
): HeadlessResult<S> {
  const engine = new Engine(sim, params, seed, opts.input as I | undefined);
  if (opts.untilTime !== undefined) engine.runUntil(opts.untilTime, opts.maxEvents);
  else if (opts.maxEvents !== undefined) {
    // step-capped mode: stop quietly at the cap (tests, compare previews)
    let n = 0;
    while (n < opts.maxEvents && engine.step()) n++;
  } else engine.runToEnd();
  return { state: engine.state, log: engine.log, head: engine.head, now: engine.now };
}
