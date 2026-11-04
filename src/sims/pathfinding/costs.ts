// ─── Pathfinding · costs.ts — fixed-point costs & terrain ──────────────────
// ORTHO = 1000, DIAG = 1415 (ceil(1000·√2) — rounding UP keeps the Euclidean
// heuristic admissible). Entering a cell costs base × terrainMultiplier(dest).

export const ORTHO = 1000;
export const DIAG = 1415;

export const TERRAIN = {
  FLOOR: 0,
  WALL: 1,
  GRASS: 2,
  MUD: 5,
  WATER: 10,
} as const;

export function isPassable(value: number): boolean {
  return value !== TERRAIN.WALL;
}

/** Terrain value doubles as its multiplier (2..10); floor/wall are ×1. */
export function terrainMultiplier(value: number): number {
  return value <= 1 ? 1 : value;
}

export function stepCost(destination: number, diagonal: boolean, weighted: boolean): number {
  const base = diagonal ? DIAG : ORTHO;
  return weighted ? base * terrainMultiplier(destination) : base;
}

export const PALETTE_LIGHT = [
  { value: 0, label: 'Floor', color: 0xf8fafc, hint: 'Cost ×1' },
  { value: 1, label: 'Wall', color: 0x334155, hint: 'Impassable' },
  { value: 2, label: 'Grass', color: 0x86efac, hint: 'Cost ×2' },
  { value: 5, label: 'Mud', color: 0xb45309, hint: 'Cost ×5' },
  { value: 10, label: 'Water', color: 0x60a5fa, hint: 'Cost ×10' },
];
