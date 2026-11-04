// ─── JVM GC · constants.ts — the cost model, in ONE place ──────────────────
// Tuned for legibility (a full GC reads as ~50-150 ms, a minor GC ~2-10 ms),
// NOT measured from a real JVM. Educational model — see concepts tab.

export const TICK_US = 10_000; // mutator tick: 10 ms of sim time

export const COST = {
  minorBaseUs: 1_200,
  minorPerLiveCellUs: 22, // copying live young data
  minorPerMarkedCellUs: 2,
  fullBaseUs: 3_000,
  fullPerMarkedCellUs: 34, // marking the whole live set
  sweepPerFreedCellUs: 2,
  compactPerMovedCellUs: 6,
} as const;

export interface WorkloadPreset {
  allocRate: number;
  shortMs: number;
  longLivedPct: number;
  leakPct: number;
  largeObjPct: number;
  oldToYoungPct: number;
}

export const PRESETS: Record<string, WorkloadPreset> = {
  'web-requests': { allocRate: 3500, shortMs: 250, longLivedPct: 8, leakPct: 0.5, largeObjPct: 2, oldToYoungPct: 10 },
  'cache-heavy': { allocRate: 2200, shortMs: 900, longLivedPct: 30, leakPct: 0.5, largeObjPct: 2, oldToYoungPct: 25 },
  leaky: { allocRate: 3000, shortMs: 300, longLivedPct: 10, leakPct: 8, largeObjPct: 2, oldToYoungPct: 10 },
  'big-arrays': { allocRate: 2600, shortMs: 500, longLivedPct: 12, leakPct: 0.5, largeObjPct: 9, oldToYoungPct: 10 },
};
