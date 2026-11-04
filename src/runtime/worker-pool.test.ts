import { describe, expect, it } from 'vitest';
import { WorkerPool, type Transport } from './worker-pool';
import { runInline, type JobDefinition } from '../core/job';
import type { FromWorker, ToWorker } from '../core/worker-protocol';

// Toy job: sum of squares over chunk ranges. Deterministic, easy to verify.
interface Chunk { index: number; from: number; to: number }
const toyJob: JobDefinition<{ total: number }, Chunk, { index: number; sum: number }, number> = {
  plan: (p) => {
    const chunks: Chunk[] = [];
    const size = 25;
    for (let from = 0, index = 0; from < p.total; from += size, index++) {
      chunks.push({ index, from, to: Math.min(from + size, p.total) });
    }
    return chunks;
  },
  process: (c) => {
    let sum = 0;
    for (let i = c.from; i < c.to; i++) sum += i * i;
    return { index: c.index, sum };
  },
  reduce: (parts) => parts.reduce((a, p) => a + p.sum, 0),
};

class FakeTransport implements Transport {
  private handler: ((m: FromWorker<unknown>) => void) | null = null;
  constructor(private processFn: (c: never) => unknown, private delayFor: (id: number) => number) {}
  setHandler(h: (m: FromWorker<unknown>) => void): void { this.handler = h; }
  setProcess(p: (c: never) => unknown): void { this.processFn = p; }
  postMessage(msg: ToWorker<unknown>): void {
    const handler = this.handler;
    const proc = this.processFn;
    setTimeout(() => {
      if (!handler) return;
      try {
        handler({ type: 'result', id: msg.id, gen: msg.gen, part: proc(msg.chunk as never) });
      } catch (err) {
        handler({ type: 'error', id: msg.id, gen: msg.gen, message: String(err) });
      }
    }, this.delayFor(msg.id));
  }
}

const makePool = (delayFor: (id: number) => number, size = 3) =>
  new WorkerPool(() => new FakeTransport(toyJob.process as (c: never) => unknown, delayFor), size);

describe('WorkerPool (fake in-thread transport)', () => {
  it('reduces in chunk order even when results arrive out of order', async () => {
    const progresses: number[] = [];
    const pool = makePool((id) => (8 - id) * 5); // later chunks finish first
    const result = await pool.run(toyJob, { total: 200 }, 1, { onProgress: (d) => progresses.push(d) });
    expect(result).toBe(runInline(toyJob, { total: 200 }, 1));
    expect(progresses.length).toBe(8);
    expect(progresses).toEqual([...progresses].sort((a, b) => a - b)); // monotonic
    pool.dispose();
  });

  it('pool result equals runInline for the same job + seed', async () => {
    const pool = makePool(() => 1);
    await expect(pool.run(toyJob, { total: 137 }, 42)).resolves.toBe(runInline(toyJob, { total: 137 }, 42));
    pool.dispose();
  });

  it('abort rejects, and a second run right after is not polluted by stale results', async () => {
    const pool = makePool(() => 20, 2);
    const ac = new AbortController();
    const first = pool.run(toyJob, { total: 1000 }, 5, { signal: ac.signal });
    ac.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pool.run(toyJob, { total: 50 }, 5)).resolves.toBe(runInline(toyJob, { total: 50 }, 5));
    pool.dispose();
  });

  it('a crashed transport rejects the run and is respawned for the next one', async () => {
    class CrashTransport implements Transport {
      private err: ((m: string) => void) | null = null;
      setHandler(): void { /* never replies */ }
      setProcess(): void { /* noop */ }
      setErrorHandler(h: (m: string) => void): void { this.err = h; }
      postMessage(): void { setTimeout(() => this.err?.('worker crashed'), 5); }
    }
    let created = 0;
    const pool = new WorkerPool(() => {
      created++;
      return created === 1
        ? new CrashTransport()
        : new FakeTransport(toyJob.process as (c: never) => unknown, () => 1);
    }, 1);
    await expect(pool.run(toyJob, { total: 50 }, 1)).rejects.toThrow('worker crashed');
    await expect(pool.run(toyJob, { total: 50 }, 1)).resolves.toBe(runInline(toyJob, { total: 50 }, 1));
    expect(created).toBe(2); // original + respawn
    pool.dispose();
  });

  it('a throwing process rejects the run with the message', async () => {
    const bad: JobDefinition<{ total: number }, Chunk, never, number> = {
      ...toyJob,
      process: () => { throw new Error('boom in chunk'); },
    };
    const pool = new WorkerPool(() => new FakeTransport(bad.process as (c: never) => unknown, () => 1), 2);
    await expect(pool.run(bad, { total: 50 }, 1)).rejects.toThrow('boom in chunk');
    pool.dispose();
  });
});
