import { describe, expect, it } from 'vitest';
import { hasCycle, stronglyConnectedComponents } from './scc';

describe('Tarjan SCC', () => {
  it('DAG → all singletons; one cycle → one component; self-loop is a cycle', () => {
    expect(stronglyConnectedComponents(3, [[1], [2], []]).every((c) => c.length === 1)).toBe(true);
    expect(stronglyConnectedComponents(3, [[1], [2], [0]])).toEqual([[2, 1, 0]]);
    expect(hasCycle(1, [[0]])).toBe(true);
    expect(hasCycle(2, [[1], []])).toBe(false);
  });
  it('nested/disconnected cycles and a 10,000-node chain do not overflow', () => {
    const comps = stronglyConnectedComponents(5, [[1], [0, 2], [3], [2], []]);
    expect(comps.some((c) => c.length === 2)).toBe(true);
    const n = 10000;
    const edges = Array.from({ length: n }, (_, i) => (i + 1 < n ? [i + 1] : []));
    expect(stronglyConnectedComponents(n, edges).length).toBe(n);
  });
});
