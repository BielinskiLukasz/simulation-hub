// ─── Simulation Hub · core/url-state.ts ─────────────────────────────────────
// params + seed ⇄ URL query. Only values that DIFFER from defaults are written
// (short, readable, shareable URLs); seed is always written.
// Decode is defensive: clamp ranges, fall back to defaults on NaN / bad select
// / invalid colour. A pasted garbage URL must never crash a sim page.

import type { ParamDef, ParamSchema } from './types';
import { normaliseSeed } from './rng';

const HEX6 = /^[0-9a-fA-F]{6}$/;

function clamp(n: number, def: Extract<ParamDef, { kind: 'range' | 'number' }>): number {
  let v = n;
  if (def.min !== undefined) v = Math.max(def.min, v);
  if (def.max !== undefined) v = Math.min(def.max, v);
  return v;
}

/** params + defaults + seed → URLSearchParams (diff-only, seed always present). */
export function encodeState<P extends object>(
  params: P,
  defaults: P,
  seed: number,
): URLSearchParams {
  const q = new URLSearchParams();
  const p = params as Record<string, unknown>;
  const dfl = defaults as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const v = p[key];
    const d = dfl[key];
    if (v === d) continue;
    if (typeof v === 'boolean') q.set(key, v ? '1' : '0');
    else if (typeof v === 'string' && v.startsWith('#')) q.set(key, v.slice(1).toLowerCase());
    else if (v !== undefined && v !== null) q.set(key, String(v));
  }
  q.set('seed', String(seed >>> 0));
  return q;
}

export interface DecodedState<P> {
  params: P;
  seed: number;
}

/** URL query → params + seed, parsed & clamped by the schema. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- params are runtime-validated against the schema below
export function decodeState<P extends Record<string, any>>(
  query: URLSearchParams,
  defaults: P,
  schema: ParamSchema<P>,
): DecodedState<P> {
  const params: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const def = (schema as Record<string, ParamDef>)[key];
    const raw = query.get(key);
    if (!def || raw === null) continue;
    switch (def.kind) {
      case 'range':
      case 'number': {
        const n = Number(raw);
        if (Number.isFinite(n)) params[key] = clamp(n, def);
        break;
      }
      case 'boolean':
        if (raw === '1' || raw === 'true') params[key] = true;
        else if (raw === '0' || raw === 'false') params[key] = false;
        break;
      case 'select':
        if ((def.options as readonly string[]).includes(raw)) params[key] = raw;
        break;
      case 'color': {
        const hex = raw.replace(/^#/, '');
        if (HEX6.test(hex)) params[key] = `#${hex.toLowerCase()}`;
        break;
      }
      case 'text': {
        if (!def.pattern || new RegExp(def.pattern).test(raw)) params[key] = raw;
        break;
      }
    }
  }
  const seedRaw = query.get('seed');
  const seed = seedRaw === null ? normaliseSeed(undefined) : normaliseSeed(seedRaw);
  return { params: params as P, seed };
}
