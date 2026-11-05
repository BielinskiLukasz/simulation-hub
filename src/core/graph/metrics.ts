// ─── core/graph/metrics.ts — degrees, clustering, components, paths ───────

import type { Rng } from '../types';
import { degrees, neighbours, type Graph } from './graph';

export function degreeMoments(g: Graph): { k1: number; k2: number } {
  const d = degrees(g);
  let k1 = 0; let k2 = 0;
  for (let i = 0; i < g.n; i++) { k1 += d[i]!; k2 += d[i]! * d[i]!; }
  return { k1: g.n ? k1 / g.n : 0, k2: g.n ? k2 / g.n : 0 };
}

export function degreeHistogram(g: Graph): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of degrees(g)) out.set(d, (out.get(d) ?? 0) + 1);
  return out;
}

/** Average local clustering coefficient. */
export function clustering(g: Graph): number {
  const d = degrees(g);
  let total = 0; let counted = 0;
  for (let u = 0; u < g.n; u++) {
    if (d[u]! < 2) continue;
    let links = 0;
    for (const a of neighbours(g, u)) for (const b of neighbours(g, u)) {
      if (a >= b) continue;
      for (const c of neighbours(g, a)) if (c === b) { links++; break; }
    }
    total += (2 * links) / (d[u]! * (d[u]! - 1));
    counted++;
  }
  return counted ? total / counted : 0;
}

export function components(g: Graph): { sizes: number[]; giant: number } {
  const seen = new Uint8Array(g.n);
  const stack = new Int32Array(g.n);
  const sizes: number[] = [];
  for (let s = 0; s < g.n; s++) {
    if (seen[s]) continue;
    let size = 0; let sp = 0;
    stack[sp++] = s; seen[s] = 1;
    while (sp > 0) {
      const u = stack[--sp]!;
      size++;
      for (const v of neighbours(g, u)) if (!seen[v]) { seen[v] = 1; stack[sp++] = v; }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { sizes, giant: sizes[0] ?? 0 };
}

/** Mean shortest path over BFS samples; returns NaN when a sample is disconnected. */
export function pathLengthSample(g: Graph, samples: number, rng: Rng): number {
  const dist = new Int32Array(g.n);
  const queue = new Int32Array(g.n);
  let total = 0; let counted = 0;
  for (let s = 0; s < samples; s++) {
    dist.fill(-1);
    const src = rng.int(0, g.n - 1);
    let head = 0; let tail = 0;
    queue[tail++] = src; dist[src] = 0;
    let sum = 0; let reached = 0;
    while (head < tail) {
      const u = queue[head++]!;
      sum += dist[u]!; reached++;
      for (const v of neighbours(g, u)) if (dist[v]! < 0) { dist[v] = dist[u]! + 1; queue[tail++] = v; }
    }
    if (reached > 1) { total += sum / (reached - 1); counted++; }
  }
  return counted ? total / counted : NaN;
}

/** Degree moments after removing a set of nodes (rebuilt explicitly). */
export function residualMoments(g: Graph, removed: Uint8Array): { k1: number; k2: number; n: number; m: number } {
  const keep: number[] = [];
  for (let i = 0; i < g.n; i++) if (!removed[i]) keep.push(i);
  const index = new Map<number, number>();
  keep.forEach((id, i) => index.set(id, i));
  const out: number[] = [];
  for (const u of keep) for (const v of neighbours(g, u)) if (index.has(v)) out.push(index.get(u)!, index.get(v)!);
  const sub = { n: keep.length, offsets: new Int32Array(0), adj: new Int32Array(0), m: 0 };
  void sub;
  const degreesOut = new Map<number, number>();
  for (const u of keep) {
    let d = 0;
    for (const v of neighbours(g, u)) if (index.has(v)) d++;
    degreesOut.set(index.get(u)!, d);
  }
  let k1 = 0; let k2 = 0;
  for (const d of degreesOut.values()) { k1 += d; k2 += d * d; }
  return { k1: keep.length ? k1 / keep.length : 0, k2: keep.length ? k2 / keep.length : 0, n: keep.length, m: out.length / 2 };
}
