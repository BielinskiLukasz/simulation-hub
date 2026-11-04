// ─── Simulation Hub · core/types.ts — Contract v2 ───────────────────────────
// Framework-free. NOTHING in core/ may import DOM or a framework.
//
// v2 changes (see docs/ARCHITECTURE.md):
//  • two kinds: `realtime` (loop-driven) and `batch` (job-driven)
//  • ParamDef.live — hot param updates via applyParams, no re-init
//  • optional hooks: applyParams, onPointer, getStats
// Decisions kept from v1: Rng lives in state; realtime sims may mutate state.

import type { PointerEv } from './input';

export type Category = 'emergent' | 'systems' | 'finance' | 'physics' | 'algorithms';
export type SimKind = 'realtime' | 'batch';

export interface SimMeta {
  id: string;
  title: string;
  kind: SimKind;
  category: Category;
  description: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  thumbnail: string;
  accent: string;
}

type Live = { live?: boolean }; // true → applied via applyParams without re-init

export type ParamDef =
  | ({ kind: 'range'; label: string; min: number; max: number; step: number; unit?: string; hint?: string } & Live)
  | ({ kind: 'number'; label: string; min?: number; max?: number; step?: number; unit?: string; hint?: string } & Live)
  | ({ kind: 'boolean'; label: string; hint?: string } & Live)
  | ({ kind: 'select'; label: string; options: readonly string[]; hint?: string } & Live)
  | ({ kind: 'color'; label: string; hint?: string } & Live);

export type ParamSchema<P> = { [K in keyof P]: ParamDef };

export type ThemeName = 'light' | 'dark';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  theme: ThemeName;
}

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export interface SimAbout {
  summary: string;
  bullets: string[];
  invariant: string;
}

export interface RealtimeSimulation<P, S> {
  kind: 'realtime';
  meta: SimMeta;
  defaultParams: P;
  paramSchema: ParamSchema<P>;
  init(params: P, rng: Rng): S;
  step(state: S, dt: number): S;
  render(state: S, rc: RenderContext): void;
  applyParams?(state: S, params: P): S;
  onPointer?(state: S, ev: PointerEv): S;
  getStats?(state: S): Record<string, number | string>;
  about: SimAbout;
}

/** Phase-1 name, kept as the realtime alias. */
export type Simulation<P, S> = RealtimeSimulation<P, S>;

// ── batch side ───────────────────────────────────────────────────────────────
import type { JobDefinition } from './job';

export interface BatchViewContext {
  theme: ThemeName;
}

export interface ResultView<P, R> {
  update(result: R, params: P, meta: { ms: number }): void;
  setBusy(busy: boolean, progress?: number): void;
  dispose(): void;
}

export interface BatchSimulation<P, R> {
  kind: 'batch';
  meta: SimMeta;
  defaultParams: P;
  paramSchema: ParamSchema<P>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chunk/part types are sim-internal
  job: JobDefinition<P, any, any, R>;
  createWorker?: () => Worker;
  mountResult(host: HTMLElement, ctx: BatchViewContext): ResultView<P, R>;
  about: SimAbout;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySimulation = RealtimeSimulation<any, any> | BatchSimulation<any, any>;

export interface SimEntry {
  meta: SimMeta;
  load: () => Promise<{ default: AnySimulation }>;
}
