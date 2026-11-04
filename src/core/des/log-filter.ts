// ─── core/des/log-filter.ts — pure log filtering ────────────────────────────

import type { LogEntry } from '../types';

export interface LogFilter {
  actors?: Set<number | null>;
  cats?: Set<string>;
  text?: string;
  upTo?: number; // only entries with i <= upTo
}

/** Returns indices into `log` matching the filter (all present criteria ANDed). */
export function filterLog(log: readonly LogEntry[], f: LogFilter): number[] {
  const text = f.text?.trim().toLowerCase();
  const out: number[] = [];
  for (let idx = 0; idx < log.length; idx++) {
    const e = log[idx]!;
    if (f.upTo !== undefined && e.i > f.upTo) continue;
    if (f.cats && !f.cats.has(e.cat)) continue;
    if (f.actors && !f.actors.has(e.actor)) continue;
    if (text && !e.text.toLowerCase().includes(text)) continue;
    out.push(idx);
  }
  return out;
}
