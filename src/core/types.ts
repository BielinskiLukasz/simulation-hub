// ─── Simulation Hub · core/types.ts ─────────────────────────────────────────
// Framework-free contract. NOTHING in core/ may import DOM, React, or sim code.
// Every simulation is a pure plugin satisfying Simulation<P, S>.

export type Category = 'emergent' | 'systems' | 'finance' | 'physics' | 'algorithms';

export interface SimMeta {
  id: string; // url-safe slug: 'bouncing-balls'
  title: string;
  category: Category;
  description: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  thumbnail: string; // emoji-free in this build: an SVG/palette key
  accent: string; // hex accent used by cards + sim chrome
}

export type ParamDef =
  | { kind: 'range'; label: string; min: number; max: number; step: number; unit?: string; hint?: string }
  | { kind: 'number'; label: string; min?: number; max?: number; step?: number; unit?: string; hint?: string }
  | { kind: 'boolean'; label: string; hint?: string }
  | { kind: 'select'; label: string; options: readonly string[]; hint?: string }
  | { kind: 'color'; label: string; hint?: string };

export type ParamSchema<P> = { [K in keyof P]: ParamDef };

export type ThemeName = 'light' | 'dark';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number; // logical world width  (800)
  height: number; // logical world height (600)
  theme: ThemeName;
}

export interface Rng {
  next(): number; // [0, 1)
  range(min: number, max: number): number; // [min, max)
  int(min: number, max: number): number; // [min, max] inclusive
  pick<T>(items: readonly T[]): T;
}

export interface Simulation<P, S> {
  meta: SimMeta;
  defaultParams: P;
  paramSchema: ParamSchema<P>;
  /** The Rng instance is stored inside S by init(), so step() stays deterministic. */
  init(params: P, rng: Rng): S;
  /** Pure logic. No DOM, no Math.random(), no Date.now(). Mutates & returns S (see ARCHITECTURE.md). */
  step(state: S, dt: number): S;
  render(state: S, rc: RenderContext): void;
  /** Long-form explanation rendered in the "How it works" tab. */
  about: {
    summary: string;
    bullets: string[];
    invariant: string;
  };
}

export interface SimEntry {
  meta: SimMeta;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry is intentionally type-erased; each sim page casts back via its own schema
  load: () => Promise<{ default: Simulation<any, any> }>;
}
