import { describe, expect, it } from 'vitest';
import { buildHash, buildHomeHash, parseHash } from './router';
import { decodeState, encodeState } from './url-state';
import { DEFAULT_SEED } from './rng';
import type { ParamSchema } from './types';

describe('parseHash', () => {
  it('treats empty / root / garbage input as home', () => {
    expect(parseHash('').name).toBe('home');
    expect(parseHash('#/').name).toBe('home');
    expect(parseHash('#').name).toBe('home');
    expect(parseHash('#/sim/').name).toBe('home');
    expect(parseHash('#/nonsense/here').name).toBe('home');
    expect(parseHash('gibberish').name).toBe('home');
  });

  it('parses a bare sim route', () => {
    const route = parseHash('#/sim/boids');
    expect(route).toMatchObject({ name: 'sim', id: 'boids' });
  });

  it('parses a sim route with query params', () => {
    const route = parseHash('#/sim/boids?seed=42&count=500');
    expect(route.name).toBe('sim');
    if (route.name !== 'sim') return;
    expect(route.id).toBe('boids');
    expect(route.query.get('seed')).toBe('42');
    expect(route.query.get('count')).toBe('500');
  });

  it('keeps hub filters on the home route', () => {
    const route = parseHash('#/?cat=physics&q=ball');
    expect(route.name).toBe('home');
    expect(route.query.get('cat')).toBe('physics');
  });

  it('round-trips through buildHash', () => {
    const query = new URLSearchParams({ seed: '7', count: '200' });
    expect(parseHash(buildHash('bouncing-balls', query))).toMatchObject({
      name: 'sim',
      id: 'bouncing-balls',
    });
    expect(buildHash('x', new URLSearchParams())).toBe('#/sim/x');
    expect(buildHomeHash(new URLSearchParams())).toBe('#/');
  });
});

/* ------------------------------------------------------------------ */

interface Params {
  count: number;
  gravity: number;
  restitution: number;
  radius: number;
  maxSpeed: number;
  collisions: boolean;
  palette: string;
  color: string;
}

const defaults: Params = {
  count: 40,
  gravity: 900,
  restitution: 0.85,
  radius: 10,
  maxSpeed: 300,
  collisions: false,
  palette: 'rainbow',
  color: '#4f9dff',
};

const schema: ParamSchema<Params> = {
  count: { kind: 'range', label: 'Count', min: 1, max: 500, step: 1 },
  gravity: { kind: 'range', label: 'Gravity', min: 0, max: 2000, step: 10 },
  restitution: { kind: 'range', label: 'Restitution', min: 0, max: 1, step: 0.01 },
  radius: { kind: 'range', label: 'Radius', min: 3, max: 30, step: 1 },
  maxSpeed: { kind: 'number', label: 'Max speed', min: 0, max: 1000 },
  collisions: { kind: 'boolean', label: 'Collisions' },
  palette: { kind: 'select', label: 'Palette', options: ['mono', 'rainbow', 'speed'] },
  color: { kind: 'color', label: 'Color' },
};

describe('encodeState / decodeState', () => {
  it('defaults produce a URL containing only the seed', () => {
    const query = encodeState(defaults, defaults, 7);
    expect([...query.keys()]).toEqual(['seed']);
    expect(query.get('seed')).toBe('7');
  });

  it('round-trips every param kind exactly', () => {
    const params: Params = {
      count: 250,
      gravity: 1450,
      restitution: 0.42,
      radius: 17,
      maxSpeed: 640,
      collisions: true,
      palette: 'speed',
      color: '#ff8800',
    };
    const query = encodeState(params, defaults, 4242);
    const decoded = decodeState(query, defaults, schema);
    expect(decoded.params).toEqual(params);
    expect(decoded.seed).toBe(4242);
  });

  it('serializes booleans as 1/0 and colors as bare hex', () => {
    const query = encodeState({ ...defaults, collisions: true, color: '#abc123' }, defaults, 1);
    expect(query.get('collisions')).toBe('1');
    expect(query.get('color')).toBe('abc123');
    expect(query.toString()).not.toContain('%23');
  });

  it('clamps out-of-range numbers', () => {
    const query = new URLSearchParams({ seed: '1', count: '9999999', gravity: '-50' });
    const { params } = decodeState(query, defaults, schema);
    expect(params.count).toBe(500);
    expect(params.gravity).toBe(0);
  });

  it('snaps to the schema step', () => {
    const query = new URLSearchParams({ seed: '1', restitution: '0.4173' });
    expect(decodeState(query, defaults, schema).params.restitution).toBe(0.42);
  });

  it('falls back to defaults on malformed input', () => {
    const query = new URLSearchParams({
      seed: 'abc',
      count: 'abc',
      collisions: 'maybe',
      palette: 'nonsense',
      color: 'not-a-color',
      radius: '',
    });
    const { params, seed } = decodeState(query, defaults, schema);
    expect(params).toEqual(defaults);
    expect(seed).toBe(DEFAULT_SEED);
  });

  it('ignores unknown keys and never crashes on a hostile query', () => {
    const query = new URLSearchParams({ seed: '7', __proto__: 'x', count: '1e999', gravity: '0x10' });
    const { params } = decodeState(query, defaults, schema);
    // `1e999` parses to Infinity -> fall back to the default rather than clamping to max
    expect(params.count).toBe(defaults.count);
    expect(params.gravity).toBe(0);
  });

  it('accepts colors written with a leading hash', () => {
    const query = new URLSearchParams({ seed: '1', color: '#FF8800' });
    expect(decodeState(query, defaults, schema).params.color).toBe('#ff8800');
  });
});
