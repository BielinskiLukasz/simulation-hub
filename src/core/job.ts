// ─── core/job.ts — map/reduce batch jobs ────────────────────────────────────
// plan (main thread) → process (worker or inline, pure) → reduce (main thread,
// parts ALWAYS in chunk-index order). Fixed chunking + per-chunk derived
// seeds make results independent of worker count and completion order.

export interface JobDefinition<P, C, Part, R> {
  plan(params: P, seed: number): C[];
  process(chunk: C): Part;
  reduce(parts: Part[], params: P): R;
  transfer?(part: Part): Transferable[];
}

/** Sequential, no workers. Used by tests, inline batch sims, and as fallback. */
export function runInline<P, C, Part, R>(job: JobDefinition<P, C, Part, R>, params: P, seed: number): R {
  const parts = job.plan(params, seed).map((c) => job.process(c));
  return job.reduce(parts, params);
}
