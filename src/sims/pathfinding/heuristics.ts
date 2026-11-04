// ─── Pathfinding · heuristics.ts — integer heuristics + admissibility ──────

import { DIAG, ORTHO } from './costs';

export type HeuristicName = 'zero' | 'manhattan' | 'euclidean' | 'chebyshev' | 'octile';

const COORDS = { w: 1, gx: 0, gy: 0 };

export function heuristic(name: HeuristicName, x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(gx - x);
  const dy = Math.abs(gy - y);
  switch (name) {
    case 'zero': return 0;
    case 'manhattan': return ORTHO * (dx + dy);
    case 'euclidean': return Math.floor(Math.sqrt(dx * dx + dy * dy) * ORTHO + 1e-9);
    case 'chebyshev': return ORTHO * Math.max(dx, dy);
    case 'octile': return ORTHO * Math.max(dx, dy) + (DIAG - ORTHO) * Math.min(dx, dy);
  }
}

/** Admissible for the active connectivity (weight > 1 always breaks it). */
export function isAdmissible(name: HeuristicName, diagonal: boolean, weight = 1): boolean {
  if (weight > 1) return false;
  if (name === 'zero' || name === 'euclidean' || name === 'octile' || name === 'chebyshev') {
    // chebyshev is admissible but weak when DIAG = 1415; still never overestimates
    return true;
  }
  return !(name === 'manhattan' && diagonal);
}

export function heuristicLabel(name: HeuristicName): string {
  return { zero: 'Zero (= Dijkstra)', manhattan: 'Manhattan', euclidean: 'Euclidean', chebyshev: 'Chebyshev', octile: 'Octile' }[name];
}

void COORDS;
