// ─── core/grid/codec.ts — RLE + base64url / JSON, fully validated ──────────

import type { Grid } from './grid';

export interface GridDoc {
  w: number;
  h: number;
  start: number;
  goal: number;
  cells: Uint8Array;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

function bytesToB64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2]!;
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += ALPHABET[c & 63]!;
  }
  return out;
}

function b64urlToBytes(s: string): Uint8Array | null {
  const vals: number[] = [];
  for (const ch of s) {
    const v = REVERSE.get(ch);
    if (v === undefined) return null;
    vals.push(v);
  }
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const a = vals[i]!; const b = vals[i + 1]; const c = vals[i + 2]; const d = vals[i + 3];
    if (b === undefined) return null;
    out.push((a << 2) | (b >> 4));
    if (c !== undefined) out.push(((b & 15) << 4) | (c >> 2));
    if (d !== undefined) out.push(((c! & 3) << 6) | d);
  }
  return Uint8Array.from(out);
}

function pushVarint(out: number[], n: number): void {
  let v = n >>> 0;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
}

class Reader {
  private pos = 0;
  constructor(private bytes: Uint8Array) {}
  get left(): number { return this.bytes.length - this.pos; }
  byte(): number | null {
    if (this.pos >= this.bytes.length) return null;
    return this.bytes[this.pos++]!;
  }
  varint(): number | null {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.byte();
      if (b === null) return null;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    return null;
  }
}

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
