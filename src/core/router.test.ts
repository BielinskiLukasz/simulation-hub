import { describe, expect, it } from 'vitest';
import { parseHash } from './router';
import { decodeState, encodeState } from './url-state';
import type { ParamSchema } from './types';

describe('parseHash', () => {
  it('empty / root / garbage → home', () => {
    expect(parseHash('').name).toBe('home');
    expect(parseHash('#/').name).toBe('home');
    expect(parseHash('#/nonsense/path').name).toBe('home');
  });
  it('parses sim routes with query', () => {
    const r = parseHash('#/sim/boids?seed=42&n=500');
    expect(r.name).toBe('sim');
    if (r.name === 'sim') { expect(r.id).toBe('boids'); expect(r.query.get('seed')).toBe('42'); }
  });
});

interface P { count: number; speed: number; on: boolean; palette: string; color: string; workload: string }
const defaults: P = { count: 40, speed: 300, on: false, palette: 'rainbow', color: '#4f9dff', workload: '0:24:2;0:3:1' };
const schema: ParamSchema<P> = {
  count: { kind: 'range', label: 'Count', min: 1, max: 500, step: 1 },
  speed: { kind: 'number', label: 'Speed', min: 0, max: 1000 },
  on: { kind: 'boolean', label: 'On' },
  palette: { kind: 'select', label: 'Palette', options: ['mono', 'rainbow', 'speed'] },
  color: { kind: 'color', label: 'Colour' },
  workload: { kind: 'text', label: 'Workload', pattern: '^\\d+:\\d+:\\d+(;\\d+:\\d+:\\d+)*$' },
};

describe('url-state', () => {
  it('defaults produce a URL containing only seed', () => {
    const q = encodeState(defaults, defaults, 42);
    expect([...q.keys()]).toEqual(['seed']);
  });
  it('encode → decode round-trips', () => {
    const p: P = { count: 200, speed: 12, on: true, palette: 'speed', color: '#ff8800', workload: '0:24:2;0:3:1' };
    const back = decodeState(encodeState(p, defaults, 7), defaults, schema);
    expect(back.params).toEqual(p); expect(back.seed).toBe(7);
  });
  it('malformed input → clamped / defaulted, never NaN', () => {
    const d = decodeState(new URLSearchParams('count=abc&speed=999999&palette=nonsense&color=zz'), defaults, schema);
    expect(d.params.count).toBe(40);
    expect(d.params.speed).toBe(1000);
    expect(d.params.palette).toBe('rainbow');
    expect(d.params.color).toBe('#4f9dff');
  });
  it('text params round-trip and pattern violations fall back to the default (v3)', () => {
    const p: P = { ...defaults, workload: '1:5:2;3:9:1' };
    const q = encodeState(p, defaults, 5);
    expect(decodeState(q, defaults, schema).params.workload).toBe('1:5:2;3:9:1');
    const bad = decodeState(new URLSearchParams('workload=not-a-workload'), defaults, schema);
    expect(bad.params.workload).toBe(defaults.workload);
  });

  it('booleans serialise as 1/0 and colours without #', () => {
    const q = encodeState({ ...defaults, on: true, color: '#ff8800' }, defaults, 1);
    expect(q.get('on')).toBe('1'); expect(q.get('color')).toBe('ff8800');
  });
});
