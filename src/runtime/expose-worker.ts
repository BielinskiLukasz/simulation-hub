// ─── runtime/expose-worker.ts — worker-side helper ──────────────────────────
// Inside a module worker: exposeWorker(job.process) wires onmessage → process
// → postMessage with the typed protocol. Transfer only at the very end;
// never touch a transferred buffer afterwards.

import type { FromWorker, ToWorker } from '../core/worker-protocol';

export function exposeWorker<C, P>(
  process: (chunk: C) => P,
  transfer?: (part: P) => Transferable[],
): void {
  const scope = self as unknown as {
    onmessage: ((e: MessageEvent<ToWorker<C>>) => void) | null;
    postMessage: (msg: FromWorker<P>, transferList?: Transferable[]) => void;
  };
  scope.onmessage = (e: MessageEvent<ToWorker<C>>) => {
    const { id, gen, chunk } = e.data;
    try {
      const part = process(chunk);
      scope.postMessage({ type: 'result', id, gen, part }, transfer?.(part) ?? []);
    } catch (err) {
      scope.postMessage({ type: 'error', id, gen, message: String(err) });
    }
  };
}
