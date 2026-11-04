// ─── runtime/worker-pool.ts — browser plumbing (DOM/Worker allowed here) ────
// Scheduling: shared chunk queue, idle transports pull the next chunk.
// Ordering: parts stored BY CHUNK INDEX; reduce always sees index order.
// Cancellation: abort clears the queue, rejects with AbortError, and bumps a
// generation counter so in-flight stale results are ignored (workers are NOT
// terminated — chunks are short and drain fast).
// Transport seam: the pool only knows postMessage/setHandler, so tests plug
// in an in-thread fake and the browser plugs in real Workers.

import type { JobDefinition } from '../core/job';
import type { FromWorker, ToWorker } from '../core/worker-protocol';

export interface Transport {
  postMessage(msg: ToWorker<unknown>): void;
  setHandler(handler: (msg: FromWorker<unknown>) => void): void;
  setProcess?(process: (chunk: never) => unknown): void;
  /** Out-of-band crash signal (Worker.onerror). The pool rejects the run and respawns. */
  setErrorHandler?(handler: (message: string) => void): void;
  terminate?(): void;
}

export interface PoolRunOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

interface ActiveRun {
  gen: number;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  parts: unknown[];
  done: number;
  total: number;
  nextIndex: number;
  busy: Set<Transport>;
  onProgress?: (done: number, total: number) => void;
  job: JobDefinition<unknown, unknown, unknown, unknown>;
  params: unknown;
  chunks: unknown[];
  aborted: boolean;
}

export class WorkerPool {
  private transports: Transport[] = [];
  private active: ActiveRun | null = null;
  private generation = 0;
  private disposed = false;

  constructor(
    private createTransport: () => Transport,
    private size: number = defaultSize(),
  ) {}

  run<P, C, Part, R>(
    job: JobDefinition<P, C, Part, R>,
    params: P,
    seed: number,
    opts: PoolRunOptions = {},
  ): Promise<R> {
    if (this.disposed) return Promise.reject(new Error('WorkerPool disposed'));
    this.supersede();
    const chunks = job.plan(params, seed);
    const gen = ++this.generation;

    return new Promise<R>((resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(abortError());
        return;
      }
      const runState: ActiveRun = {
        gen,
        resolve: resolve as (v: unknown) => void,
        reject,
        parts: new Array(chunks.length),
        done: 0,
        total: chunks.length,
        nextIndex: 0,
        busy: new Set(),
        onProgress: opts.onProgress,
        job: job as unknown as ActiveRun['job'],
        params,
        chunks: chunks as unknown[],
        aborted: false,
      };
      this.active = runState;

      const onAbort = () => {
        if (this.active !== runState) return;
        runState.aborted = true;
        this.generation++; // invalidate in-flight results
        this.active = null;
        reject(abortError());
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      if (chunks.length === 0) {
        this.active = null;
        resolve(job.reduce([], params));
        return;
      }
      this.ensureTransports(job);
      this.pump(runState, chunks as unknown[]);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.supersede();
    for (const t of this.transports) t.terminate?.();
    this.transports = [];
  }

  private supersede(): void {
    if (this.active) {
      const prev = this.active;
      this.active = null;
      this.generation++;
      prev.aborted = true;
      prev.reject(abortError());
    }
  }

  private wire(t: Transport, job: ActiveRun['job']): void {
    t.setProcess?.(job.process as (chunk: never) => unknown);
    t.setHandler((msg) => this.onMessage(t, msg));
    t.setErrorHandler?.((message) => this.onTransportError(t, message));
  }

  private ensureTransports(job: ActiveRun['job']): void {
    while (this.transports.length < Math.max(1, this.size)) {
      const t = this.createTransport();
      this.wire(t, job);
      this.transports.push(t);
    }
    // inline transports need the current job's process each run
    for (const t of this.transports) t.setProcess?.(job.process as (chunk: never) => unknown);
  }

  /** A crashed transport rejects the active run and is RESPAWNED in place. */
  private onTransportError(t: Transport, message: string): void {
    const idx = this.transports.indexOf(t);
    const run = this.active;
    if (idx >= 0) {
      try { t.terminate?.(); } catch { /* already dead */ }
      const fresh = this.createTransport();
      if (run) this.wire(fresh, run.job);
      else fresh.setHandler((msg) => this.onMessage(fresh, msg));
      this.transports[idx] = fresh;
    }
    if (run) {
      this.active = null;
      this.generation++;
      run.reject(new Error(message));
    }
  }

  private pump(run: ActiveRun, chunks: unknown[]): void {
    if (this.active !== run || run.aborted) return;
    for (const t of this.transports) {
      if (run.nextIndex >= chunks.length) return;
      if (run.busy.has(t)) continue;
      const idx = run.nextIndex++;
      run.busy.add(t);
      t.postMessage({ type: 'run', id: idx, gen: run.gen, chunk: chunks[idx] });
    }
  }

  private onMessage(t: Transport, msg: FromWorker<unknown>): void {
    const run = this.active;
    if (!run || run.aborted || msg.gen !== run.gen) return; // stale generation: ignore
    run.busy.delete(t);
    if (msg.type === 'error') {
      this.active = null;
      this.generation++;
      run.reject(new Error(msg.message));
      return;
    }
    run.parts[msg.id] = msg.part;
    run.done++;
    run.onProgress?.(run.done, run.total);
    if (run.done === run.total) {
      this.active = null;
      try {
        run.resolve(run.job.reduce(run.parts, run.params));
      } catch (err) {
        run.reject(err);
      }
      return;
    }
    this.pump(run, run.chunks);
  }
}

function defaultSize(): number {
  try {
    return Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1);
  } catch {
    return 3;
  }
}

function abortError(): Error {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

/** In-thread transport: runs process() on the main thread, yielding per chunk. */
export class InlineTransport implements Transport {
  private handler: ((msg: FromWorker<unknown>) => void) | null = null;
  private process: ((chunk: never) => unknown) | null = null;
  setHandler(h: (msg: FromWorker<unknown>) => void): void { this.handler = h; }
  setProcess(p: (chunk: never) => unknown): void { this.process = p; }
  postMessage(msg: ToWorker<unknown>): void {
    const proc = this.process;
    const handler = this.handler;
    setTimeout(() => {
      if (!proc || !handler) return;
      try {
        const part = proc(msg.chunk as never);
        handler({ type: 'result', id: msg.id, gen: msg.gen, part });
      } catch (err) {
        handler({ type: 'error', id: msg.id, gen: msg.gen, message: String(err) });
      }
    }, 0);
  }
}

/** Real Worker transport (used when a sim provides createWorker). */
export class WorkerTransport implements Transport {
  constructor(private worker: Worker) {}
  setHandler(h: (msg: FromWorker<unknown>) => void): void {
    this.worker.onmessage = (e: MessageEvent<FromWorker<unknown>>) => h(e.data);
  }
  setErrorHandler(h: (message: string) => void): void {
    this.worker.onerror = (e: ErrorEvent) => h(e.message || 'Worker error');
  }
  postMessage(msg: ToWorker<unknown>): void { this.worker.postMessage(msg); }
  terminate(): void { this.worker.terminate(); }
}
