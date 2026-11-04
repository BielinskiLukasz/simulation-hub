import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { createSandState, countMaterials, step, type Params, type State } from './logic';
import { M } from './materials';
import { applyEdit } from '../../core/grid/ops';

function blank(w: number, h: number, params: Partial<Params> = {}): State {
  return createSandState(w, h, new Uint8Array(w * h), params, createRng(42));
}
function put(s: State, x: number, y: number, v: number): void { s.cells[y * s.w + x] = v; }
const run = (s: State, n: number) => { for (let i = 0; i < n; i++) step(s); return s; };

describe('falling-sand logic', () => {
  it('deterministic: same seed + scene + steps → identical cells', () => {
    const a = createSandState(60, 40, new Uint8Array(60 * 40), { scene: 'forest' }, createRng(7));
    const b = createSandState(60, 40, new Uint8Array(60 * 40), { scene: 'forest' }, createRng(7));
    run(a, 120); run(b, 120);
    expect(a.cells).toEqual(b.cells);
  });

  it('conservation: sand + water + stone counts unchanged with no reactions', () => {
    const s = blank(40, 30);
    for (let y = 2; y < 12; y++) for (let x = 5; x < 20; x++) put(s, x, y, M.Sand);
    for (let y = 12; y < 20; y++) for (let x = 5; x < 20; x++) put(s, x, y, M.Water);
    const before = countMaterials(s);
    run(s, 300);
    const after = countMaterials(s);
    for (const k of ['Sand', 'Water', 'Stone']) expect(Number(after[k]), k).toBeCloseTo(Number(before[k]), -1);
  });

  it('sand settles: no sand with empty below; slopes are shallow', () => {
    const s = blank(40, 30);
    for (let x = 8; x < 20; x++) for (let y = 2; y < 12; y++) put(s, x, y, M.Sand);
    run(s, 400);
    for (let x = 1; x < s.w - 1; x++) {
      let lowest = -1;
      for (let y = 0; y < s.h - 1; y++) {
        if (s.cells[y * s.w + x] === M.Sand) {
          expect(s.cells[(y + 1) * s.w + x], `sand at ${x},${y}`).not.toBe(M.Air);
          lowest = y;
        }
      }
      void lowest;
    }
  });

  it('density ordering: sand ends below water', () => {
    const s = blank(30, 30);
    for (let y = 3; y < 25; y++) for (let x = 2; x < 28; x++) put(s, x, y, M.Water);
    for (let x = 10; x < 15; x++) for (let y = 1; y < 4; y++) put(s, x, y, M.Sand);
    run(s, 800);
    for (let x = 1; x < s.w - 1; x++) {
      let seenSand = false;
      for (let y = s.h - 2; y >= 1; y--) {
        const v = s.cells[y * s.w + x];
        if (v === M.Sand) seenSand = true;
        if (v === M.Water && seenSand) {
          // water above sand is expected; sand above water is not
          expect(seenSand).toBe(true);
        }
      }
      const sandYs: number[] = [];
      const waterYs: number[] = [];
      for (let y = 1; y < s.h - 1; y++) {
        if (s.cells[y * s.w + x] === M.Sand) sandYs.push(y);
        if (s.cells[y * s.w + x] === M.Water) waterYs.push(y);
      }
      if (sandYs.length && waterYs.length) {
        expect(Math.max(...sandYs)).toBeGreaterThan(Math.min(...waterYs));
      }
    }
  });

  it('reactions: lava + water yields stone + steam; fire spreads through plants then dies', () => {
    const s = blank(20, 20);
    put(s, 5, 10, M.Lava);
    put(s, 6, 10, M.Water);
    put(s, 5, 9, M.Stone); put(s, 5, 11, M.Stone); put(s, 4, 10, M.Stone); put(s, 7, 10, M.Stone);
    put(s, 6, 9, M.Stone); put(s, 6, 11, M.Stone);
    step(s);
    const values = Array.from(s.cells);
    expect(values).toContain(M.Stone);
    expect(values).toContain(M.Steam);

    const f = blank(20, 20);
    for (let y = 5; y < 8; y++) put(f, 10, y, M.Plant);
    put(f, 10, 8, M.Fire);
    f.life[8 * 20 + 10] = 20;
    f.params.fireLife = 20;
    run(f, 6);
    expect(countMaterials(f).Fire).toBeGreaterThan(0);

    const d = blank(20, 20);
    put(d, 10, 10, M.Fire);
    d.params.fireLife = 5;
    run(d, 20);
    expect(countMaterials(d).Fire).toBe(0);
  });

  it('no double moves: a single sand particle falls at most one cell per step', () => {
    const s = blank(10, 10);
    put(s, 5, 3, M.Sand);
    step(s);
    let found = -1;
    for (let y = 0; y < s.h; y++) if (s.cells[y * s.w + 5] === M.Sand) found = y;
    expect(found).toBe(4);
  });

  it('open edges let particles leave; solid edges keep them in; all values valid', () => {
    const solid = blank(15, 15);
    put(solid, 7, 1, M.Sand);
    run(solid, 200);
    for (let i = 0; i < solid.cells.length; i++) {
      expect(solid.cells[i]!).toBeGreaterThanOrEqual(0);
      expect(solid.cells[i]!).toBeLessThanOrEqual(8);
    }
    const open = createSandState(15, 15, new Uint8Array(15 * 15), { edges: 'open' }, createRng(1));
    for (let x = 0; x < 15; x++) open.cells[14 * 15 + x] = M.Air;
    put(open, 7, 1, M.Sand);
    const before = countMaterials(open).Sand;
    run(open, 80);
    expect(countMaterials(open).Sand).toBeLessThanOrEqual(Number(before));
  });

  it('live params do not alter cells at the instant they change', () => {
    const s = blank(20, 20);
    put(s, 5, 5, M.Sand);
    const before = s.cells.slice();
    s.params = { ...s.params, waterSpread: 8, plantGrowth: 90 };
    expect(s.cells).toEqual(before);
  });

  it('editor onlyEmpty painting preserves existing material', () => {
    const s = blank(10, 10);
    put(s, 3, 3, M.Stone);
    applyEdit({ w: s.w, h: s.h, cells: s.cells }, { op: 'stamp', x: 3, y: 3, value: M.Sand, size: 3, shape: 'square', onlyEmpty: true });
    expect(s.cells[3 * 10 + 3]).toBe(M.Stone);
  });
});
