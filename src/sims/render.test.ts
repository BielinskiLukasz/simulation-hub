import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { AnyRealtime, ParamDef, RenderContext } from '../core/types';
import { entries } from './index';

const METHODS = [
  'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo',
  'arc', 'ellipse', 'arcTo', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke',
  'rect', 'setTransform', 'transform', 'setLineDash', 'fillText', 'strokeText',
  'save', 'restore', 'translate', 'scale', 'rotate', 'clip', 'drawImage',
] as const;

interface Call {
  m: string;
  args: unknown[];
}

/** A recording 2D context: proves rendering issues finite geometry, in node. */
function fakeContext(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const target: Record<string, unknown> = {
    canvas: { width: 800, height: 600 },
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineJoin: 'miter',
    lineCap: 'butt',
  };
  for (const m of METHODS) {
    target[m] = (...args: unknown[]) => {
      calls.push({ m, args });
    };
  }
  target.measureText = (text: string) => ({ width: text.length * 6 });
  return { ctx: target as unknown as CanvasRenderingContext2D, calls };
}

class FakePath2D {
  ops: string[] = [];
  rect(..._a: number[]): void {
    this.ops.push('rect');
  }
  moveTo(..._a: number[]): void {
    this.ops.push('moveTo');
  }
  lineTo(..._a: number[]): void {
    this.ops.push('lineTo');
  }
  arc(..._a: number[]): void {
    this.ops.push('arc');
  }
  closePath(): void {
    this.ops.push('closePath');
  }
  beginPath(): void {
    this.ops.push('beginPath');
  }
}

/** Every numeric argument handed to the canvas must be finite. */
function assertFiniteGeometry(calls: Call[], where: string): void {
  for (const call of calls) {
    call.args.forEach((arg, i) => {
      if (typeof arg === 'number') {
        expect(Number.isFinite(arg), `${where}: ${call.m}() arg ${i} = ${arg}`).toBe(true);
      }
    });
  }
}

/**
 * Population/size params are capped: this suite exercises render branches, not
 * throughput (that is what logic.bench.ts is for). Without the cap a single
 * `count: max` variant would step 10,000 boids.
 */
const HEAVY = /(count|boids|arms|predators|balls|agents)/i;
const CELLISH = /^cell$/i;
const STEPS = 12;

function safeBaseline(defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'number') continue;
    if (HEAVY.test(key)) out[key] = Math.min(value, 80);
    if (CELLISH.test(key)) out[key] = Math.max(value, 10);
  }
  return out;
}

function extreme(key: string, def: ParamDef, which: 'max' | 'min'): number {
  if (def.kind !== 'range') return which === 'max' ? 1 : 0;
  if (which === 'max') return HEAVY.test(key) ? Math.min(def.max, 240) : def.max;
  return CELLISH.test(key) ? Math.max(def.min, 8) : def.min;
}

/** Perturb one param at a time so each render branch gets exercised. */
function variants(schema: Record<string, ParamDef>, raw: Record<string, unknown>): Record<string, unknown>[] {
  const defaults = safeBaseline(raw);
  const out: Record<string, unknown>[] = [{ ...defaults }];
  for (const [key, def] of Object.entries(schema)) {
    if (def.kind === 'boolean') out.push({ ...defaults, [key]: !defaults[key] });
    else if (def.kind === 'select') {
      for (const opt of def.options) out.push({ ...defaults, [key]: opt });
    } else if (def.kind === 'range') {
      out.push({ ...defaults, [key]: extreme(key, def, 'max') });
      out.push({ ...defaults, [key]: extreme(key, def, 'min') });
    } else if (def.kind === 'color') out.push({ ...defaults, [key]: '#ff00aa' });
  }
  return out;
}

const realtime = entries.filter((e) => e.kind === 'realtime');
const loaded: { id: string; sim: AnyRealtime }[] = [];

beforeAll(async () => {
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
    (globalThis as { Path2D?: unknown }).Path2D = FakePath2D;
  }
  for (const entry of realtime) {
    const mod = await entry.load();
    loaded.push({ id: entry.meta.id, sim: mod.default as AnyRealtime });
  }
});

describe('render() across every realtime simulation', () => {
  it('the manifest exposes at least one realtime sim', () => {
    expect(realtime.length).toBeGreaterThanOrEqual(5);
  });

  it('produces finite geometry for both themes and every param variant', { timeout: 90_000 }, () => {
    expect(loaded.length).toBe(realtime.length);
    for (const { id, sim } of loaded) {
      const schema = sim.paramSchema as Record<string, ParamDef>;
      const defaults = sim.defaultParams as Record<string, unknown>;

      for (const params of variants(schema, defaults)) {
        for (const theme of ['light', 'dark'] as const) {
          const { ctx, calls } = fakeContext();
          const rc: RenderContext = { ctx, width: sim.world.w, height: sim.world.h, theme };
          const state = sim.init(params as never, createRng(1234));
          for (let i = 0; i < STEPS; i++) sim.step(state, 1 / 60);

          expect(() => sim.render(state, rc), `${id} render threw`).not.toThrow();
          assertFiniteGeometry(calls, `${id}/${theme}/${JSON.stringify(params).slice(0, 60)}`);

          const painted = calls.filter((c) => c.m === 'fill' || c.m === 'stroke' || c.m === 'fillRect');
          expect(painted.length, `${id}/${theme} painted nothing`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('renders a cleared frame even for a degenerate empty-ish state', () => {
    for (const { id, sim } of loaded) {
      const { ctx, calls } = fakeContext();
      const state = sim.init(sim.defaultParams as never, createRng(1));
      sim.render(state, { ctx, width: sim.world.w, height: sim.world.h, theme: 'dark' });
      expect(calls.some((c) => c.m === 'clearRect' || c.m === 'fillRect'), `${id} never clears`).toBe(true);
    }
  });
});
