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
export type SimKind = 'realtime' | 'batch' | 'event' | 'trace';

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

type Live = { live?: boolean; group?: string }; // live → applyParams without re-init; group → collapsible section

export type ParamDef =
  | ({ kind: 'range'; label: string; min: number; max: number; step: number; unit?: string; hint?: string } & Live)
  | ({ kind: 'number'; label: string; min?: number; max?: number; step?: number; unit?: string; hint?: string } & Live)
  | ({ kind: 'boolean'; label: string; hint?: string } & Live)
  | ({ kind: 'select'; label: string; options: readonly string[]; hint?: string } & Live)
  | ({ kind: 'color'; label: string; hint?: string } & Live)
  | ({ kind: 'text'; label: string; pattern?: string; editor?: string; placeholder?: string; hint?: string } & Live);

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
  /** Capture the internal stream state (mulberry32: one uint32) for snapshots. */
  state(): number;
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
  /** Contract v4: live grid editing (Falling sand). Edits apply on step boundaries. */
  editor?: GridEditorSpec<S>;
  onEdit?(state: S, edit: GridEdit): S;
  about: SimAbout;
  concepts?: string;
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

// ── Contract v3: event-driven simulations ────────────────────────────────────

export interface LogEntry {
  i: number; // event position (head after this entry)
  t: number; // simulation time (integer units)
  cat: string;
  actor: number | null;
  text: string;
  data?: unknown;
}

export interface InitCtx<E> {
  readonly rng: Rng;
  schedule(delay: number, payload: E): number;
}

export interface EventCtx<S, E> extends InitCtx<E> {
  readonly state: S;
  readonly now: number;
  cancel(eventId: number): void;
  log(entry: Omit<LogEntry, 'i' | 't'>): void;
}

export interface Invariant<S> {
  id: string;
  label: string;
  check(state: S): string | null; // null = holds
}

export interface TimelineData {
  lanes: { id: string; label: string }[];
  segments: { lane: string; start: number; end: number | null; label?: string; cls: string }[];
  markers: { lane?: string; t: number; label: string; cls: string }[];
}

export interface EventSimulation<P, S, E, A> {
  kind: 'event';
  meta: SimMeta;
  defaultParams: P;
  paramSchema: ParamSchema<P>;
  playback: { unit: string; baseRate: number }; // sim units per real second at 1×
  init(params: P, ctx: InitCtx<E>): S;
  handle(ctx: EventCtx<S, E>, ev: E): void;
  applyAction?(ctx: EventCtx<S, E>, action: A): void;
  render(state: S, rc: RenderContext, view: { now: number; head: number }): void;
  describeAction?(action: A): string;
  deriveTimeline?(log: readonly LogEntry[], now: number, params: P): TimelineData;
  invariants?: Invariant<S>[];
  defaultHiddenCategories?: string[];
  getStats?(state: S): Record<string, number | string>;
  isFinished?(state: S): boolean;
  about: SimAbout;
  concepts?: string; // markdown-lite, rendered in the Concepts tab
  /** Shell hooks (optional): canvas clicks and action buttons. */
  onCanvasAction?(state: S, x: number, y: number, ev: { shift: boolean; alt: boolean; button: number }): A | null;
  getActions?(state: S): { label: string; action: A }[];
  mountExtraTab?(host: HTMLElement, ctx: { params: P; seed: number; theme: ThemeName }): { dispose(): void };
  extraTabLabel?: string;
}

// ── Contract v4: editable grids & precomputed traces ────────────────────────

export interface GridTarget {
  w: number;
  h: number;
  cells: Uint8Array;
}

export interface PaletteEntry {
  value: number;
  label: string;
  color: number; // 0xRRGGBB
  hint?: string;
}

export type GridEdit =
  | { op: 'stamp'; x: number; y: number; value: number; size: number; shape: 'circle' | 'square'; onlyEmpty?: boolean }
  | { op: 'line'; x0: number; y0: number; x1: number; y1: number; value: number; size: number; onlyEmpty?: boolean }
  | { op: 'rect'; x0: number; y0: number; x1: number; y1: number; value: number; filled: boolean }
  | { op: 'fill'; x: number; y: number; value: number }
  | { op: 'replace'; w: number; h: number; cells: Uint8Array };

export interface GridPatch {
  index: Int32Array;
  before: Uint8Array;
  after: Uint8Array;
}

export interface MarkerSpec {
  id: string;
  label: string;
  color: number;
}

export interface GridEditorSpec<T> {
  palette: PaletteEntry[];
  /** Painting only writes into empty cells (Falling sand); eraser overwrites. */
  paintOnlyEmpty?: boolean;
  tools: ('brush' | 'line' | 'rect' | 'fill' | 'eraser')[];
  eraseValue: number;
  target(t: T): GridTarget;
  markers?: MarkerSpec[];
  undo: boolean;
}

export interface TraceResult<R> {
  length: number;
  summary: Record<string, number | string | boolean>;
  work?: { label: string; cumulative: ArrayLike<number> };
  data: R;
}

export interface InputGenerator<I> {
  id: string;
  label: string;
  paramSchema: ParamSchema<Record<string, number | string | boolean>>;
  defaults: Record<string, number | string | boolean>;
  generate(current: I, params: Record<string, number | string | boolean>, rng: Rng): I;
}

export interface InputSpec<I> {
  initial(seed: number): I;
  codec: { encode(i: I): string; decode(s: string): I | null };
  generators?: InputGenerator<I>[];
  editor?: GridEditorSpec<I>;
}

export interface CompareMode<P> {
  id: string;
  label: string;
  paneKeys: (keyof P)[];
  bDefaults: Partial<P>;
  note?: string;
}

export interface CompareSpec<P> {
  modes: CompareMode<P>[];
  enforce?(a: P, b: P): { a: P; b: P; warnings: string[] };
}

export interface TraceViewContext {
  theme: ThemeName;
  seed: number;
  compare: boolean;
  /** Called when the view's editor mutated the input: shell re-runs + syncs URL. */
  onInputChange?: (input: unknown) => void;
}

export interface TraceView<I, R> {
  setInput(input: I): void;
  setResult(result: TraceResult<R>, params: unknown, pane: 'a' | 'b'): void;
  render(position: number): void;
  dispose(): void;
}

export interface TraceSimulation<P, I, R> {
  kind: 'trace';
  meta: SimMeta;
  defaultParams: P;
  paramSchema: ParamSchema<P>;
  input: InputSpec<I>;
  run(input: I, params: P): TraceResult<R> | Promise<TraceResult<R>>;
  mountView(host: HTMLElement, ctx: TraceViewContext): TraceView<I, R>;
  describeStep?(data: R, i: number): { cat: string; actor: number | null; text: string };
  series?(data: R): { name: string; ys: ArrayLike<number> }[];
  compare?: CompareSpec<P>;
  about: SimAbout;
  concepts?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- type-erased registry union */
export type AnySimulation =
  | RealtimeSimulation<any, any>
  | BatchSimulation<any, any>
  | EventSimulation<any, any, any, any>
  | TraceSimulation<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SimEntry {
  meta: SimMeta;
  load: () => Promise<{ default: AnySimulation }>;
}
