// ─── core/grid/ops.ts — pure grid edits → exact undo patches ────────────────

import { inBounds, type Grid } from './grid';
import type { GridEdit, GridPatch } from '../types';

const EMPTY_PATCH: GridPatch = { index: new Int32Array(0), before: new Uint8Array(0), after: new Uint8Array(0) };

class PatchBuilder {
  private before = new Map<number, number>();
  private after = new Map<number, number>();
  constructor(private g: Grid) {}
  set(i: number, v: number): void {
    const old = this.before.has(i) ? this.after.get(i)! : this.g.cells[i]!;
    if (old === v) { this.after.set(i, v); return; }
    if (!this.before.has(i)) this.before.set(i, this.g.cells[i]!);
    this.after.set(i, v);
    this.g.cells[i] = v;
  }
  build(): GridPatch {
    const keys = [...this.after.keys()].filter((i) => this.g.cells[i] !== undefined && this.before.has(i));
    keys.sort((a, b) => a - b);
    const index = new Int32Array(keys.length);
    const before = new Uint8Array(keys.length);
    const after = new Uint8Array(keys.length);
    keys.forEach((k, n) => { index[n] = k; before[n] = this.before.get(k)!; after[n] = this.g.cells[k]!; });
    return keys.length ? { index, before, after } : EMPTY_PATCH;
  }
}

function stampCells(g: Grid, cx: number, cy: number, size: number, shape: 'circle' | 'square', fn: (i: number) => void): void {
  const r = Math.max(0, Math.floor((size - 1) / 2));
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (shape === 'circle' && dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(g, x, y)) continue;
      fn(y * g.w + x);
    }
  }
}

function brush(g: Grid, pb: PatchBuilder, x: number, y: number, value: number, size: number, shape: 'circle' | 'square', onlyEmpty: boolean): void {
  stampCells(g, x, y, size, shape, (i) => {
    if (onlyEmpty && g.cells[i] !== 0) return;
    pb.set(i, value);
  });
}

function lineOp(g: Grid, pb: PatchBuilder, e: Extract<GridEdit, { op: 'line' }>): void {
  let x0 = e.x0; let y0 = e.y0;
  const x1 = e.x1; const y1 = e.y1;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    brush(g, pb, x0, y0, e.value, e.size, 'circle', !!e.onlyEmpty);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function applyEdit(g: Grid, edit: GridEdit): GridPatch {
  if (edit.op === 'replace') {
    const beforeCells = g.cells;
    // replace resizes when dimensions differ; returned patch restores content only
    if (g.w !== edit.w || g.h !== edit.h) {
      g.w = edit.w; g.h = edit.h; g.cells = edit.cells.slice();
      return {
        index: Int32Array.from({ length: beforeCells.length }, (_, i) => i),
        before: beforeCells.slice(),
        after: new Uint8Array(0),
      };
    }
    const pb = new PatchBuilder(g);
    for (let i = 0; i < edit.cells.length; i++) pb.set(i, edit.cells[i]!);
    return pb.build();
  }
  const pb = new PatchBuilder(g);
  switch (edit.op) {
    case 'stamp':
      brush(g, pb, edit.x, edit.y, edit.value, edit.size, edit.shape, !!edit.onlyEmpty);
      break;
    case 'line':
      lineOp(g, pb, edit);
      break;
    case 'rect': {
      const x0 = Math.min(edit.x0, edit.x1);
      const x1 = Math.max(edit.x0, edit.x1);
      const y0 = Math.min(edit.y0, edit.y1);
      const y1 = Math.max(edit.y0, edit.y1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!inBounds(g, x, y)) continue;
          if (!edit.filled && x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
          pb.set(y * g.w + x, edit.value);
        }
      }
      break;
    }
    case 'fill': {
      if (!inBounds(g, edit.x, edit.y)) break;
      const start = edit.y * g.w + edit.x;
      const target = g.cells[start]!;
      if (target === edit.value) break;
      const stack = [start];
      const seen = new Uint8Array(g.cells.length);
      while (stack.length) {
        const i = stack.pop()!;
        if (seen[i] || g.cells[i] !== target) continue;
        seen[i] = 1;
        pb.set(i, edit.value);
        const x = i % g.w;
        const y = (i / g.w) | 0;
        if (x > 0) stack.push(i - 1);
        if (x < g.w - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - g.w);
        if (y < g.h - 1) stack.push(i + g.w);
      }
      break;
    }
  }
  return pb.build();
}

export function mergePatches(patches: GridPatch[]): GridPatch {
  if (patches.length === 0) return EMPTY_PATCH;
  if (patches.length === 1) return patches[0]!;
  const before = new Map<number, number>();
  const after = new Map<number, number>();
  for (const p of patches) {
    for (let k = 0; k < p.index.length; k++) {
      const i = p.index[k]!;
      if (!before.has(i)) before.set(i, p.before[k]!);
      after.set(i, p.after[k]!);
    }
  }
  const keys = [...after.keys()].filter((i) => before.get(i) !== after.get(i)).sort((a, b) => a - b);
  return {
    index: Int32Array.from(keys),
    before: Uint8Array.from(keys.map((i) => before.get(i)!)),
    after: Uint8Array.from(keys.map((i) => after.get(i)!)),
  };
}

export function applyPatch(g: Grid, patch: GridPatch, direction: 'undo' | 'redo'): void {
  const values = direction === 'undo' ? patch.before : patch.after;
  for (let k = 0; k < patch.index.length; k++) {
    if (patch.index[k]! < g.cells.length) g.cells[patch.index[k]!] = values[k]!;
  }
}

/** Reusable neighbour buffer for editors/algos (single-threaded UI use). */
export const NEIGHBOR_SCRATCH = new Int32Array(8);
