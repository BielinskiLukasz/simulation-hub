// Alternative module-worker entry for multi-file deployments that prefer a
// real worker file over the Blob factory actually wired in index.ts:
//   createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
// Both paths run the same processChunk and produce identical results.
import { exposeWorker } from '../../runtime/expose-worker';
import { mcJob } from './job';

exposeWorker(mcJob.process, mcJob.transfer);
