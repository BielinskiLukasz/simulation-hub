import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'raft',
  title: 'Raft Consensus',
  kind: 'realtime',
  category: 'systems',
  description:
    'A living Raft cluster: randomised election timeouts, heartbeats, log replication and majority commit — with message loss and crashable nodes. Click a node to kill it and watch the cluster elect a successor and heal its log.',
  tags: ['raft'.trim(), 'consensus', 'distributed', 'elections', 'replication'],
  difficulty: 'hard',
  thumbnail: 'raft',
  accent: '#f59e0b',
};
