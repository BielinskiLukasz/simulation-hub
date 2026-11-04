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

/** Derive an independent, well-mixed 32-bit seed for chunk `index` from a base seed. */
export function deriveSeed(seed: number, index: number): number {
  let z = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** Standard normal sampler (Box–Muller with a cached spare). Create one per chunk/stream. */
export function createNormal(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u === 0) u = rng.next();
    const v = rng.next();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
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
