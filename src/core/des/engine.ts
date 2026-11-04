// ─── core/des/engine.ts — deterministic discrete-event engine ──────────────
// Integer time only; delays are rounded in schedule(). Events are plain
// data; state is plain data (structuredClone snapshots). Handlers get time
// and randomness exclusively from ctx — replay is exact by construction.

import type { EventCtx, EventSimulation, LogEntry, Rng } from '../types';
import { createRng } from '../rng';
import { EventQueue, type QueueSnapshot } from './event-queue';

export const MAX_EVENTS_AT_SAME_TIME = 10000;

export interface EngineSnapshot<S, E> {
  head: number;
  now: number;
  state: S;
  queue: QueueSnapshot<E>;
  rngState: number;
  logLength: number;
  log: LogEntry[];
  eventTimes: number[];
}

export class Engine<P, S, E, A, I = unknown, Sh = unknown> {
  state: S;
  now = 0;
  head = 0;
  readonly log: LogEntry[] = [];
  /** eventTimes[h] = sim time after h events (index 0 = start, time 0). */
  eventTimes: number[] = [0];

  private queue = new EventQueue<E>();
  private rng: Rng;
  private pendingLog: Omit<LogEntry, 'i' | 't'>[] = [];
  private sameTimeCount = 0;
  private lastEventTime = -1;

  readonly shared: Sh;

  constructor(
    private sim: EventSimulation<P, S, E, A, I, Sh>,
    readonly params: P,
    seed: number,
    input?: I,
  ) {
    this.rng = createRng(seed);
    const effectiveInput = (input ?? (sim.input ? sim.input.initial(seed) : undefined)) as I;
    this.shared = (sim.compile ? sim.compile(params, effectiveInput) : undefined) as Sh;
    const initCtx = {
      rng: this.rng,
      shared: this.shared,
      schedule: (delay: number, payload: E) => this.scheduleAt(delay, payload),
    };
    this.state = sim.init(params, initCtx);
  }

  get queueSize(): number {
    return this.queue.size;
  }

  peekTime(): number | undefined {
    return this.queue.peekTime();
  }

  private scheduleAt(delay: number, payload: E): number {
    const t = this.now + Math.max(0, Math.round(delay));
    return this.queue.push(t, payload);
  }

  private makeCtx(): EventCtx<S, E, Sh> {
    return {
      state: this.state,
      now: this.now,
      rng: this.rng,
      shared: this.shared,
      schedule: (delay, payload) => this.scheduleAt(delay, payload),
      cancel: (id) => this.queue.cancel(id),
      log: (entry) => { this.pendingLog.push(entry); },
    };
  }

  private flushLog(): void {
    for (const e of this.pendingLog) {
      this.log.push({ ...e, i: this.head, t: this.now });
    }
    this.pendingLog = [];
  }

  /** Process the next event. Returns false when the queue is empty. */
  step(): boolean {
    const item = this.queue.pop();
    if (!item) return false;
    if (item.time < this.now) throw new Error(`Engine: event time ${item.time} < now ${this.now} (time travel in handler?)`);
    this.now = item.time;
    if (item.time === this.lastEventTime) {
      this.sameTimeCount++;
      if (this.sameTimeCount > MAX_EVENTS_AT_SAME_TIME) {
        throw new Error(`Engine: more than ${MAX_EVENTS_AT_SAME_TIME} events at time ${item.time} — zero-delay loop?`);
      }
    } else {
      this.lastEventTime = item.time;
      this.sameTimeCount = 0;
    }
    this.pendingLog = [];
    this.sim.handle(this.makeCtx(), item.payload);
    this.head++;
    this.eventTimes[this.head] = this.now;
    this.flushLog();
    return true;
  }

  runUntil(time: number, maxEvents = 1000000): void {
    let n = 0;
    for (;;) {
      const t = this.queue.peekTime();
      if (t === undefined || t > time) return;
      if (!this.step()) return;
      if (++n > maxEvents) throw new Error(`Engine.runUntil: exceeded ${maxEvents} events`);
    }
  }

  runToEnd(maxEvents = 1000000): void {
    let n = 0;
    while (this.step()) {
      if (++n > maxEvents) throw new Error(`Engine.runToEnd: exceeded ${maxEvents} events — livelock?`);
    }
  }

  /** Apply a user action at the current position (logged as cat 'action'). */
  act(action: A): void {
    if (!this.sim.applyAction) return;
    this.pendingLog = [];
    this.sim.applyAction(this.makeCtx(), action);
    this.log.push({
      i: this.head,
      t: this.now,
      cat: 'action',
      actor: null,
      text: this.sim.describeAction?.(action) ?? 'action',
    });
    this.flushLog();
  }

  snapshot(): EngineSnapshot<S, E> {
    return {
      head: this.head,
      now: this.now,
      state: structuredClone(this.state),
      queue: this.queue.snapshot(),
      rngState: this.rng.state(),
      logLength: this.log.length,
      log: structuredClone(this.log),
      eventTimes: this.eventTimes.slice(0, this.head + 1),
    };
  }

  restore(snap: EngineSnapshot<S, E>): void {
    this.head = snap.head;
    this.now = snap.now;
    this.state = structuredClone(snap.state);
    this.queue = EventQueue.restore(snap.queue);
    this.rng = createRng(0, snap.rngState);
    this.log.length = 0;
    this.log.push(...structuredClone(snap.log));
    this.eventTimes = snap.eventTimes.slice();
    this.lastEventTime = snap.now;
    this.sameTimeCount = 0;
    this.pendingLog = [];
  }
}
