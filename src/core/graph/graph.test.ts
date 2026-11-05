import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { degrees, fromEdges, validateGraph } from './graph';
import { barabasiAlbert, erdosRenyi, lattice2d, wattsStrogatz } from './generators';
import { clustering, components, degreeMoments, pathLengthSample, residualMoments } from './metrics';

describe('graph toolkit', () => {
  it('invariants: simple, symmetric, deterministic, seed-dependent', () => {
    const cases = [
      () => erdosRenyi(120, 0.06, createRng(1)),
      () => erdosRenyi(120, 0.06, createRng(2)),
      () => wattsStrogatz(120, 6, 0.1, createRng(1)),
      () => wattsStrogatz(120, 6, 0.1, createRng(2)),
      () => barabasiAlbert(300, 3, createRng(1)),
      () => barabasiAlbert(300, 3, createRng(2)),
    ];
    for (const make of cases) {
      const g = make();
      expect(validateGraph(g)).toBeNull();
      expect(components(g).sizes.length).toBeGreaterThan(0);
    }
    expect(Array.from(erdosRenyi(80, 0.08, createRng(4)).adj)).toEqual(Array.from(erdosRenyi(80, 0.08, createRng(4)).adj));
    expect(Array.from(erdosRenyi(80, 0.08, createRng(4)).adj)).not.toEqual(Array.from(erdosRenyi(80, 0.08, createRng(5)).adj));
  });

  it('ER edge count near p·n(n−1)/2', () => {
    const n = 400; const p = 0.05;
    const g = erdosRenyi(n, p, createRng(9));
    const expected = (p * n * (n - 1)) / 2;
    expect(Math.abs(g.m - expected)).toBeLessThan(3 * Math.sqrt(expected));
  });

  it('WS: beta=0 is a regular high-clustering ring; high beta drops clustering and path length', () => {
    const ring = wattsStrogatz(200, 8, 0, createRng(3));
    const d = degrees(ring);
    expect(new Set(Array.from(d)).size).toBe(1);
    expect(clustering(ring)).toBeCloseTo((3 * (8 - 2)) / (4 * (8 - 1)), 6);
    const wired = wattsStrogatz(200, 8, 0.15, createRng(3));
    const rng = createRng(11);
    expect(pathLengthSample(wired, 30, rng)).toBeLessThan(pathLengthSample(ring, 30, rng));
    const random = erdosRenyi(200, 8 / 199, createRng(3));
    expect(clustering(wired)).toBeGreaterThan(clustering(random));
  });

  it('BA: exact edge count, minimum degree m, hubs emerge', () => {
    const n = 500; const m = 3;
    const g = barabasiAlbert(n, m, createRng(5));
    expect(g.m).toBe((m * (m + 1)) / 2 + m * (n - m - 1));
    const d = degrees(g);
    expect(Math.min(...Array.from(d))).toBeGreaterThanOrEqual(m);
    const max = Math.max(...Array.from(d));
    expect(max).toBeGreaterThan(2 * (2 * g.m / n));
    const moments = degreeMoments(g);
    expect(moments.k2).toBeGreaterThan(moments.k1 * moments.k1);
  });

  it('residualMoments equals rebuilding the induced subgraph; lattice sanity', () => {
    const g = erdosRenyi(150, 0.06, createRng(6));
    const removed = new Uint8Array(150);
    for (let i = 0; i < 150; i += 3) removed[i] = 1;
    const residual = residualMoments(g, removed);
    let k1 = 0; let k2 = 0; let n = 0;
    for (let i = 0; i < 150; i++) {
      if (removed[i]) continue;
      let deg = 0;
      for (let k = g.offsets[i]!; k < g.offsets[i + 1]!; k++) if (!removed[g.adj[k]!]) deg++;
      k1 += deg; k2 += deg * deg; n++;
    }
    expect(residual.k1).toBeCloseTo(k1 / n, 9);
    expect(residual.k2).toBeCloseTo(k2 / n, 9);
    expect(residual.n).toBe(n);
    const lat = lattice2d(10, 10);
    expect(lat.n).toBe(100);
    expect(lat.m).toBe(180);
    expect(fromEdges(4, Int32Array.from([0, 1, 1, 0, 2, 2])).m).toBe(1);
  });
});
