import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runInline } from '../core/job';
import { createRng } from '../core/rng';
import { decodeState, encodeState } from '../core/url-state';
import { filterEntries, findEntry } from '../core/registry';
import type { AnyBatch, AnyRealtime, AnySimulation, ParamDef } from '../core/types';
import { entries } from './index';

/** Deep scan: no NaN, no Infinity anywhere in a simulation state. */
function assertFiniteDeep(value: unknown, path: string, seen = new Set<unknown>()): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const view = value as unknown as ArrayLike<number>;
    for (let i = 0; i < view.length; i++) {
      if (typeof view[i] === 'number') expect(Number.isFinite(view[i]), `${path}[${i}]`).toBe(true);
    }
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'function') continue;
    assertFiniteDeep(v, `${path}.${k}`, seen);
  }
}

/** A legal, on-grid perturbation of one param, so encode→decode round-trips. */
function perturb(_key: string, def: ParamDef, current: unknown): unknown {
  switch (def.kind) {
    case 'boolean':
      return !current;
    case 'select':
      return def.options[def.options.length - 1]!;
    case 'color':
      return '#12ab34';
    case 'range': {
      const steps = Math.max(1, Math.round((def.max - def.min) / def.step / 3));
      return Number((def.min + steps * def.step).toFixed(6));
    }
    case 'number': {
      const base = typeof current === 'number' ? current : 0;
      const next = def.min !== undefined ? Math.max(def.min, base + 1) : base + 1;
      return def.max !== undefined ? Math.min(def.max, next) : next;
    }
  }
}

const loaded = new Map<string, AnySimulation>();

/**
 * `monte-carlo/index.ts` builds its worker with
 * `new URL('./worker.ts', import.meta.url)`. Vite's SSR transform — the one
 * vitest runs under — cannot rewrite that pattern ("Cannot split a chunk that
 * has already been edited"), so the module is assembled from its parts here
 * and its wiring is asserted from source below. The client build has no such
 * problem: `npm run build` emits `dist/worker-*.js`.
 */
async function assembleMonteCarlo(): Promise<AnySimulation> {
  const [{ meta }, { mcJob }, model, view] = await Promise.all([
    import('./monte-carlo/meta'),
    import('./monte-carlo/job'),
    import('./monte-carlo/model'),
    import('./monte-carlo/view'),
  ]);
  return {
    kind: 'batch',
    meta,
    defaultParams: model.defaultParams,
    paramSchema: model.paramSchema,
    job: mcJob,
    view: view.McView,
  } as unknown as AnySimulation;
}

beforeAll(async () => {
  for (const entry of entries) {
    loaded.set(entry.meta.id, entry.meta.id === 'monte-carlo' ? await assembleMonteCarlo() : (await entry.load()).default);
  }
});

describe('manifest integrity', () => {
  it('ships both kinds of simulation', () => {
    expect(entries.filter((e) => e.kind === 'realtime').length).toBeGreaterThanOrEqual(5);
    expect(entries.filter((e) => e.kind === 'batch').length).toBeGreaterThanOrEqual(2);
  });

  it('has unique, url-safe ids that resolve through the registry', () => {
    const ids = entries.map((e) => e.meta.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(findEntry(entries, id)?.meta.id).toBe(id);
      expect(filterEntries(entries, { query: id.split('-')[0]! }).length).toBeGreaterThan(0);
    }
  });

  it('statically imports metadata only — implementations stay behind import()', () => {
    // vitest runs from the project root; avoid import.meta here because the
    // manifest's dynamic imports are rewritten by Vite in the same graph
    const source = readFileSync(join(process.cwd(), 'src/sims/index.ts'), 'utf8');
    const staticImports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]!);
    expect(staticImports.length).toBeGreaterThan(0);
    for (const spec of staticImports) {
      expect(spec === '../core/types' || spec.endsWith('/meta'), `static import leaked: ${spec}`).toBe(true);
    }
    const loaders = [...source.matchAll(/load: \(\) => import\('([^']+)'\)/g)].map((m) => m[1]!);
    expect(loaders).toHaveLength(entries.length);
  });

  it('the worker-backed batch sim is wired to its job, view and worker', () => {
    const source = readFileSync(join(process.cwd(), 'src/sims/monte-carlo/index.ts'), 'utf8');
    expect(source).toContain("kind: 'batch'");
    expect(source).toContain('job: mcJob');
    expect(source).toContain('view: McView');
    expect(source).toContain("new URL('./worker.ts', import.meta.url)");
    expect(source).toContain("{ type: 'module' }");

    const workerSource = readFileSync(join(process.cwd(), 'src/sims/monte-carlo/worker.ts'), 'utf8');
    expect(workerSource).toContain('exposeWorker(mcJob.process, mcJob.transfer)');
  });

  it('every meta is complete enough to render a card and a docs tab', () => {
    for (const { meta } of entries) {
      expect(meta.title.length).toBeGreaterThan(2);
      expect(meta.description.length).toBeGreaterThan(60);
      expect(meta.tags.length).toBeGreaterThanOrEqual(3);
      expect(meta.thumbnail.length).toBeGreaterThan(0);
      expect(['easy', 'medium', 'hard']).toContain(meta.difficulty);
      expect(['emergent', 'systems', 'finance', 'physics', 'algorithms']).toContain(meta.category);
      expect(meta.howItWorks?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
});

for (const entry of entries) {
  describe(`contract · ${entry.meta.id}`, () => {
    const sim = () => loaded.get(entry.meta.id)!;

    it('declares the same kind in the manifest and in the module', () => {
      expect(sim().kind).toBe(entry.kind);
      expect(sim().meta.id).toBe(entry.meta.id);
      expect(sim().meta.title).toBe(entry.meta.title);
    });

    it('paramSchema covers defaultParams exactly', () => {
      const schema = sim().paramSchema as Record<string, ParamDef>;
      const defaults = sim().defaultParams as Record<string, unknown>;
      expect(Object.keys(schema).sort()).toEqual(Object.keys(defaults).sort());
      for (const [key, def] of Object.entries(schema)) {
        expect(def.label.length, `${key} has no label`).toBeGreaterThan(0);
        if (def.kind === 'range') {
          expect(def.max).toBeGreaterThan(def.min);
          expect(def.step).toBeGreaterThan(0);
          const v = defaults[key] as number;
          expect(v).toBeGreaterThanOrEqual(def.min);
          expect(v).toBeLessThanOrEqual(def.max);
        }
        if (def.kind === 'select') {
          expect(def.options.length).toBeGreaterThan(0);
          expect(def.options).toContain(defaults[key]);
        }
      }
    });

    it('only advertises live params when it can actually apply them', () => {
      if (entry.kind !== 'realtime') return;
      const schema = (sim() as AnyRealtime).paramSchema as Record<string, ParamDef>;
      const live = Object.entries(schema).filter(([, d]) => d.live === true).map(([k]) => k);
      if (live.length > 0) {
        expect(typeof (sim() as AnyRealtime).applyParams, `${entry.meta.id} has live params but no applyParams`).toBe(
          'function',
        );
      }
    });

    it('round-trips through the URL codec', () => {
      const schema = sim().paramSchema as Record<string, ParamDef>;
      const defaults = sim().defaultParams as Record<string, unknown>;

      // defaults write nothing but the seed
      const bare = encodeState(defaults as never, defaults as never, 4242);
      expect([...bare.keys()]).toEqual(['seed']);

      // every key individually perturbed, encoded, decoded back
      for (const key of Object.keys(schema)) {
        const params = { ...defaults, [key]: perturb(key, schema[key]!, defaults[key]) };
        const query = encodeState(params as never, defaults as never, 777);
        expect(query.get('seed')).toBe('777');
        const decoded = decodeState(query, defaults as never, schema as never);
        expect(decoded.params[key], `${entry.meta.id}.${key} did not round-trip`).toEqual(params[key]);
        expect(decoded.seed).toBe(777);
      }

      // hostile input falls back to defaults instead of crashing
      const junk = new URLSearchParams({ seed: 'nope', [Object.keys(schema)[0]!]: 'garbage' });
      const safe = decodeState(junk, defaults as never, schema as never);
      expect(safe.params).toEqual(defaults);
    });
  });
}

describe('realtime sims run', () => {
  it('init + 120 steps keeps every number finite', () => {
    for (const entry of entries.filter((e) => e.kind === 'realtime')) {
      const sim = loaded.get(entry.meta.id)! as AnyRealtime;
      expect(sim.world.w).toBeGreaterThan(0);
      expect(sim.world.h).toBeGreaterThan(0);
      const state = sim.init(sim.defaultParams as never, createRng(2026));
      for (let i = 0; i < 120; i++) sim.step(state, 1 / 60);
      assertFiniteDeep(state, entry.meta.id);
      expect(typeof sim.getStats === 'function' || typeof sim.metrics === 'function').toBe(true);
    }
  });
});

describe('batch sims run', () => {
  it('plan → process → reduce works inline and is order independent', () => {
    for (const entry of entries.filter((e) => e.kind === 'batch')) {
      const sim = loaded.get(entry.meta.id)! as AnyBatch;
      const params = sim.defaultParams;
      const chunks = sim.job.plan(params, 4242);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(typeof sim.view).toBe('function');

      const forward = runInline(sim.job, params, 4242);
      const shuffled = sim.job.reduce([...chunks].reverse().map((c) => sim.job.process(c)), params);
      expect(JSON.stringify(revive(shuffled))).toBe(JSON.stringify(revive(forward)));
      expect(sim.job.plan(params, 4242)).toHaveLength(chunks.length);
    }
  });

  it('a different seed changes the result of a stochastic job', () => {
    const mc = loaded.get('monte-carlo')! as AnyBatch;
    const a = revive(runInline(mc.job, mc.defaultParams, 1));
    const b = revive(runInline(mc.job, mc.defaultParams, 2));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('the deterministic job is untouched by the seed', () => {
    const tax = loaded.get('tax-wrappers')! as AnyBatch;
    const params = { ...tax.defaultParams, years: 4 };
    expect(JSON.stringify(revive(runInline(tax.job, params, 1)))).toBe(
      JSON.stringify(revive(runInline(tax.job, params, 999))),
    );
  });
});

/** Typed arrays do not survive JSON.stringify — flatten them for comparison. */
function revive(value: unknown): unknown {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>);
  }
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = revive(v);
    return out;
  }
  return value;
}
