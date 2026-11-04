// ─── core/grid/codec.ts — RLE + base64url / JSON, fully validated ──────────

import type { Grid } from './grid';

function pushVarint(out: number[], n: number): void {
  let v = n >>> 0;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
}


export interface GridDoc {
  w: number;
  h: number;
  start: number;
  goal: number;
  cells: Uint8Array;
}

import { base64UrlToBytes as b64urlToBytes, bytesToBase64Url as bytesToB64url, ByteReader as Reader } from '../codec';

export const MAX_DIM = 256;
export const MAX_VALUE = 15;

/** Encode with RLE pairs (value byte, run varint), version 1, base64url. */
export function encodeGrid(g: Grid, start: number, goal: number): string {
  const out: number[] = [1];
  pushVarint(out, g.w);
  pushVarint(out, g.h);
  pushVarint(out, start);
  pushVarint(out, goal);
  let run = 1;
  for (let i = 1; i <= g.cells.length; i++) {
    if (i < g.cells.length && g.cells[i] === g.cells[i - 1]) { run++; continue; }
    out.push(Math.min(MAX_VALUE, g.cells[i - 1]!));
    pushVarint(out, run);
    run = 1;
  }
  return bytesToB64url(Uint8Array.from(out));
}

export function decodeGrid(s: string, opts: { maxDim?: number; maxLength?: number } = {}): GridDoc | null {
  try {
    if (!s || s.length > (opts.maxLength ?? 40000)) return null;
    const bytes = b64urlToBytes(s);
    if (!bytes) return null;
    const r = new Reader(bytes);
    if (r.byte() !== 1) return null;
    const w = r.varint();
    const h = r.varint();
    const start = r.varint();
    const goal = r.varint();
    const limit = opts.maxDim ?? MAX_DIM;
    if (w === null || h === null || start === null || goal === null) return null;
    if (w < 1 || h < 1 || w > limit || h > limit) return null;
    const expected = w * h;
    if (start >= expected || goal >= expected) return null;
    const cells = new Uint8Array(expected);
    let filled = 0;
    while (filled < expected) {
      const value = r.byte();
      const run = r.varint();
      if (value === null || run === null) return null;
      if (value > MAX_VALUE || run < 1 || filled + run > expected) return null;
      cells.fill(value, filled, filled + run);
      filled += run;
    }
    if (r.left !== 0) return null; // trailing garbage
    return { w, h, start, goal, cells };
  } catch {
    return null;
  }
}

export function exportJson(g: Grid, start: number, goal: number): string {
  const rle: [number, number][] = [];
  let run = 1;
  for (let i = 1; i <= g.cells.length; i++) {
    if (i < g.cells.length && g.cells[i] === g.cells[i - 1]) { run++; continue; }
    rle.push([g.cells[i - 1]!, run]);
    run = 1;
  }
  return JSON.stringify({ v: 1, w: g.w, h: g.h, start, goal, rle });
}

export function importJson(text: string, opts: { maxDim?: number } = {}): GridDoc | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as { v?: unknown; w?: unknown; h?: unknown; start?: unknown; goal?: unknown; rle?: unknown };
    if (o.v !== 1) return null;
    if (typeof o.w !== 'number' || typeof o.h !== 'number' || typeof o.start !== 'number' || typeof o.goal !== 'number') return null;
    if (o.w < 1 || o.h < 1 || o.w > (opts.maxDim ?? MAX_DIM) || o.h > (opts.maxDim ?? MAX_DIM)) return null;
    if (!Array.isArray(o.rle)) return null;
    const expected = o.w * o.h;
    if (o.start >= expected || o.goal >= expected) return null;
    const cells = new Uint8Array(expected);
    let filled = 0;
    for (const pair of o.rle as unknown[]) {
      if (!Array.isArray(pair) || pair.length !== 2) return null;
      const [value, run] = pair as [unknown, unknown];
      if (typeof value !== 'number' || typeof run !== 'number') return null;
      if (value < 0 || value > MAX_VALUE || !Number.isInteger(run) || run < 1) return null;
      if (filled + run > expected) return null;
      cells.fill(value, filled, filled + run);
      filled += run;
    }
    if (filled !== expected) return null;
    return { w: o.w, h: o.h, start: o.start, goal: o.goal, cells };
  } catch {
    return null;
  }
}
