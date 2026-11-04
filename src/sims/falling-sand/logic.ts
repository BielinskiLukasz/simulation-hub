// ─── Falling sand · logic.ts — cellular automaton hot loop (pure) ──────────
// Bottom→top scan, alternating row direction, per-tick stamp prevents double
// moves. Materials/reactions are data tables. 400×300 default world.

import type { ParamSchema, Rng } from '../../core/types';
import type { GridEdit } from '../../core/types';
import { byId, MATERIALS, M } from './materials';
import { reactionFor, REACTIONS } from './reactions';
import { buildScene } from './scenes';
import { applyEdit } from '../../core/grid/ops';

export interface Params {
  scene: string;
  waterSpread: number;
  plantGrowth: number;
  fireLife: number;
  lavaViscosity: number;
  edges: string;
}

export const defaultParams: Params = {
  scene: 'hourglass',
  waterSpread: 4,
  plantGrowth: 20,
  fireLife: 55,
  lavaViscosity: 80,
  edges: 'solid',
};

export const paramSchema: ParamSchema<Params> = {
  scene: { kind: 'select', label: 'Scene', options: ['hourglass', 'forest', 'lava-lake', 'rain', 'empty'], hint: 'Re-inits the world' },
  waterSpread: { kind: 'range', label: 'Water spread', min: 1, max: 8, step: 1, live: true },
  plantGrowth: { kind: 'range', label: 'Plant growth', min: 0, max: 100, step: 1, unit: '%', live: true },
  fireLife: { kind: 'range', label: 'Fire life', min: 10, max: 120, step: 1, live: true },
  lavaViscosity: { kind: 'range', label: 'Lava viscosity', min: 0, max: 95, step: 1, unit: '%', live: true },
  edges: { kind: 'select', label: 'Edges', options: ['solid', 'open'], live: true },
};

export const WORLD = { w: 400, h: 300 } as const;

export interface State {
  w: number;
  h: number;
  cells: Uint8Array;
  life: Uint8Array;
  stamp: Uint8Array;
  tick: number;
  scanDir: number;
  rng: Rng;
  params: Params;
  moved: number;
}

function makeState(w: number, h: number, cells: Uint8Array, params: Params, rng: Rng): State {
  return {
    w, h, cells,
    life: new Uint8Array(w * h),
    stamp: new Uint8Array(w * h),
    tick: 0, scanDir: 1, rng, params: { ...params }, moved: 0,
  };
}

export function init(params: Params, rng: Rng): State {
  const g = buildScene(params.scene, WORLD.w, WORLD.h);
  const state = makeState(g.w, g.h, g.cells, params, rng);
  if (params.edges === 'solid') {
    for (let x = 0; x < state.w; x++) { state.cells[x] = M.Stone; state.cells[(state.h - 1) * state.w + x] = M.Stone; }
    for (let y = 0; y < state.h; y++) { state.cells[y * state.w] = M.Stone; state.cells[y * state.w + state.w - 1] = M.Stone; }
  }
  if (params.scene === 'empty') {
    for (let x = 0; x < state.w; x++) state.cells[(state.h - 1) * state.w + x] = M.Stone;
  }
  return state;
}

/** Test helper: a custom-sized world from explicit cells. */
export function createSandState(w: number, h: number, cells: Uint8Array, params: Partial<Params> = {}, rng: Rng): State {
  const p: Params = { ...defaultParams, ...params };
  const state = makeState(w, h, cells.slice(), p, rng);
  if (p.edges === 'solid') {
    for (let x = 0; x < w; x++) { state.cells[x] = M.Stone; state.cells[(h - 1) * w + x] = M.Stone; }
    for (let y = 0; y < h; y++) { state.cells[y * w] = M.Stone; state.cells[y * w + w - 1] = M.Stone; }
  }
  return state;
}

export function applyParamsForSand(state: State, params: Params): State {
  state.params = { ...params };
  return state;
}

export function onEditSand(state: State, edit: GridEdit): State {
  const target = { w: state.w, h: state.h, cells: state.cells };
  applyEdit(target, edit);
  if (target.w !== state.w || target.h !== state.h) {
    // The sand world is fixed-size; ignore resizes from imports.
    state.w = target.w; state.h = target.h; state.cells = target.cells;
    state.life = new Uint8Array(state.w * state.h);
    state.stamp = new Uint8Array(state.w * state.h);
  } else {
    state.cells = target.cells;
  }
  return state;
}

export function step(state: State): State {
  const { w, h, cells, life, stamp } = state;
  const tick = (state.tick % 255) + 1; // 1..255; 0 would collide with the initial stamp
  state.tick = tick;
  state.scanDir = -state.scanDir;
  state.moved = 0;
  const params = state.params;
  const open = params.edges === 'open';
  const rng = state.rng;

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : cells[y * w + x]!);
  const set = (x: number, y: number, v: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    cells[y * w + x] = v;
    life[y * w + x] = v === M.Fire ? params.fireLife : v === M.Smoke || v === M.Steam ? 90 : 0;
    stamp[y * w + x] = tick;
  };
  const swap = (i: number, j: number) => {
    const a = cells[i]!; const b = cells[j]!;
    cells[i] = b; cells[j] = a;
    const la = life[i]!; life[i] = life[j]!; life[j] = la;
    stamp[i] = tick; stamp[j] = tick;
    state.moved++;
  };
  const canDisplace = (target: number, self: number): boolean => {
    if (target === M.Air) return true;
    const t = byId(target); const s = byId(self);
    if (t.kind === 'liquid' && (s.kind === 'powder' || s.density > t.density)) return true;
    if (t.kind === 'gas' && s.kind !== 'gas') return true;
    return false;
  };

  for (let y = h - 1; y >= 0; y--) {
    for (let k = 0; k < w; k++) {
      const x = state.scanDir > 0 ? k : w - 1 - k;
      const i = y * w + x;
      if (stamp[i] === tick) continue;
      const v = cells[i]!;
      if (v === M.Air) continue;
      const mat = byId(v);
      stamp[i] = tick;

      // reactions against four neighbours (data table lookup)
      let reacted = false;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const o = ny * w + nx;
        const ov = cells[o]!;
        if (ov === M.Air) continue;
        const r = reactionFor(v, ov);
        if (!r) continue;
        if (rng.int(0, 255) >= r.prob) continue;
        const selfIsA = v === r.a;
        const selfTo = selfIsA ? r.toA : r.toB;
        const otherTo = selfIsA ? r.toB : r.toA;
        if (v === M.Plant && params.plantGrowth < 100 && rng.int(0, 99) >= params.plantGrowth) continue;
        set(x, y, selfTo);
        set(nx, ny, otherTo);
        reacted = true;
        break;
      }
      if (reacted) continue;

      if (mat.kind === 'powder' || mat.kind === 'liquid') {
        if (mat.kind === 'liquid' && mat.viscosity !== undefined && rng.next() * 100 < params.lavaViscosity) continue;
        const below = at(x, y + 1);
        if (below === -1) {
          if (open) set(x, y, M.Air);
          continue;
        }
        if (canDisplace(below, v)) { swap(i, (y + 1) * w + x); continue; }
        const dirs = rng.next() < 0.5 ? [1, -1] : [-1, 1];
        let movedDiag = false;
        for (const dx of dirs) {
          const d = at(x + dx, y + 1);
          if (d !== -1 && canDisplace(d, v)) { swap(i, (y + 1) * w + (x + dx)); movedDiag = true; break; }
        }
        if (movedDiag) continue;
        if (mat.kind === 'liquid') {
          for (let s = 1; s <= params.waterSpread; s++) {
            const side = at(x + dirs[0]! * s, y);
            if (side === -1 || !canDisplace(side, v)) break;
          }
          const nx = x + dirs[0]!;
          const nv = at(nx, y);
          if (nv !== -1 && (nv === M.Air || (byId(nv).kind === 'liquid' && byId(nv).density < mat.density))) {
            swap(i, y * w + nx);
          }
        }
        continue;
      }

      if (mat.kind === 'gas') {
        life[i] = life[i]! > 0 ? life[i]! - 1 : 0;
        if (life[i]! === 0 && rng.next() < 0.02) { set(x, y, M.Air); continue; }
        const up = at(x, y - 1);
        if (up === -1) { if (open) set(x, y, M.Air); continue; }
        if (up === M.Air || byId(up).kind === 'liquid') { swap(i, (y - 1) * w + x); continue; }
        const dx = rng.next() < 0.5 ? 1 : -1;
        if (at(x + dx, y - 1) === M.Air) swap(i, (y - 1) * w + (x + dx));
        continue;
      }

      if (mat.kind === 'fire') {
        life[i] = life[i]! > 0 ? life[i]! - 1 : 0;
        // ignite flammables
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (byId(cells[ny * w + nx]!).flammable && rng.int(0, 255) < 40) set(nx, ny, M.Fire);
        }
        if (life[i]! === 0) set(x, y, rng.next() < 0.25 ? M.Smoke : M.Air);
        continue;
      }

      if (v === M.Plant && params.plantGrowth > 0) {
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (cells[ny * w + nx] === M.Water && rng.int(0, 99) < params.plantGrowth) {
            set(nx, ny, M.Plant);
            break;
          }
        }
      }
    }
  }
  return state;
}

export function countMaterials(state: State): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of MATERIALS) counts[m.name] = 0;
  for (let i = 0; i < state.cells.length; i++) {
    const name = byId(state.cells[i]!).name;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

export const sandSim = {
  kind: 'realtime' as const,
  defaultParams,
  paramSchema,
  init,
  step: (state: State) => step(state),
  applyParams: applyParamsForSand,
  onEdit: onEditSand,
  getStats: (state: State) => {
    const counts = countMaterials(state);
    return {
      sand: counts.Sand ?? 0,
      water: counts.Water ?? 0,
      lava: counts.Lava ?? 0,
      fire: counts.Fire ?? 0,
      moved: state.moved,
    };
  },
  about: { summary: '', bullets: [], invariant: '' },
  editor: {
    palette: MATERIALS.filter((m) => m.kind !== 'none' && m.id !== M.Smoke && m.id !== M.Steam).map((m) => ({
      value: m.id, label: m.name, color: m.color,
    })),
    tools: ['brush', 'line', 'rect', 'fill', 'eraser'] as ('brush' | 'line' | 'rect' | 'fill' | 'eraser')[],
    eraseValue: 0,
    target: (s: State) => ({ w: s.w, h: s.h, cells: s.cells }),
    undo: false,
    paintOnlyEmpty: true,
  },
};

void REACTIONS;
