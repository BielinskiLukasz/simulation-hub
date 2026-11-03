// ─── Simulation Hub · core/rng.ts ───────────────────────────────────────────
// mulberry32: tiny, fast, deterministic. Same seed ⇒ identical sequence, always.

import type { Rng } from './types';

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('Rng.pick: empty list');
      return items[Math.floor(next() * items.length)] as never;
    },
  };
}

/** Normalise any user-supplied seed (URL, text input) into a uint32. */
export function normaliseSeed(raw: unknown, fallback = 42): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(Math.abs(raw)) >>> 0;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.floor(Math.abs(n)) >>> 0;
    // stable string hash so ?seed=hello still works deterministically
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  return fallback >>> 0;
}
