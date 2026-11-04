import type { CompareSpec } from '../../core/types';
import { meta } from './meta';
import { mountView } from './view';
import { defaultParams, paramSchema, input, pathfindingSim, runPathfinding, type Input, type Params } from './model';
import type { PathTrace } from './algorithms';

const compare: CompareSpec<Params> = {
  modes: [
    {
      id: 'algorithm', label: 'A* vs Dijkstra (same grid)',
      paneKeys: ['algorithm'], bDefaults: { algorithm: 'dijkstra' },
      note: 'Same heuristic? A* should expand no more than Dijkstra.',
    },
    {
      id: 'heuristic', label: 'Octile vs Manhattan (admissibility)',
      paneKeys: ['algorithm', 'heuristic', 'diagonal'],
      bDefaults: { algorithm: 'astar', heuristic: 'manhattan', diagonal: true },
      note: 'Manhattan overestimates on diagonals — watch the Optimal? badge.',
    },
    {
      id: 'weight', label: 'A* weight 1 vs 2 (speed vs optimality)',
      paneKeys: ['heuristicWeight'],
      bDefaults: { heuristicWeight: 2 },
      note: 'Weighted A* is faster but can return a longer path.',
    },
  ],
  enforce(a, b) {
    const warnings: string[] = [];
    const jpsA = a.algorithm === 'jps';
    const jpsB = b.algorithm === 'jps';
    if (jpsA || jpsB) {
      warnings.push('JPS requires uniform cost, 8-connected, corner = never — enforced on both panes.');
      return {
        a: { ...a, weighted: false, diagonal: true, corner: 'never' },
        b: { ...b, weighted: false, diagonal: true, corner: 'never' },
        warnings,
      };
    }
    return { a, b, warnings };
  },
};

const sim = {
  ...pathfindingSim,
  kind: 'trace' as const,
  meta,
  defaultParams,
  paramSchema,
  input,
  run: runPathfinding,
  mountView,
  compare: compare as CompareSpec<Params>,
  series(data: PathTrace) {
    return [
      { name: 'frontier', ys: data.frontier },
      { name: 'expansions', ys: data.expandedCum },
    ];
  },
  describeStep(data: PathTrace, i: number) {
    if (i < 0 || i >= data.kind.length) return { cat: 'step', actor: null, text: `position ${i}` };
    const kind = data.kind[i]!;
    const cell = data.cell[i]!;
    const names = ['open', 'update', 'expand', 'scan', 'goal', 'path', 'fail'];
    const label = names[kind] ?? 'step';
    const pos = cell >= 0 ? `(${cell % data.w}, ${Math.floor(cell / data.w)})` : '—';
    return { cat: label, actor: null, text: `#${i + 1} ${label} ${pos} g=${data.g[i]} f=${data.f[i]}` };
  },
  concepts:
    '## Concepts\n\n**Admissible vs consistent.** A heuristic is admissible if it never overestimates the true remaining cost. Manhattan distance does exactly that on diagonal grids (diagonals cost √2, Manhattan charges 2), so A* may return a longer path while still looking “reasonable”. Octile is both admissible and consistent for 8-connected grids, which is why it is the default.\n\n**Why BFS is not Dijkstra.** BFS minimises the number of steps; with weighted terrain a longer detour can be cheaper (mud ×5 vs grass ×2). Paint mud in a straight corridor and watch Dijkstra go around it while BFS walks through.\n\n**JPS: few expansions, many scans.** Jump Point Search prunes symmetric paths on uniform grids, expanding only jump points but scanning every cell it leaps over. That is why the race uses expansions as its clock.\n\n**References.** Hart, Nilsson & Raphael (1968); Dijkstra (1959); Harabor & Grastien, *Online Graph Pruning for Pathfinding on Grid Maps* (AAAI 2011); Red Blob Games (A* pages).',
} as const;

export default sim;
export type { Input, Params, PathTrace };
