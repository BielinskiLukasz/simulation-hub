// ─── core/graph/generators.ts — seeded simple-graph generators ────────────

import type { Rng } from '../types';
import { degrees, fromEdges, type Graph } from './graph';

function toEdges(pairs: Set<string>, k: number, out: number[]): Int32Array {
  void pairs; void k;
  return Int32Array.from(out);
}

function key(a: number, b: number): string { return a < b ? `${a}:${b}` : `${b}:${a}`; }

export function erdosRenyi(n: number, p: number, rng: Rng): Graph {
  const out: number[] = [];
  for (let u = 0; u < n; u++) {
    const logQ = Math.log(1 - Math.min(0.999999, Math.max(0, p)));
    let v = u + 1;
    for (;;) {
      if (logQ >= 0) break;
      v += Math.floor(Math.log(1 - rng.next()) / logQ);
      if (v >= n) break;
      out.push(u, v);
    }
  }
  return fromEdges(n, Int32Array.from(out));
}

export function wattsStrogatz(n: number, k: number, beta: number, rng: Rng): Graph {
  const half = Math.max(1, Math.floor(k / 2));
  const pairs = new Set<string>();
  for (let u = 0; u < n; u++) for (let d = 1; d <= half; d++) pairs.add(key(u, (u + d) % n));
  const list = [...pairs];
  const edgeSet = new Set(list);
  for (const e of list) {
    if (rng.next() >= beta) continue;
    const [a, b] = e.split(':').map(Number) as [number, number];
    for (let tries = 0; tries < 20; tries++) {
      const c = rng.int(0, n - 1);
      if (c === a || c === b) continue;
      const nk = key(a, c);
      if (edgeSet.has(nk)) continue;
      edgeSet.delete(e);
      edgeSet.add(nk);
      break;
    }
  }
  const out: number[] = [];
  for (const e of edgeSet) { const [a, b] = e.split(':').map(Number) as [number, number]; out.push(a, b); }
  return fromEdges(n, Int32Array.from(out));
}

export function barabasiAlbert(n: number, m: number, rng: Rng): Graph {
  const mm = Math.max(1, Math.min(m, n - 1));
  const out: number[] = [];
  const repeated: number[] = [];
  for (let i = 0; i <= mm; i++) for (let j = 0; j < i; j++) { out.push(i, j); repeated.push(i, j); }
  for (let v = mm + 1; v < n; v++) {
    const chosen = new Set<number>();
    let guard = 0;
    while (chosen.size < mm && guard++ < 10000) {
      const target = repeated[Math.floor(rng.next() * repeated.length)]!;
      if (target !== v) chosen.add(target);
    }
    for (const target of chosen) {
      out.push(v, target);
      repeated.push(v, target, v);
    }
  }
  return fromEdges(n, Int32Array.from(out));
}

export function lattice2d(w: number, h: number): Graph {
  const out: number[] = [];
  const id = (x: number, y: number) => y * w + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x + 1 < w) out.push(id(x, y), id(x + 1, y));
    if (y + 1 < h) out.push(id(x, y), id(x, y + 1));
  }
  return fromEdges(w * h, Int32Array.from(out));
}

export { toEdges };
void degrees;
