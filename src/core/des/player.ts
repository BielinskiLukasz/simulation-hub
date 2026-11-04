// ─── core/des/player.ts — time-travel over the engine ──────────────────────
// state = f(params, seed, inputLog). Periodic snapshots + bounded replay:
//  • position = head (events processed). Inputs with atEvent = n apply
//    right AFTER event n (atEvent = 0: before the first event).
//  • seek back: restore nearest snapshot ≤ n, replay to n, truncate log.
//  • seek forward: just run — deterministic given the inputs.
//  • act in the past: truncate inputs/log beyond n (a branch).
// See docs/DESIGN-TIME-TRAVEL.md.

import type { EventSimulation } from '../types';
import { Engine, type EngineSnapshot } from './engine';

export interface PlayerOptions {
  snapshotEvery?: number; // default 200
  maxSnapshots?: number; // default 400
}

interface Input<A> {
  atEvent: number;
  action: A;
}

export class Player<P, S, E, A, I = unknown, Sh = unknown> {
  private engine: Engine<P, S, E, A, I, Sh>;
  private snapshots = new Map<number, EngineSnapshot<S, E>>();
  private inputs: Input<A>[] = [];
  private snapshotEvery: number;
  private maxSnapshots: number;
  private playNow = 0; // continuous render clock (sim units)
  private _maxComputed = 0;

  constructor(
    private sim: EventSimulation<P, S, E, A, I, Sh>,
    private params: P,
    private seed: number,
    opts: PlayerOptions & { input?: I } = {},
  ) {
    this.snapshotEvery = opts.snapshotEvery ?? 200;
    this.maxSnapshots = opts.maxSnapshots ?? 400;
    this.input = opts.input;
    this.engine = new Engine(sim, params, seed, this.input);
    this.takeSnapshot();
  }

  private input?: I;
  get shared(): Sh { return this.engine.shared; }

  get state(): S { return this.engine.state; }
  get head(): number { return this.engine.head; }
  get maxComputed(): number { return this._maxComputed; }
  get now(): number { return Math.max(this.playNow, this.engine.now); }
  get log() { return this.engine.log; }
  get params_(): P { return this.params; }
  get seed_(): number { return this.seed; }
  get finished(): boolean {
    if (this.sim.isFinished?.(this.engine.state)) return true;
    return this.engine.peekTime() === undefined && this.head >= this._maxComputed;
  }
  get inputLog(): readonly Input<A>[] { return this.inputs; }

  /** Playback: advance the continuous clock, processing due events. */
  advance(wallDtSeconds: number, speed: number, maxEvents = 2000): void {
    const target = this.playNow + wallDtSeconds * speed * this.sim.playback.baseRate;
    let processed = 0;
    for (;;) {
      const t = this.engine.peekTime();
      if (t === undefined || t > target || processed >= maxEvents) break;
      this.stepEventInternal();
      processed++;
    }
    // clock moves even between events; when queue is empty it rests at target
    this.playNow = Math.max(target, this.engine.now);
    if (processed >= maxEvents) this.playNow = this.engine.now; // carry the debt next frame
  }

  stepEvent(): boolean {
    return this.stepEventInternal();
  }

  stepBack(): void {
    if (this.head > 0) this.seekEvent(this.head - 1);
  }

  seekEvent(n: number): void {
    const target = Math.max(0, Math.min(Math.floor(n), this._maxComputed));
    if (target === this.head) {
      this.playNow = this.engine.now;
      return;
    }
    if (target < this.head) {
      // restore nearest snapshot ≤ target, then replay forward
      let best = 0;
      for (const h of this.snapshots.keys()) if (h <= target && h > best) best = h;
      const snap = this.snapshots.get(best);
      if (snap) this.engine.restore(snap);
      // inputs at the snapshot position were already applied when taken;
      // replay applies inputs as events complete below.
    }
    while (this.engine.head < target) {
      if (!this.stepEventInternal(true)) break;
    }
    this.engine.log.length = this.logLengthAt(target);
    this.playNow = this.engine.now;
  }

  seekTime(t: number): void {
    // last event with time ≤ t (binary search over eventTimes)
    const times = this.engine.eventTimes;
    let lo = 0;
    let hi = this._maxComputed;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if ((times[mid] ?? Infinity) <= t) lo = mid;
      else hi = mid - 1;
    }
    this.seekEvent(lo);
  }

  act(action: A): { branched: boolean; discarded: number } {
    const at = this.head;
    const branched = at < this._maxComputed;
    let discarded = 0;
    if (branched) {
      discarded = this.inputs.filter((i) => i.atEvent > at).length;
      this.inputs = this.inputs.filter((i) => i.atEvent <= at);
      this._maxComputed = at;
      // snapshots beyond the branch point belong to the old future
      for (const h of [...this.snapshots.keys()]) if (h > at) this.snapshots.delete(h);
    }
    this.inputs.push({ atEvent: at, action });
    this.engine.act(action);
    this.takeSnapshot(true);
    return { branched, discarded };
  }

  reset(params: P = this.params, seed: number = this.seed, input: I | undefined = this.input): void {
    this.params = params;
    this.seed = seed;
    this.input = input;
    this.engine = new Engine(this.sim, params, seed, this.input);
    this.snapshots.clear();
    this.inputs = [];
    this._maxComputed = 0;
    this.playNow = 0;
    this.takeSnapshot();
  }

  invariantViolations(): { id: string; message: string }[] {
    const out: { id: string; message: string }[] = [];
    for (const inv of this.sim.invariants ?? []) {
      const msg = inv.check(this.engine.state);
      if (msg) out.push({ id: inv.id, message: msg });
    }
    return out;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private stepEventInternal(replaying = false): boolean {
    void replaying;
    const ok = this.engine.step();
    if (!ok) return false;
    const h = this.engine.head;
    if (h > this._maxComputed) this._maxComputed = h;
    // apply inputs recorded at this position, in order
    for (const input of this.inputs) {
      if (input.atEvent === h) this.engine.act(input.action);
    }
    if (h % this.snapshotEvery === 0) this.takeSnapshot();
    this.playNow = this.engine.now;
    return true;
  }

  private logLengthAt(_head: number): number {
    // The engine truncates its log on restore; during replay it re-appends.
    // After seekEvent the log must end at the last entry with i <= head.
    const log = this.engine.log;
    let len = log.length;
    while (len > 0 && log[len - 1]!.i > _head) len--;
    return len;
  }

  private takeSnapshot(force = false): void {
    const h = this.engine.head;
    if (!force && this.snapshots.has(h)) return;
    this.snapshots.set(h, this.engine.snapshot());
    if (this.snapshots.size > this.maxSnapshots) {
      // thin: drop every second snapshot (keep first and newest), double stride
      const keys = [...this.snapshots.keys()].sort((a, b) => a - b);
      keys.forEach((k, idx) => {
        if (idx % 2 === 1 && k !== keys[keys.length - 1]) this.snapshots.delete(k);
      });
      this.snapshotEvery *= 2;
    }
  }
}
