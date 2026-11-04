// ─── Falling sand · scenes.ts — seeded starting layouts ────────────────────

import { M } from './materials';

export interface Grid { w: number; h: number; cells: Uint8Array }

export function createGrid(w: number, h: number): Grid {
  return { w, h, cells: new Uint8Array(w * h) };
}

function fillRect(g: Grid, x0: number, y0: number, x1: number, y1: number, v: number): void {
  for (let y = Math.max(0, y0); y <= Math.min(g.h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(g.w - 1, x1); x++) g.cells[y * g.w + x] = v;
  }
}

export function buildScene(scene: string, w = 400, h = 300): Grid {
  const g = createGrid(w, h);
  switch (scene) {
    case 'hourglass': {
      const cx = Math.floor(w / 2);
      const top = Math.floor(h * 0.45);
      for (let y = 0; y < top; y++) {
        const half = Math.floor(((top - y) / top) * (w * 0.22));
        for (let x = cx - half; x <= cx + half; x++) {
          g.cells[y * w + x] = y < 3 ? M.Stone : M.Sand;
        }
      }
      for (let y = top; y < h; y++) {
        const half = Math.floor(((y - top) / (h - top)) * (w * 0.3));
        for (let x = cx - half; x <= cx + half; x++) {
          g.cells[y * w + x] = y === h - 1 || x === cx - half ? M.Stone : M.Air;
        }
      }
      break;
    }
    case 'forest': {
      fillRect(g, 0, h - 8, w - 1, h - 1, M.Stone);
      for (let i = 0; i < 40; i++) {
        const x = Math.floor((i * 37) % w);
        fillRect(g, x, h - 8 - (i % 9) * 2, x + 1, h - 9, M.Plant);
      }
      fillRect(g, 20, h - 40, Math.floor(w * 0.35), h - 9, M.Water);
      break;
    }
    case 'lava-lake': {
      fillRect(g, 0, h - 10, w - 1, h - 1, M.Stone);
      fillRect(g, 10, h - 34, w - 11, h - 11, M.Lava);
      fillRect(g, Math.floor(w * 0.4), 0, Math.floor(w * 0.6), 26, M.Water);
      break;
    }
    case 'rain': {
      fillRect(g, 0, h - 6, w - 1, h - 1, M.Stone);
      for (let x = 0; x < w; x += 24) fillRect(g, x, h - 40, x + 6, h - 7, M.Plant);
      for (let y = 0; y < 24; y++) for (let x = 0; x < w; x++) if ((x * 7 + y * 13) % 11 === 0) g.cells[y * w + x] = M.Water;
      break;
    }
    default:
      fillRect(g, 0, h - 4, w - 1, h - 1, M.Stone);
  }
  return g;
}
