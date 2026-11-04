import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, onPointer, step, type Params, type State } from './logic';

function empty(params: Partial<Params> = {}): State {
  const s = init({ ...defaultParams, pattern: 'glider', cellSize: 10, ...params }, createRng(1));
  s.cells.fill(0); s.age.fill(0); s.alive = 0; s.generation = 0;
  return s;
}
function set(s: State, x: number, y: number): void {
  s.cells[y * s.cols + x] = 1;
  s.age[y * s.cols + x] = 1;
  s.alive++;
}
const liveCells = (s: State): string[] => {
  const out: string[] = [];
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) if (s.cells[y * s.cols + x] === 1) out.push(`${x},${y}`);
  return out.sort();
};

describe('game-of-life logic', () => {
  it('block is a still life (stable forever)', () => {
    const s = empty();
    set(s, 5, 5); set(s, 6, 5); set(s, 5, 6); set(s, 6, 6);
    const before = liveCells(s);
    for (let i = 0; i < 10; i++) step(s, 1 / 60);
    expect(liveCells(s)).toEqual(before);
    expect(s.generation).toBe(10);
  });

  it('blinker oscillates with period 2', () => {
    const s = empty();
    set(s, 10, 10); set(s, 11, 10); set(s, 12, 10);
    const horizontal = liveCells(s);
    step(s, 1 / 60);
    expect(liveCells(s)).toEqual(['11,9', '11,10', '11,11'].sort());
    step(s, 1 / 60);
    expect(liveCells(s)).toEqual(horizontal);
  });

  it('glider translates by (+1,+1) after 4 generations', () => {
    const s = empty();
    // glider at (5,5): relative cells (1,0),(2,1),(0,2),(1,2),(2,2)
    set(s, 6, 5); set(s, 7, 6); set(s, 5, 7); set(s, 6, 7); set(s, 7, 7);
    for (let i = 0; i < 4; i++) step(s, 1 / 60);
    expect(liveCells(s)).toEqual(['6,8', '7,6', '7,8', '8,7', '8,8'].sort());
  });

  it('determinism: same seed soup → identical grids after 200 generations', () => {
    const a = init(defaultParams, createRng(42));
    const b = init(defaultParams, createRng(42));
    for (let i = 0; i < 200; i++) { step(a, 1 / 60); step(b, 1 / 60); }
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
    const c = init(defaultParams, createRng(43));
    for (let i = 0; i < 200; i++) step(c, 1 / 60);
    expect(Array.from(c.cells)).not.toEqual(Array.from(a.cells));
  });

  it('wrap: a blinker straddling the edge still oscillates on the torus', () => {
    const s = empty({ wrap: true });
    set(s, s.cols - 1, 10); set(s, 0, 10); set(s, 1, 10);
    const before = liveCells(s);
    step(s, 1 / 60); step(s, 1 / 60);
    expect(liveCells(s)).toEqual(before);
  });

  it('onPointer paints and erases cells at world coordinates', () => {
    const s = empty();
    onPointer(s, { type: 'down', x: 105, y: 205, button: 0, shift: false, alt: false, pressed: true });
    expect(s.cells[20 * s.cols + 10]).toBe(1);
    onPointer(s, { type: 'down', x: 105, y: 205, button: 0, shift: true, alt: false, pressed: true });
    expect(s.cells[20 * s.cols + 10]).toBe(0);
  });

  it('underpopulation: a lone cell dies', () => {
    const s = empty();
    set(s, 20, 20);
    step(s, 1 / 60);
    expect(s.alive).toBe(0);
  });
});
