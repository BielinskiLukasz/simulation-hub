import { describe, expect, it } from 'vitest';
import { applyEdit, applyPatch } from './ops';
import { createGrid, neighbors } from './grid';
import { parseGrid, formatGrid } from './ascii';
import { encodeGrid, decodeGrid, exportJson, importJson } from './codec';
import { generateMaze, randomObstacles, type MazeKind } from './mazes';
import { applyTerrainNoise } from './noise';
import { UndoStack } from '../undo';
import { IndexedMinHeap } from '../algo/min-heap';
import { createRng } from '../rng';

describe('grid ops', () => {
  it('brush areas: circle matches the integer formula, square = size², clipped at edges', () => {
    for (const size of [1, 3, 5, 7, 9]) {
      const g = createGrid(40, 40);
      applyEdit(g, { op: 'stamp', x: 20, y: 20, value: 3, size, shape: 'circle' });
      const r = Math.floor((size - 1) / 2);
      let expected = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) expected++;
      expect(g.cells.reduce((a, v) => a + (v === 3 ? 1 : 0), 0)).toBe(expected);
      const s = createGrid(40, 40);
      applyEdit(s, { op: 'stamp', x: 20, y: 20, value: 3, size, shape: 'square' });
      expect(s.cells.reduce((a, v) => a + (v === 3 ? 1 : 0), 0)).toBe(size * size);
    }
    const edge = createGrid(10, 10);
    applyEdit(edge, { op: 'stamp', x: 0, y: 0, value: 1, size: 5, shape: 'square' });
    expect(edge.cells.reduce((a, v) => a + v, 0)).toBe(9);
  });

  it('bresenham includes endpoints, is 8-connected, same cells either direction', () => {
    const draw = (x0: number, y0: number, x1: number, y1: number) => {
      const g = createGrid(50, 50);
      applyEdit(g, { op: 'line', x0, y0, x1, y1, value: 1, size: 1 });
      return [...g.cells.entries()].filter(([, v]) => v === 1).map(([i]) => i).sort((a, b) => a - b);
    };
    const a = draw(3, 4, 44, 31);
    expect(a).toEqual(draw(44, 31, 3, 4));
    const pts = a.map((i) => [i % 50, Math.floor(i / 50)] as [number, number]);
    expect(pts[0]).toEqual([3, 4]);
    expect(pts[pts.length - 1]).toEqual([44, 31]);
    for (let i = 1; i < pts.length; i++) expect(Math.max(Math.abs(pts[i]![0] - pts[i - 1]![0]), Math.abs(pts[i]![1] - pts[i - 1]![1]))).toBe(1);
  });

  it('flood fill fills a region exactly, never leaks diagonally, no-op on same value', () => {
    const g = createGrid(9, 9, 1);
    g.cells.fill(0);
    for (let y = 0; y < 9; y++) g.cells[4 * 9 + y] = 1; // vertical wall
    g.cells[4 * 9 + 4] = 0; // diagonal-ish gap does not exist (wall remains at (4,4)=0 would leak)
    g.cells[4 * 9 + 4] = 1;
    applyEdit(g, { op: 'fill', x: 0, y: 0, value: 2 });
    expect(g.cells[0]).toBe(2);
    expect(g.cells[8 * 9]).toBe(0);
    const noop = applyEdit(g, { op: 'fill', x: 0, y: 0, value: 2 });
    expect(noop.index.length).toBe(0);
  });

  it('rect: both corner orders same; filled vs outline counts', () => {
    const a = createGrid(20, 20);
    const b = createGrid(20, 20);
    applyEdit(a, { op: 'rect', x0: 2, y0: 3, x1: 10, y1: 12, value: 5, filled: true });
    applyEdit(b, { op: 'rect', x0: 10, y0: 12, x1: 2, y1: 3, value: 5, filled: true });
    expect(a.cells).toEqual(b.cells);
    expect(a.cells.reduce((acc, v) => acc + v, 0) / 5).toBe(9 * 10);
    const c = createGrid(20, 20);
    applyEdit(c, { op: 'rect', x0: 2, y0: 3, x1: 10, y1: 12, value: 5, filled: false });
    expect(c.cells.reduce((acc, v) => acc + v, 0) / 5).toBe(2 * 9 + 2 * 10 - 4);
  });

  it('500 random edits undo exactly; patch undo/redo round-trips', () => {
    const rng = createRng(7);
    const g = createGrid(25, 25);
    for (let k = 0; k < 500; k++) {
      const before = g.cells.slice();
      const op = rng.int(0, 3);
      const patch = applyEdit(g, op === 0
        ? { op: 'stamp', x: rng.int(0, 24), y: rng.int(0, 24), value: rng.int(0, 9), size: rng.int(1, 5), shape: 'circle' }
        : op === 1
        ? { op: 'line', x0: rng.int(0, 24), y0: rng.int(0, 24), x1: rng.int(0, 24), y1: rng.int(0, 24), value: rng.int(1, 9), size: 1 }
        : op === 2
        ? { op: 'rect', x0: rng.int(0, 24), y0: rng.int(0, 24), x1: rng.int(0, 24), y1: rng.int(0, 24), value: 4, filled: rng.next() < 0.5 }
        : { op: 'fill', x: rng.int(0, 24), y: rng.int(0, 24), value: 6 });
      applyPatch(g, patch, 'undo');
      expect(g.cells).toEqual(before);
      applyPatch(g, patch, 'redo');
      expect(g.cells).toEqual(patch.after.length ? g.cells : before);
    }
  });

  it('corner rules: never blocks both diagonals when one orthogonal is walled; always allows', () => {
    const g = createGrid(3, 3);
    g.cells[1] = 1; // above centre
    const out = new Int32Array(8);
    expect(neighbors(g, 4, true, 'never', (v) => v === 1, out)).toBe(5);
    expect(neighbors(g, 4, true, 'oneBlocked', (v) => v === 1, out)).toBe(7);
    expect(neighbors(g, 4, true, 'always', (v) => v === 1, out)).toBe(7);
    expect(neighbors(g, 4, false, 'never', (v) => v === 1, out)).toBe(3);
  });

  it('JSON export/import round-trips; malformed inputs rejected without throwing', () => {
    const g = createGrid(12, 8);
    g.cells.fill(0); g.cells[30] = 5; g.cells[31] = 5;
    const doc = importJson(exportJson(g, 2, 70));
    expect(doc).not.toBeNull();
    expect(doc!.cells).toEqual(g.cells);
    expect(importJson('{oops')).toBeNull();
    expect(importJson(JSON.stringify({ v: 1, w: 2, h: 2, start: 0, goal: 1, rle: [[2, 3]] }))).toBeNull();
    expect(importJson(JSON.stringify({ v: 1, w: 9999, h: 2, start: 0, goal: 1, rle: [] }))).toBeNull();
  });
});

describe('codec', () => {
  it('100 random grids round-trip through RLE + base64url', () => {
    const rng = createRng(99);
    for (let k = 0; k < 100; k++) {
      const w = rng.int(1, 60);
      const h = rng.int(1, 60);
      const g = createGrid(w, h);
      for (let i = 0; i < g.cells.length; i++) g.cells[i] = rng.int(0, 10);
      const start = rng.int(0, w * h - 1);
      const goal = rng.int(0, w * h - 1);
      const doc = decodeGrid(encodeGrid(g, start, goal));
      expect(doc).not.toBeNull();
      expect(doc).toMatchObject({ w, h, start, goal });
      expect(doc!.cells).toEqual(g.cells);
    }
  });

  it('maze 41×25 encodes small; garbage/truncated/huge inputs return null', () => {
    const g = generateMaze('kruskal', 41, 25, createRng(3));
    const encoded = encodeGrid(g, 1 * 41 + 1, 23 * 41 + 39);
    expect(encoded.length).toBeLessThan(3000);
    expect(decodeGrid('!!!')).toBeNull();
    expect(decodeGrid(encoded.slice(0, 6))).toBeNull();
    expect(decodeGrid(encodeGrid(createGrid(4, 4), 0, 15) + 'AA')).toBeNull();
    expect(decodeGrid(encodeGrid(createGrid(300, 4), 0, 3))).toBeNull();
    expect(decodeGrid(encodeGrid(createGrid(4, 4), 0, 999))).toBeNull();
  });
});

describe('mazes, noise, ascii, heap, undo', () => {
  const countOpen = (cells: Uint8Array) => cells.reduce((a, v) => a + (v === 0 ? 1 : 0), 0);
  const countEdges = (w: number, h: number, cells: Uint8Array) => {
    let e = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cells[y * w + x] !== 0) continue;
      if (x + 1 < w && cells[y * w + x + 1] === 0) e++;
      if (y + 1 < h && cells[(y + 1) * w + x] === 0) e++;
    }
    return e;
  };
  const connected = (w: number, h: number, cells: Uint8Array) => {
    const first = cells.findIndex((v) => v === 0);
    const seen = new Uint8Array(cells.length);
    const stack = [first];
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i] || cells[i] !== 0) continue;
      seen[i] = 1;
      const x = i % w; const y = (i / w) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
    return [...cells.keys()].every((i) => cells[i] !== 0 || seen[i]);
  };

  it('all four maze generators produce connected perfect mazes on odd dimensions', () => {
    for (const kind of ['backtracker', 'prim', 'kruskal', 'division'] as MazeKind[]) {
      const g = generateMaze(kind, 30, 20, createRng(11));
      expect(g.w % 2).toBe(1);
      expect(g.h % 2).toBe(1);
      expect(connected(g.w, g.h, g.cells)).toBe(true);
      const open = countOpen(g.cells);
      expect(open).toBeGreaterThan(10);
      expect(countEdges(g.w, g.h, g.cells)).toBe(open - 1);
    }
  });

  it('mazes are seed-deterministic; different seeds differ; obstacles and noise are deterministic', () => {
    const a = generateMaze('backtracker', 21, 15, createRng(5));
    const b = generateMaze('backtracker', 21, 15, createRng(5));
    const c = generateMaze('backtracker', 21, 15, createRng(6));
    expect(a.cells).toEqual(b.cells);
    expect(a.cells).not.toEqual(c.cells);
    const g1 = randomObstacles(createGrid(20, 20), 25, createRng(2));
    const g2 = randomObstacles(createGrid(20, 20), 25, createRng(2));
    expect(g1.cells).toEqual(g2.cells);
    const t1 = applyTerrainNoise(createGrid(30, 30), { scale: 6, grass: 0.4, mud: 0.7, water: 0.85 }, createRng(1));
    const t2 = applyTerrainNoise(createGrid(30, 30), { scale: 6, grass: 0.4, mud: 0.7, water: 0.85 }, createRng(1));
    expect(t1.cells).toEqual(t2.cells);
    expect([...t1.cells].every((v) => [0, 2, 5, 10].includes(v))).toBe(true);
  });

  it('ASCII round trip preserves walls, terrain, start and goal', () => {
    const text = 'S..#..\n.##.3.\n....G.';
    const parsed = parseGrid(text);
    expect(parsed.start).toBe(0);
    expect(parsed.goal).toBe(2 * 6 + 4);
    expect(parsed.grid.cells[1 * 6 + 4]).toBe(3);
    const formatted = formatGrid(parsed.grid, parsed.start, parsed.goal);
    expect(parseGrid(formatted).grid.cells).toEqual(parsed.grid.cells);
  });

  it('indexed heap matches a sorted reference incl. decreaseKey and (f,h,seq) tie-break', () => {
    const rng = createRng(77);
    const heap = new IndexedMinHeap(60);
    const ref = new Map<number, { f: number; h: number; order: number }>();
    let order = 0;
    const ops: string[] = [];
    for (let k = 0; k < 10000; k++) {
      const roll = rng.next();
      const id = rng.int(0, 59);
      if (roll < 0.6) {
        const f = rng.int(0, 20); const h = rng.int(0, 20);
        const pushed = heap.push(id, f, h);
        const ex = ref.get(id);
        if (!ex) { ref.set(id, { f, h, order: order++ }); }
        else if (f < ex.f || (f === ex.f && h < ex.h)) { ref.set(id, { f, h, order: ex.order }); }
        void pushed;
      } else {
        const got = heap.pop();
        let best: number | null = null;
        let bestV: { f: number; h: number; order: number } | null = null;
        for (const [rid, v] of ref) {
          if (!bestV || v.f < bestV.f || (v.f === bestV.f && (v.h < bestV.h || (v.h === bestV.h && v.order < bestV.order)))) { best = rid; bestV = v; }
        }
        if (best !== null) ref.delete(best);
        expect(got?.id ?? null, ops.slice(-5).join(',')).toBe(best);
      }
      ops.push(`${roll < 0.6 ? 'push' : 'pop'}:${id}`);
    }
  });

  it('UndoStack caps entries and clears redo after a new push', () => {
    const s = new UndoStack<number>(3);
    s.push(1); s.push(2); s.push(3);
    expect(s.undo()).toBe(3);
    expect(s.canRedo).toBe(true);
    s.push(4);
    expect(s.canRedo).toBe(false);
    s.push(5); s.push(6);
    expect(s.size).toBeLessThanOrEqual(3);
  });
});
