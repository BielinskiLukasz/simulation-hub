import type { SimMeta } from '../../core/types';

export const meta: SimMeta = {
  id: 'pathfinding',
  title: 'Pathfinding Arena',
  kind: 'trace',
  category: 'algorithms',
  description:
    'Five pathfinders — A*, Dijkstra, BFS, greedy best-first and JPS — on an editable weighted grid. Scrub the exploration backwards, compare admissibility against a Dijkstra reference, and race two algorithms side by side.',
  tags: ['astar', 'dijkstra', 'bfs', 'jps', 'grid', 'admissibility'],
  difficulty: 'medium',
  thumbnail: 'path',
  accent: '#a78bfa',
};
