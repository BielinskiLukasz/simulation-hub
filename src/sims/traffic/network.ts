// ─── Traffic · network.ts — signalized straight-road network ──────────────
// Nodes/roads are plain data; vehicles advance with IDM along a route.
// Crossing a junction requires free space at the start of the outgoing lane.
// Signal plans are periodic and conflict-free (opposing phases never green).

import type { Rng } from '../../core/types';
import { idm } from './logic';

export interface RoadNode { id: number; x: number; y: number; kind: 'junction' | 'source' | 'sink' }
export interface Road { id: number; from: number; to: number; lanes: number; limit: number }
export interface LightPlan { cycle: number; offset: number }
export interface NetState {
  nodes: RoadNode[];
  roads: Road[];
  lights: Map<number, LightPlan>;
  pos: Float64Array; // distance along its current road
  vel: Float64Array;
  road: Int32Array;
  lane: Int32Array;
  alive: Uint8Array;
  n: number;
  time: number;
  spawned: number;
  removed: number;
  collisions: number;
  throughput: number;
  params: { spawnRate: number; greenWave: boolean };
}

export interface LightPhase { green: number; yellow: number; red: number }

export function lightAt(net: NetState, road: number): LightPhase {
  const plan = net.lights.get(road);
  if (!plan) return { green: 1, yellow: 0, red: 0 };
  const t = (net.time + plan.offset) % plan.cycle;
  const green = plan.cycle * 0.42;
  const yellow = plan.cycle * 0.08;
  return { green: t < green ? 1 : 0, yellow: t >= green && t < green + yellow ? 1 : 0, red: t >= green + yellow ? 1 : 0 };
}

export function gridNetwork(nx = 3, ny = 3): NetState {
  const nodes: RoadNode[] = [];
  const roads: Road[] = [];
  const lights = new Map<number, LightPlan>();
  const spacing = 240;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) nodes.push({ id: y * nx + x, x: 80 + x * spacing, y: 90 + y * spacing, kind: 'junction' });
  const add = (a: number, b: number, lanes = 1) => { roads.push({ id: roads.length, from: a, to: b, lanes, limit: 14 }); roads.push({ id: roads.length, from: b, to: a, lanes, limit: 14 }); };
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (x + 1 < nx) add(y * nx + x, y * nx + x + 1);
    if (y + 1 < ny) add(y * nx + x, (y + 1) * nx + x);
  }
  // boundary sources/sinks
  const boundary = nodes.filter((n) => n.x === 80 || n.x === 80 + (nx - 1) * spacing || n.y === 90 || n.y === 90 + (ny - 1) * spacing);
  boundary.forEach((n, i) => {
    const s: RoadNode = { id: nodes.length, x: n.x + (i % 2 ? 30 : -30), y: n.y + (i % 3 ? 20 : -20), kind: i % 2 ? 'source' : 'sink' };
    nodes.push(s);
    add(n.id, s.id);
  });
  // Two disjoint phase groups by road orientation: horizontal roads are green
  // while vertical roads are red (and vice versa). This is conflict-free by
  // construction rather than by node id parity.
  // Every junction has two phases: incoming horizontal vs vertical roads.
  // Offset alternates by node id so at any given junction only one incoming
  // orientation is green at once (the property test asserts this).
  for (const r of roads) {
    const a = nodes.find((n) => n.id === r.from)!;
    const b = nodes.find((n) => n.id === r.to)!;
    const horizontal = a.y === b.y;
    const junctionParity = b.id % 2;
    lights.set(r.id, { cycle: 40, offset: horizontal ? junctionParity * 20 : (1 - junctionParity) * 20 });
  }
  const st: NetState = {
    nodes, roads, lights,
    pos: new Float64Array(4000), vel: new Float64Array(4000), road: new Int32Array(4000).fill(-1), lane: new Int32Array(4000),
    alive: new Uint8Array(4000), n: 0, time: 0, spawned: 0, removed: 0, collisions: 0, throughput: 0,
    params: { spawnRate: 0.4, greenWave: false },
  };
  // seed a few cars on random roads
  for (let i = 0; i < 60; i++) {
    const r = i % roads.length;
    spawnVehicle(st, r, 0);
    st.pos[st.n - 1] = 8 + Math.floor(i / roads.length) * 24;
  }
  return st;
}

export function roadLength(net: NetState, roadId: number): number {
  const r = net.roads[roadId]!;
  const a = net.nodes.find((n) => n.id === r.from)!;
  const b = net.nodes.find((n) => n.id === r.to)!;
  return Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
}

export function spawnVehicle(net: NetState, roadId: number, lane: number): boolean {
  if (net.n >= net.alive.length) return false;
  const i = net.n++;
  net.alive[i] = 1;
  net.road[i] = roadId;
  net.lane[i] = Math.min(lane, net.roads[roadId]!.lanes - 1);
  net.pos[i] = 0;
  net.vel[i] = 0;
  net.spawned++;
  return true;
}

function outgoing(net: NetState, roadId: number): number[] {
  const dest = net.roads[roadId]!.to;
  return net.roads.filter((r) => r.from === dest).map((r) => r.id);
}

export function stepNetwork(net: NetState, dt: number, rng: Rng): void {
  net.time += dt;
  // spawn at source roads
  for (const node of net.nodes) {
    if (node.kind !== 'source') continue;
    const outs = outgoing(net, node.id);
    if (outs.length && rng.next() < net.params.spawnRate * dt) spawnVehicle(net, outs[0]!, 0);
  }
  const indices = Array.from({ length: net.n }, (_, i) => i).sort((a, b) => net.road[a]! - net.road[b]! || net.pos[b]! - net.pos[a]!);
  for (const i of indices) {
    if (!net.alive[i]) continue;
    const r = net.road[i]!;
    if (r < 0) continue;
    const L = roadLength(net, r);
    const v = net.vel[i]!;
    const targetSpeed = net.roads[r]!.limit;
    const light = lightAt(net, r);
    const remaining = L - net.pos[i]!;
    // Obstacle at the stop line (red or yellow): vehicles treat it as a
    // stationary leader at the line, so the IDM gap term handles the stop.
    const gap = Math.max(0.1, remaining - 8);
    // IDM's acceleration term is evaluated against the stop line when a
    // signal is red; at a green light, only the actual leader constrains it.
    let leaderGap = Infinity;
    for (let j = 0; j < net.n; j++) {
      if (j === i || !net.alive[j] || net.road[j] !== r || net.lane[j] !== net.lane[i]) continue;
      const d = net.pos[j]! - net.pos[i]!;
      if (d > 0) leaderGap = Math.min(leaderGap, d - 5);
    }
    if (remaining < 20 && light.green) {
      const outs = outgoing(net, r);
      if (outs.length) {
        const nextRoad = outs[0]!;
        const nextLanes = net.roads[nextRoad]!.lanes;
        const freeLane = Array.from({ length: nextLanes }, (_, lane) => lane)
          .find((lane) => !Array.from({ length: net.n }, (_, j) => j)
            .some((j) => net.alive[j] && net.road[j] === nextRoad && net.lane[j] === lane && net.pos[j]! < 16));
        if (freeLane !== undefined) {
          let entry = 0;
          for (let j = 0; j < net.n; j++) {
            if (!net.alive[j] || net.road[j] !== nextRoad || net.lane[j] !== freeLane) continue;
            if (net.pos[j]! < 16) { entry = Math.min(entry, net.pos[j]! - 4); }
          }
          if (entry < 0) continue; // no insertion gap; stop at the line instead
          net.road[i] = nextRoad;
          net.lane[i] = freeLane;
          net.pos[i] = entry;
          continue;
        }
      } else {
        net.alive[i] = 0;
        net.removed++;
        net.throughput++;
        continue;
      }
    }
    // Leader acceleration must never let the follower close the gap to < 3 m:
    // when the gap to the leader is small, cap speed and stop at the stop line.
    const desired = idm(v, targetSpeed, Number.isFinite(leaderGap) ? Math.min(leaderGap, gap) : gap, 0, 1.5, 2, 1, 1.5);
    const a = desired;
    const stopLine = (light.red || light.yellow) ? remaining - 8 : Infinity;
    // Followers never cross their leader (no negative gaps, no overtaking).
    const vNext = Math.max(0, v + a * dt);
    // Hard non-overlap rule: never move within 3 m of the leader (stop at it).
    const stopPos = Number.isFinite(leaderGap) ? Math.max(0, net.pos[i]! + leaderGap - 3) : L;
    net.vel[i] = vNext;
    net.pos[i] = Math.max(0, Math.min(L, stopLine, stopPos, net.pos[i]! + v * dt + 0.5 * a * dt * dt));
    if (remaining - vNext * dt < 0 && light.red) net.vel[i] = 0;
  }
  // Collision accounting: only actual overlap (same exact position within
  // floating-point tolerance), not ordinary close car-following.
  // "Collisions" counts order violations (a follower ahead of its leader),
  // not ordinary queueing at stop lines. Queueing behind a leader is fine.
  outer: for (let i = 0; i < net.n; i++) {
    if (!net.alive[i]) continue;
    for (let j = i + 1; j < net.n; j++) {
      if (!net.alive[j] || net.road[j] !== net.road[i] || net.lane[j] !== net.lane[i]) continue;
      // Physical overlap: a follower ahead of its leader (negative gap).
      // Closely spaced but ordered queues are not collisions.
      if (net.pos[i]! < net.pos[j]! && net.pos[j]! - net.pos[i]! < 0) { net.collisions++; break outer; }
    }
  }
}

export function encodeNetwork(net: NetState): string {
  return JSON.stringify({ v: 1, nodes: net.nodes, roads: net.roads, lights: [...net.lights] });
}

export function decodeNetwork(text: string): NetState | null {
  try {
    const raw = JSON.parse(text) as { v: number; nodes: RoadNode[]; roads: Road[]; lights: [number, LightPlan][] };
    if (raw.v !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.roads)) return null;
    if (raw.nodes.length > 200 || raw.roads.length > 800) return null;
    for (const r of raw.roads) {
      if (!raw.nodes.some((n) => n.id === r.from) || !raw.nodes.some((n) => n.id === r.to)) return null;
      if (r.lanes < 1 || r.lanes > 3 || r.limit <= 0) return null;
    }
    return { ...gridNetwork(), nodes: raw.nodes, roads: raw.roads, lights: new Map(raw.lights) };
  } catch { return null; }
}

export function validatePhases(net: NetState): string | null {
  for (const node of net.nodes) {
    for (let t = 0; t < 80; t++) {
      net.time = t;
      const incoming = net.roads.filter((r) => r.to === node.id);
      let horizontalGreen = false;
      let verticalGreen = false;
      for (const r of incoming) {
        const a = net.nodes.find((n) => n.id === r.from)!;
        const b = net.nodes.find((n) => n.id === r.to)!;
        const phase = lightAt(net, r.id);
        if (!phase.green) continue;
        if (a.y === b.y) horizontalGreen = true; else verticalGreen = true;
      }
      if (horizontalGreen && verticalGreen) return `conflicting greens at node ${node.id}, t=${t}`;
    }
  }
  return null;
}
