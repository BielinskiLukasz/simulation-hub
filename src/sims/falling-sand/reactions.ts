// ─── Falling sand · reactions.ts — data-driven reaction lookup ─────────────
// A symmetric 16×16 table: one read per neighbour check in the hot loop.

import { M } from './materials';

export interface Reaction {
  a: number;
  b: number;
  prob: number; // 0..255
  toA: number;
  toB: number;
  label: string;
}

export const REACTIONS: Reaction[] = [
  { a: M.Lava, b: M.Water, prob: 255, toA: M.Stone, toB: M.Steam, label: 'lava + water → stone + steam' },
  { a: M.Fire, b: M.Water, prob: 200, toA: M.Air, toB: M.Steam, label: 'fire + water → steam' },
  { a: M.Fire, b: M.Plant, prob: 120, toA: M.Fire, toB: M.Fire, label: 'fire + plant → fire spreads' },
  { a: M.Lava, b: M.Plant, prob: 180, toA: M.Lava, toB: M.Fire, label: 'lava + plant → fire' },
  { a: M.Plant, b: M.Water, prob: 100, toA: M.Plant, toB: M.Plant, label: 'plant + water → growth' },
  { a: M.Fire, b: M.Lava, prob: 0, toA: M.Fire, toB: M.Lava, label: 'no reaction' },
];

/** lookup[a*16+b] = index into REACTIONS, or -1. Symmetric. */
export const REACTION_LOOKUP: Int8Array = (() => {
  const table = new Int8Array(16 * 16).fill(-1);
  REACTIONS.forEach((r, i) => {
    table[r.a * 16 + r.b] = i;
    table[r.b * 16 + r.a] = i;
  });
  return table;
})();

export function reactionFor(a: number, b: number): Reaction | null {
  const idx = REACTION_LOOKUP[a * 16 + b];
  return idx === undefined || idx < 0 ? null : REACTIONS[idx]!;
}
