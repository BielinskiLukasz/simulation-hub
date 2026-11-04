import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'cpu-scheduler',
  title: 'CPU Scheduler',
  kind: 'event',
  category: 'algorithms',
  description:
    'FCFS, SJF, Round Robin, priority and SRTF over editable workloads — with a Gantt timeline, per-process metrics, time-travel, and a compare tab that runs every algorithm headlessly on the same workload.',
  tags: ['os', 'scheduling', 'gantt', 'fcfs', 'sjf', 'round-robin'],
  difficulty: 'medium',
  thumbnail: 'cpu',
  accent: '#38bdf8',
};
