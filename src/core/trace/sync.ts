// ─── core/trace/sync.ts — synchronize two trace panes ──────────────────────

export type SyncMode = 'steps' | 'work' | 'normalized';

export interface SyncPane {
  length: number;
  work?: ArrayLike<number>; // monotonic cumulative, index = position (0..length)
}

/** Largest position whose work value ≤ target (binary search; plateaus OK). */
export function workPosition(cumulative: ArrayLike<number>, target: number): number {
  let lo = 0;
  let hi = Math.max(0, cumulative.length - 1);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cumulative[mid]! <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export class SyncGroup {
  mode: SyncMode = 'steps';
  constructor(public panes: SyncPane[]) {}

  maxFor(mode: SyncMode = this.mode): number {
    if (mode === 'normalized') return 1;
    if (mode === 'work') {
      return Math.max(1, ...this.panes.map((p) =>
        p.work && p.work.length > 0 ? p.work[p.work.length - 1]! : p.length));
    }
    return Math.max(1, ...this.panes.map((p) => p.length));
  }

  /** master ∈ [0, maxFor(mode)] → per-pane positions. */
  positions(master: number, mode: SyncMode = this.mode): number[] {
    return this.panes.map((p) => {
      if (mode === 'normalized') return Math.round(Math.min(1, Math.max(0, master)) * p.length);
      if (mode === 'work') {
        if (!p.work) return Math.round(Math.min(1, master / Math.max(1, this.maxFor(mode))) * p.length);
        return workPosition(p.work, master);
      }
      return Math.min(p.length, Math.max(0, Math.floor(master)));
    });
  }
}
