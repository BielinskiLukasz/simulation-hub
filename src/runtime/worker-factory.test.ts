import { describe, expect, it } from 'vitest';
import { buildWorkerSource } from './worker-factory';
import { processChunk, type Chunk } from '../sims/monte-carlo/model';
import { defaultParams } from '../sims/monte-carlo/model';

describe('worker source serialisation', () => {
  it('contains the process source and the typed message protocol', () => {
    const src = buildWorkerSource(processChunk, (part: { balances: Float32Array }) => [part.balances.buffer as ArrayBuffer]);
    expect(src).toContain('self.onmessage');
    expect(src).toContain('"result"');
    expect(src).toContain('"error"');
    expect(src).toContain('postMessage');
  });

  it('serialised processChunk produces IDENTICAL output to the direct function', () => {
    // Rebuild the function from its own source, exactly like the worker does.
    const revived = new Function(`return (${processChunk.toString()});`)() as typeof processChunk;
    const chunk: Chunk = { index: 0, runs: 25, seed: 123456, params: { ...defaultParams, accumYears: 5, withdrawYears: 5 } };
    const direct = processChunk(chunk);
    const viaSource = revived(chunk);
    expect(Array.from(viaSource.balances)).toEqual(Array.from(direct.balances));
    expect(viaSource.runs).toBe(direct.runs);
  });
});
