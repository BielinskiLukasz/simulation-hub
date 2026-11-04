import { describe, expect, it } from 'vitest';
import { parseGrid } from '../../core/grid/ascii';
import { createGrid } from '../../core/grid/grid';
import { createRng } from '../../core/rng';
import { isAdmissible } from './heuristics';
import { runPathfinding, defaultParams, type Input, type Params } from './model';
import { isPassable, ORTHO, DIAG } from './costs';

const OPEN = (w: number, h: number): Input => ({ grid: createGrid(w, h), start: 0, goal: w * h - 1 });
const withParams = (p: Partial<Params>): Params => ({ ...defaultParams, ...p });

describe('pathfinding: fixtures', () => {
  it('open 5×5: 4-connected cost 8000; 8-connected octile/JPS/Dijkstra cost 5660', () => {
    const four = [withParams({ diagonal: false, algorithm: 'astar' }), withParams({ diagonal: false, algorithm: 'dijkstra' }), withParams({ diagonal: false, algorithm: 'bfs' })];
    for (const p of four) {
      const r = runPathfinding(OPEN(5, 5), p);
      expect(r.summary.found).toBe(true);
      expect(r.summary.cost).toBe(8000);
      expect(r.summary.pathCells).toBe(9);
    }
    for (const p of [withParams({ algorithm: 'astar', heuristic: 'octile' }), withParams({ algorithm: 'dijkstra' }), withParams({ algorithm: 'jps' })]) {
      const r = runPathfinding(OPEN(5, 5), p);
      expect(r.summary.found).toBe(true);
      expect(r.summary.cost).toBe(4 * DIAG);
    }
    expect(ORTHO).toBe(1000);
  });

  it('wall with a gap: 16 steps / cost 16000 for BFS, Dijkstra, A*; greedy finds a path', () => {
    const parsed = parseGrid('S....\n####.\n.....\n.####\n....G');
    const input = { grid: parsed.grid, start: parsed.start, goal: parsed.goal };
    for (const algorithm of ['bfs', 'dijkstra', 'astar'] as const) {
      const r = runPathfinding(input, withParams({ algorithm, diagonal: false, heuristic: 'manhattan' }));
      expect(r.summary.found).toBe(true);
      expect(r.summary.cost).toBe(16000);
      expect(r.summary.pathCells).toBe(17);
    }
    const greedy = runPathfinding(input, withParams({ algorithm: 'greedy', diagonal: false }));
    expect(greedy.summary.found).toBe(true);
    expect(greedy.summary.cost).toBeGreaterThanOrEqual(16000);
  });

  it('no path: all algorithms fail; BFS expands exactly the 6 reachable cells; trace ends FAIL', () => {
    const parsed = parseGrid('S.#..\n..#..\n..#.G');
    const input = { grid: parsed.grid, start: parsed.start, goal: parsed.goal };
    for (const algorithm of ['bfs', 'dijkstra', 'astar', 'greedy', 'jps'] as const) {
      const r = runPathfinding(input, withParams({ algorithm }));
      expect(r.summary.found, algorithm).toBe(false);
      expect(r.data.kind[r.data.kind.length - 1]!).toBe(6);
      if (algorithm === 'bfs') expect(r.summary.expanded).toBe(6);
    }
  });

  it('weighted shortcut: BFS walks through cost 3, Dijkstra/A* detour for less cost', () => {
    const parsed = parseGrid('S333G\n.....');
    const input = { grid: parsed.grid, start: parsed.start, goal: parsed.goal };
    const bfs = runPathfinding(input, withParams({ algorithm: 'bfs', diagonal: false, weighted: true }));
    expect(bfs.summary.found).toBe(true);
    expect(bfs.summary.cost).toBe(10000);
    expect(bfs.summary.pathCells).toBe(5);
    expect(bfs.summary.optimal).toBe(false);
    for (const algorithm of ['dijkstra', 'astar'] as const) {
      const r = runPathfinding(input, withParams({ algorithm, diagonal: false, weighted: true, heuristic: 'zero' }));
      expect(r.summary.cost).toBe(6000);
      expect(r.summary.cost).toBeLessThan(bfs.summary.cost);
      expect(r.summary.optimal).toBe(true);
    }
  });

  it('start = goal: zero-length path, cost 0, one expansion, no fail step', () => {
    const input: Input = { grid: createGrid(5, 5), start: 12, goal: 12 };
    for (const algorithm of ['bfs', 'dijkstra', 'astar', 'greedy', 'jps'] as const) {
      const r = runPathfinding(input, withParams({ algorithm }));
      expect(r.summary.found).toBe(true);
      expect(r.summary.pathCells).toBe(1);
      expect(r.summary.cost).toBe(0);
      expect(r.summary.expanded).toBe(1);
      expect(Array.from(r.data.kind)).not.toContain(6);
    }
  });

  it('corner rules: squeezing between two walls is forbidden by never/oneBlocked and allowed by always', () => {
    const parsed = parseGrid('S#.\n#..\n..G');
    const input = { grid: parsed.grid, start: parsed.start, goal: parsed.goal };
    for (const corner of ['never', 'oneBlocked'] as const) {
      const r = runPathfinding(input, withParams({ algorithm: 'dijkstra', diagonal: true, corner }));
      expect(r.summary.found, corner).toBe(false);
    }
    const always = runPathfinding(input, withParams({ algorithm: 'dijkstra', diagonal: true, corner: 'always' }));
    expect(always.summary.found).toBe(true);
    expect(always.summary.cost).toBe(2 * DIAG);
  });

  it('regression: Manhattan + diagonals really does return a costlier path than Dijkstra', () => {
    // Found by brute-force search over seeded 8×8 grids; committed as a fixture.
    const parsed = parseGrid('S.......\n.#.#...#\n...#.###\n#....#..\n#.##..#.\n#..#.#..\n...#....\n.#.....G');
    const input = { grid: parsed.grid, start: parsed.start, goal: parsed.goal };
    const manhattan = runPathfinding(input, withParams({ algorithm: 'astar', heuristic: 'manhattan', diagonal: true, corner: 'never' }));
    const dijkstra = runPathfinding(input, withParams({ algorithm: 'dijkstra', heuristic: 'zero', diagonal: true, corner: 'never' }));
    expect(manhattan.summary.found).toBe(true);
    expect(dijkstra.summary.found).toBe(true);
    expect(Number(manhattan.summary.cost)).toBe(13415);
    expect(Number(dijkstra.summary.cost)).toBe(12830);
    expect(Number(manhattan.summary.cost)).toBeGreaterThan(Number(dijkstra.summary.cost));
    expect(manhattan.summary.optimal).toBe(false);
  });

  it('admissibility badge: Manhattan + diagonals is not admissible; octile is', () => {
    expect(isAdmissible('manhattan', true)).toBe(false);
    expect(isAdmissible('manhattan', false)).toBe(true);
    expect(isAdmissible('octile', true)).toBe(true);
    expect(isAdmissible('octile', true, 2)).toBe(false);
  });
});

describe('pathfinding: properties (seeded random grids)', () => {
  function randomInput(seed: number): Input {
    const rng = createRng(seed);
    const w = 10; const h = 10;
    const grid = createGrid(w, h);
    for (let i = 0; i < grid.cells.length; i++) if (rng.next() < 0.22) grid.cells[i] = 1;
    const start = 0; const goal = w * h - 1;
    grid.cells[start] = 0; grid.cells[goal] = 0;
    return { grid, start, goal };
  }
  const validPath = (input: Input, data: ReturnType<typeof runPathfinding>['data'], diagonal: boolean, corner: string): void => {
    if (data.path.length === 0) return;
    expect(data.path[0]).toBe(input.start);
    expect(data.path[data.path.length - 1]).toBe(input.goal);
    for (let i = 1; i < data.path.length; i++) {
      const a = data.path[i - 1]!;
      const b = data.path[i]!;
      const ax = a % input.grid.w; const ay = Math.floor(a / input.grid.w);
      const bx = b % input.grid.w; const by = Math.floor(b / input.grid.w);
      const dx = Math.abs(bx - ax); const dy = Math.abs(by - ay);
      expect(dx <= 1 && dy <= 1 && dx + dy > 0).toBe(true);
      if (dx === 1 && dy === 1 && !diagonal) throw new Error('diagonal step on a 4-connected grid');
      if (corner !== 'always' && dx === 1 && dy === 1) {
        const bx1 = !isPassable(input.grid.cells[ay * input.grid.w + bx]!);
        const by1 = !isPassable(input.grid.cells[by * input.grid.w + ax]!);
        if (corner === 'never') expect(bx1 || by1).toBe(false);
        if (corner === 'oneBlocked') expect(bx1 && by1).toBe(false);
      }
    }
  };

  it('Dijkstra = A*(zero/octile) = JPS octile cost on uniform grids; BFS steps × 1000 = cost (4-conn)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const input = randomInput(seed);
      const dij8 = runPathfinding(input, withParams({ algorithm: 'dijkstra', diagonal: true, corner: 'never', weighted: false }));
      const astar8 = runPathfinding(input, withParams({ algorithm: 'astar', diagonal: true, corner: 'never', weighted: false, heuristic: 'octile' }));
      const jps = runPathfinding(input, withParams({ algorithm: 'jps' }));
      expect(astar8.summary.cost, `seed ${seed}`).toBe(dij8.summary.cost);
      expect(jps.summary.cost, `seed ${seed}`).toBe(dij8.summary.cost);
      expect(jps.summary.found).toBe(dij8.summary.found);
      validPath(input, jps.data, true, 'never');
      const dij4 = runPathfinding(input, withParams({ algorithm: 'dijkstra', diagonal: false, weighted: false }));
      const bfs = runPathfinding(input, withParams({ algorithm: 'bfs', diagonal: false, weighted: false }));
      expect(bfs.summary.cost).toBe(dij4.summary.cost);
      if (!dij4.summary.found) {
        expect(bfs.summary.found).toBe(false);
      } else {
        expect(bfs.summary.pathCells - 1).toBe(Number(dij4.summary.cost) / 1000);
      }
      validPath(input, astar8.data, true, 'never');
    }
  });

  it('determinism, monotonic expansion counter, and admissible A* expands ≤ Dijkstra', () => {
    for (let seed = 30; seed <= 40; seed++) {
      const input = randomInput(seed);
      const p = withParams({ algorithm: 'astar', heuristic: 'octile', diagonal: true, corner: 'never' });
      const a = runPathfinding(input, p);
      const b = runPathfinding(input, p);
      expect(Array.from(a.data.kind)).toEqual(Array.from(b.data.kind));
      for (let i = 1; i < a.data.expandedCum.length; i++) {
        expect(a.data.expandedCum[i]!).toBeGreaterThanOrEqual(a.data.expandedCum[i - 1]!);
      }
      const dij = runPathfinding(input, withParams({ algorithm: 'dijkstra', diagonal: true, corner: 'never' }));
      expect(Number(a.summary.expanded)).toBeLessThanOrEqual(Number(dij.summary.expanded) + 1);
    }
  });
});
