import { afterEach, describe, expect, it } from 'vitest';
import { exposeWorker } from './expose-worker';
import type { FromWorker, ToWorker } from '../core/worker-protocol';

interface FakeSelf {
  onmessage: ((e: MessageEvent<ToWorker<unknown>>) => void) | null;
  posted: { message: FromWorker<unknown>; transfer: Transferable[] | undefined }[];
}

function installSelf(): FakeSelf {
  const fake: FakeSelf = { onmessage: null, posted: [] };
  (globalThis as unknown as { self: unknown }).self = {
    set onmessage(handler: FakeSelf['onmessage']) {
      fake.onmessage = handler;
    },
    get onmessage() {
      return fake.onmessage;
    },
    postMessage(message: FromWorker<unknown>, transfer?: Transferable[]) {
      fake.posted.push({ message, transfer });
    },
  };
  return fake;
}

afterEach(() => {
  delete (globalThis as unknown as { self?: unknown }).self;
});

describe('exposeWorker', () => {
  it('replies with the processed part and the transfer list', () => {
    const fake = installSelf();
    const buffer = new ArrayBuffer(16);
    exposeWorker(
      (chunk: { n: number }) => ({ doubled: chunk.n * 2 }),
      () => [buffer],
    );
    expect(fake.onmessage).toBeTypeOf('function');
    fake.onmessage!({ data: { type: 'run', id: 7, chunk: { n: 21 } } } as MessageEvent<ToWorker<unknown>>);

    expect(fake.posted).toHaveLength(1);
    expect(fake.posted[0]!.message).toEqual({ type: 'result', id: 7, part: { doubled: 42 } });
    expect(fake.posted[0]!.transfer).toEqual([buffer]);
  });

  it('replies with an error message when process throws', () => {
    const fake = installSelf();
    exposeWorker(() => {
      throw new Error('chunk exploded');
    });
    fake.onmessage!({ data: { type: 'run', id: 2, chunk: {} } } as MessageEvent<ToWorker<unknown>>);
    expect(fake.posted[0]!.message).toMatchObject({ type: 'error', id: 2 });
    expect((fake.posted[0]!.message as { message: string }).message).toContain('chunk exploded');
  });

  it('posts no transfer list when the job has none', () => {
    const fake = installSelf();
    exposeWorker((chunk: number) => chunk + 1);
    fake.onmessage!({ data: { type: 'run', id: 0, chunk: 1 } } as MessageEvent<ToWorker<unknown>>);
    expect(fake.posted[0]!.transfer).toEqual([]);
  });

  it('ignores messages that are not run commands', () => {
    const fake = installSelf();
    exposeWorker((chunk: number) => chunk);
    fake.onmessage!({ data: { type: 'ping' } } as unknown as MessageEvent<ToWorker<unknown>>);
    fake.onmessage!({ data: null } as unknown as MessageEvent<ToWorker<unknown>>);
    expect(fake.posted).toHaveLength(0);
  });

  it('keeps the worker alive after a failure (next chunk still succeeds)', () => {
    const fake = installSelf();
    let fail = true;
    exposeWorker((chunk: number) => {
      if (fail) {
        fail = false;
        throw new Error('first chunk always fails');
      }
      return chunk * 3;
    });
    fake.onmessage!({ data: { type: 'run', id: 1, chunk: 1 } } as MessageEvent<ToWorker<unknown>>);
    fake.onmessage!({ data: { type: 'run', id: 2, chunk: 2 } } as MessageEvent<ToWorker<unknown>>);
    expect(fake.posted[0]!.message.type).toBe('error');
    expect(fake.posted[1]!.message).toEqual({ type: 'result', id: 2, part: 6 });
  });
});
