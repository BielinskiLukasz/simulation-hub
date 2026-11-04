// ─── core/worker-protocol.ts — typed worker messages (no Worker usage) ─────

export type ToWorker<C> = { type: 'run'; id: number; gen: number; chunk: C };

export type FromWorker<P> =
  | { type: 'result'; id: number; gen: number; part: P }
  | { type: 'error'; id: number; gen: number; message: string };
