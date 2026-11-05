// ─── core/graph/graph.ts — immutable CSR simple graphs ────────────────────

export interface Graph {
  n: number;
  m: number;
  offsets: Int32Array; // n+1
  adj: Int32Array; // 2m, sorted per node
}

/** edges = [u0,v0,u1,v1,...]; dedups undirected pairs, drops self-loops. */
export function fromEdges(n: number, edges: Int32Array): Graph {
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const u = edges[i]!;
    const v = edges[i + 1]!;
    if (u === v || u < 0 || v < 0 || u >= n || v >= n) continue;
    sets[u]!.add(v);
    sets[v]!.add(u);
  }
  let m = 0;
  for (const s of sets) m += s.size;
  m /= 2;
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i]! + sets[i]!.size;
  const adj = new Int32Array(offsets[n]!);
  for (let i = 0; i < n; i++) {
    const list = [...sets[i]!].sort((a, b) => a - b);
    for (let k = 0; k < list.length; k++) adj[offsets[i]! + k] = list[k]!;
  }
  return { n, m, offsets, adj };
}

export function validateGraph(g: Graph): string | null {
  if (g.n < 0) return 'negative n';
  if (g.offsets.length !== g.n + 1) return 'offsets length';
  if (g.offsets[0] !== 0) return 'offsets must start at 0';
  for (let i = 0; i < g.n; i++) if (g.offsets[i + 1]! < g.offsets[i]!) return 'offsets not monotone';
  if (g.adj.length !== g.offsets[g.n]) return 'adj length';
  if (g.adj.length !== 2 * g.m) return 'm mismatch';
  for (let u = 0; u < g.n; u++) {
    for (let k = g.offsets[u]!; k < g.offsets[u + 1]!; k++) {
      const v = g.adj[k]!;
      if (v === u) return 'self loop';
      if (v < 0 || v >= g.n) return 'neighbour out of range';
      if (k > g.offsets[u]! && g.adj[k - 1]! >= v) return 'adjacency not sorted/unique';
      let found = false;
      for (let j = g.offsets[v]!; j < g.offsets[v + 1]!; j++) if (g.adj[j] === u) { found = true; break; }
      if (!found) return 'asymmetric';
    }
  }
  return null;
}

export function* neighbours(g: Graph, u: number): Generator<number> {
  for (let k = g.offsets[u]!; k < g.offsets[u + 1]!; k++) yield g.adj[k]!;
}

export function degrees(g: Graph): Int32Array {
  const out = new Int32Array(g.n);
  for (let i = 0; i < g.n; i++) out[i] = g.offsets[i + 1]! - g.offsets[i]!;
  return out;
}
