// ─── core/des/testing.ts — replay/property test utilities ──────────────────

import type { EventSimulation } from '../types';
import { createRng } from '../rng';
import { Engine } from './engine';
import { Player } from './player';

/** Fail if state contains anything structuredClone would mangle. */
export function assertPlainData(value: unknown, path = 'state'): void {
  const seen = new Set<object>();
  const walk = (v: unknown, p: string): void => {
    if (v === null || v === undefined) return;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean' || t === 'bigint') return;
    if (t === 'function' || t === 'symbol') throw new Error(`assertPlainData: ${p} is a ${t}`);
    if (t === 'object') {
      const obj = v as object;
      if (seen.has(obj)) return;
      seen.add(obj);
      if (Array.isArray(v) || ArrayBuffer.isView(v)) {
        if (Array.isArray(v)) v.forEach((item, i) => walk(item, `${p}[${i}]`));
        return;
      }
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) {
        throw new Error(`assertPlainData: ${p} is a class instance (${obj.constructor?.name ?? 'unknown'})`);
      }
      for (const [k, val] of Object.entries(obj)) walk(val, `${p}.${k}`);
    }
  };
  walk(value, path);
}

export interface ReplayOptions {
  events: number;
  cuts: number[];
  actions?: { atEvent: number; make: (state: unknown) => unknown }[];
}

/**
 * The key Phase-3 test: run to N; for each cut, a fresh Player seeked to the
 * cut and run to N must produce a deep-equal log and final state.
 */
export function assertReplayEquivalence<P, S, E, A>(
  sim: EventSimulation<P, S, E, A>,
  params: P,
  seed: number,
  opts: ReplayOptions,
): void {
  const reference = new Player(sim, params, seed);
  const pendingActions = [...(opts.actions ?? [])].sort((a, b) => a.atEvent - b.atEvent);
  while (reference.head < opts.events) {
    while (pendingActions.length > 0 && pendingActions[0]!.atEvent === reference.head) {
      const a = pendingActions.shift()!;
      reference.act(a.make(reference.state) as A);
    }
    if (!reference.stepEvent()) break;
  }
  const refLog = structuredClone(reference.log);
  const refState = structuredClone(reference.state);
  const refHead = reference.head;

  for (const cut of opts.cuts) {
    // Mirror run: forward to the end applying the same actions at the same
    // positions, then scrub back to the cut and forward again. Inputs are
    // re-applied from the input log during replay — final log/state must
    // match the uninterrupted reference exactly.
    const p = new Player(sim, params, seed);
    const acts = [...(opts.actions ?? [])].sort((a, b) => a.atEvent - b.atEvent);
    while (p.head < refHead) {
      while (acts.length > 0 && acts[0]!.atEvent === p.head) {
        const a = acts.shift()!;
        p.act(a.make(p.state) as A);
      }
      if (!p.stepEvent()) break;
    }
    p.seekEvent(cut);
    p.seekEvent(refHead);
    const gotLog = structuredClone(p.log);
    const gotState = structuredClone(p.state);
    if (JSON.stringify(gotLog) !== JSON.stringify(refLog)) {
      throw new Error(`assertReplayEquivalence: log diverges for cut ${cut} (seed ${seed})`);
    }
    if (JSON.stringify(gotState) !== JSON.stringify(refState)) {
      throw new Error(`assertReplayEquivalence: state diverges for cut ${cut} (seed ${seed})`);
    }
  }
}

export interface FuzzResult {
  violations: { id: string; message: string; atHead: number }[];
  head: number;
}

/** Seeded random actions + per-event invariant checks (Raft fuzz harness). */
export function fuzzActions<P, S, E, A>(
  sim: EventSimulation<P, S, E, A>,
  params: P,
  seed: number,
  makeAction: (rng: ReturnType<typeof createRng>, state: S) => A | null,
  steps: number,
  actionEvery = 37,
): FuzzResult {
  const engine = new Engine(sim, params, seed);
  const actionRng = createRng(seed ^ 0x5f3759df);
  const violations: FuzzResult['violations'] = [];
  const checkAll = () => {
    for (const inv of sim.invariants ?? []) {
      const msg = inv.check(engine.state);
      if (msg) violations.push({ id: inv.id, message: msg, atHead: engine.head });
    }
  };
  checkAll();
  for (let i = 0; i < steps; i++) {
    if (!engine.step()) break;
    if (i % actionEvery === actionEvery - 1) {
      const action = makeAction(actionRng, engine.state);
      if (action) engine.act(action);
    }
    checkAll();
    if (violations.length > 5) break;
  }
  return { violations, head: engine.head };
}
