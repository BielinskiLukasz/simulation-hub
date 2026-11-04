// ─── Falling sand · materials.ts — data table, not if-chains ────────────────

export const M = { Air: 0, Sand: 1, Water: 2, Stone: 3, Plant: 4, Fire: 5, Lava: 6, Smoke: 7, Steam: 8 } as const;

export interface Material {
  id: number;
  name: string;
  color: number; // 0xRRGGBB
  kind: 'none' | 'powder' | 'liquid' | 'gas' | 'static' | 'fire';
  density: number;
  flammable: boolean;
  viscosity?: number; // 0..1 probability of NOT moving (lava)
  maxLife?: number;
}

export const MATERIALS: Material[] = [
  { id: 0, name: 'Air', color: 0x0f172a, kind: 'none', density: 0, flammable: false },
  { id: 1, name: 'Sand', color: 0xfbbf24, kind: 'powder', density: 3, flammable: false },
  { id: 2, name: 'Water', color: 0x3b82f6, kind: 'liquid', density: 1, flammable: false },
  { id: 3, name: 'Stone', color: 0x64748b, kind: 'static', density: 9, flammable: false },
  { id: 4, name: 'Plant', color: 0x22c55e, kind: 'static', density: 5, flammable: true },
  { id: 5, name: 'Fire', color: 0xf97316, kind: 'fire', density: 0, flammable: false, maxLife: 60 },
  { id: 6, name: 'Lava', color: 0xef4444, kind: 'liquid', density: 2, flammable: false, viscosity: 0.8 },
  { id: 7, name: 'Smoke', color: 0x94a3b8, kind: 'gas', density: 0, flammable: false, maxLife: 120 },
  { id: 8, name: 'Steam', color: 0xbfdbfe, kind: 'gas', density: 0, flammable: false, maxLife: 100 },
];

export const byId = (id: number): Material => MATERIALS[id] ?? MATERIALS[0]!;

export function paletteFor(theme: 'light' | 'dark'): Uint32Array {
  const arr = new Uint32Array(256);
  const bg = theme === 'dark' ? 0x0b1220 : 0xffffff;
  for (let v = 0; v < 256; v++) {
    const rgb = v === 0 ? bg : byId(v).color;
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    arr[v] = (0xff << 24) | (b << 16) | (g << 8) | r;
  }
  return arr;
}
