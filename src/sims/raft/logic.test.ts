import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { defaultParams, init, leaderOf, onPointer, step, type Params, type State } from './logic';

function run(params: Params, seed: number, ticks: number): State {
  const s = init(params, createRng(seed));
  for (let i = 0; i < ticks; i++) step(s, 1 / 60);
  return s;
}

const snapshot = (s: State) =>
  s.nodes.map((n) => [n.role, n.term, n.log.join(','), n.commitIndex, n.alive].join('|')).join(';');

describe('raft logic', () => {
  it('determinism: same params + seed → identical cluster after 800 ticks', () => {
    expect(snapshot(run(defaultParams, 42, 800))).toBe(snapshot(run(defaultParams, 42, 800)));
    expect(snapshot(run(defaultParams, 43, 800))).not.toBe(snapshot(run(defaultParams, 42, 800)));
  });

  it('election safety: never more than one leader per term; a leader emerges', () => {
    const s = init(defaultParams, createRng(7));
    const leaderByTerm = new Map<number, number>();
    let sawLeader = false;
    for (let t = 0; t < 1500; t++) {
      step(s, 1 / 60);
      for (const n of s.nodes) {
        if (n.alive && n.role === 'leader') {
          sawLeader = true;
          const prev = leaderByTerm.get(n.term);
          if (prev !== undefined) expect(prev).toBe(n.id);
          leaderByTerm.set(n.term, n.id);
        }
      }
    }
    expect(sawLeader).toBe(true);
  });

  it('replication + commit: after writes stop, all live nodes converge to the leader log', () => {
    const s = run(defaultParams, 11, 2200);
    const leader = leaderOf(s);
    expect(leader).toBeDefined();
    expect(leader!.commitIndex).toBeGreaterThan(5);
    s.params = { ...s.params, autoWrite: false };
    for (let i = 0; i < 400; i++) step(s, 1 / 60);
    const lead = leaderOf(s)!;
    for (const n of s.nodes) {
      if (!n.alive) continue;
      expect(n.log).toEqual(lead.log);
      expect(n.commitIndex).toBe(lead.commitIndex);
    }
  });

  it('crash the leader (pointer) → the cluster elects a successor with a higher term', () => {
    const s = run(defaultParams, 5, 900);
    const leader = leaderOf(s);
    expect(leader).toBeDefined();
    const oldTerm = leader!.term;
    onPointer(s, { type: 'down', x: leader!.x, y: leader!.y, button: 0, shift: false, alt: false, pressed: true });
    expect(leader!.alive).toBe(false);
    let successor: ReturnType<typeof leaderOf>;
    for (let i = 0; i < 1600 && !successor; i++) {
      step(s, 1 / 60);
      successor = leaderOf(s);
    }
    expect(successor).toBeDefined();
    expect(successor!.term).toBeGreaterThan(oldTerm);
  });

  it('message loss (30% drops) delays but does not break safety', () => {
    const s = init({ ...defaultParams, dropRate: 0.3 }, createRng(9));
    const leaderByTerm = new Map<number, number>();
    let ticksWithLeader = 0;
    for (let t = 0; t < 2500; t++) {
      step(s, 1 / 60);
      if (leaderOf(s)) ticksWithLeader++;
      for (const n of s.nodes) {
        if (n.alive && n.role === 'leader') {
          const prev = leaderByTerm.get(n.term);
          if (prev !== undefined) expect(prev).toBe(n.id);
          leaderByTerm.set(n.term, n.id);
        }
      }
    }
    // under 30% loss the cluster is leaderless during re-elections, but a
    // leader must hold power for a substantial share of the run
    expect(ticksWithLeader).toBeGreaterThan(400);
  });

  it('a revived node rejoins as follower and catches up', () => {
    const s = run(defaultParams, 13, 900);
    const leader = leaderOf(s)!;
    const victim = s.nodes.find((n) => n.id !== leader.id)!;
    onPointer(s, { type: 'down', x: victim.x, y: victim.y, button: 0, shift: false, alt: false, pressed: true });
    for (let i = 0; i < 600; i++) step(s, 1 / 60);
    onPointer(s, { type: 'down', x: victim.x, y: victim.y, button: 0, shift: false, alt: false, pressed: true });
    expect(victim.alive).toBe(true);
    s.params = { ...s.params, autoWrite: false };
    for (let i = 0; i < 400; i++) step(s, 1 / 60);
    const lead = leaderOf(s)!;
    expect(victim.log).toEqual(lead.log);
  });
});
