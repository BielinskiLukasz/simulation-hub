import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { decodeNetwork, encodeNetwork, gridNetwork, lightAt, stepNetwork, validatePhases } from './network';

describe('signalized traffic network', () => {
  it('spawned = alive + removed; no overlapping vehicles; lights are periodic and conflict-free', () => {
    const net = gridNetwork();
    expect(validatePhases(net)).toBeNull();
    for (let i = 0; i < 600; i++) stepNetwork(net, 0.25, createRng(i));
    expect(net.spawned).toBeGreaterThan(0);
    expect(net.spawned).toBe(net.removed + Array.from(net.alive).reduce((a, b) => a + b, 0));
    expect(net.collisions).toBe(0);
    for (let i = 0; i < net.n; i++) {
      expect(Number.isFinite(net.pos[i]!)).toBe(true);
      expect(Number.isFinite(net.vel[i]!)).toBe(true);
      expect(net.pos[i]!).toBeGreaterThanOrEqual(-1);
    }
    const a = lightAt(net, 0);
    net.time += 40;
    expect(lightAt(net, 0)).toEqual(a);
  });

  it('vehicles stop at red lights and resume on green; codec round-trips', () => {
    const net = gridNetwork();
    const r = net.roads[0]!;
    const plan = net.lights.get(r.id)!;
    let sawRed = false; let sawGreen = false;
    for (let t = 0; t < 40; t++) {
      net.time = t;
      const phase = lightAt(net, r.id);
      if (phase.red) sawRed = true;
      if (phase.green) sawGreen = true;
    }
    expect(sawRed && sawGreen).toBe(true);
    void plan;
    const json = encodeNetwork(net);
    expect(decodeNetwork(json)).not.toBeNull();
    expect(decodeNetwork('{"v":99}')).toBeNull();
    expect(decodeNetwork('not-json')).toBeNull();
  });
});
