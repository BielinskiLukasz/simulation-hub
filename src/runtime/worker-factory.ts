// ─── runtime/worker-factory.ts — real Web Workers, single-file friendly ────
// Builds a classic Worker from a Blob whose code is the SERIALISED SOURCE of
// the sim's (self-contained) process function. No separate worker asset is
// needed, so this works in single-file builds where `new Worker(new URL(...))`
// would 404 — and identically in multi-file deployments.
//
// Contract: the process function must be self-contained (no imports/closures
// over module scope). Minification is safe: renaming is consistent inside a
// single function body. If Worker construction or execution fails, the
// pool's error path fires and the batch shell falls back to inline compute.

/** Pure + testable: the exact source the worker will run. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildWorkerSource(processFn: (...args: any[]) => unknown, transferFn?: (part: never) => Transferable[]): string {
  return [
    `const __process = ${processFn.toString()};`,
    transferFn ? `const __transfer = ${transferFn.toString()};` : 'const __transfer = null;',
    'self.onmessage = (e) => {',
    '  const { id, gen, chunk } = e.data;',
    '  try {',
    '    const part = __process(chunk);',
    '    self.postMessage({ type: "result", id, gen, part }, __transfer ? __transfer(part) : []);',
    '  } catch (err) {',
    '    self.postMessage({ type: "error", id, gen, message: String(err) });',
    '  }',
    '};',
  ].join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBlobWorker(processFn: (...args: any[]) => unknown, transferFn?: (part: never) => Transferable[]): Worker {
  const source = buildWorkerSource(processFn, transferFn);
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return new Worker(url);
  } finally {
    // The worker keeps its own copy once constructed; revoke async-safe.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
