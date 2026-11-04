import { exposeWorker } from '../../runtime/expose-worker';
import { piJob } from './job';

exposeWorker(piJob.process, piJob.transfer);
