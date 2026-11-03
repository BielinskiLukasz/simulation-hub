// ─── Simulation Hub · core/registry.ts ──────────────────────────────────────
// Lookup + filtering over manifest entries. The hub imports meta only —
// simulation code arrives later via each entry's lazy load().

import type { Category, SimEntry } from './types';

export function findEntry(entries: SimEntry[], id: string): SimEntry | undefined {
  return entries.find((e) => e.meta.id === id);
}

export interface FilterOptions {
  category?: Category | 'all';
  query?: string;
}

export function filterEntries(entries: SimEntry[], opts: FilterOptions): SimEntry[] {
  const q = (opts.query ?? '').trim().toLowerCase();
  return entries.filter((e) => {
    if (opts.category && opts.category !== 'all' && e.meta.category !== opts.category) return false;
    if (!q) return true;
    const hay = `${e.meta.title} ${e.meta.description} ${e.meta.tags.join(' ')} ${e.meta.category}`.toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

export function categoriesPresent(entries: SimEntry[]): Category[] {
  const seen: Category[] = [];
  for (const e of entries) if (!seen.includes(e.meta.category)) seen.push(e.meta.category);
  return seen;
}

/** Caller supplies the random float — core/ itself never touches Math.random. */
export function randomEntry(entries: SimEntry[], excludeId: string | undefined, rand01: number): SimEntry | undefined {
  const pool = entries.filter((e) => e.meta.id !== excludeId);
  if (pool.length === 0) return entries[0];
  const idx = Math.min(Math.floor(rand01 * pool.length), pool.length - 1);
  return pool[idx];
}
