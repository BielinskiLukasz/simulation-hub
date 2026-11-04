// ─── ui/grid-canvas.ts — ImageData grid renderer with overlays/markers ─────

import type { GridTarget, ThemeName } from '../core/types';

export interface CanvasMarker { id: string; x: number; y: number; color: number; label: string }

export interface GridCanvasHandle {
  setGrid(g: GridTarget): void;
  setPalette(colors: Uint32Array<ArrayBufferLike>): void;
  setOverlay(rgba: Uint32Array<ArrayBufferLike> | null): void;
  setMarkers(m: CanvasMarker[]): void;
  render(): void;
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null;
  resize(): void;
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
}

function toAbgr(rgb: number): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return (0xff << 24) | (b << 16) | (g << 8) | r;
}

export function createGridCanvas(host: HTMLElement, opts: { theme: ThemeName }): GridCanvasHandle {
  host.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', 'Grid canvas. Use the toolbar to paint cells.');
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d')!;
  let grid: GridTarget | null = null;
  let palette: Uint32Array<ArrayBufferLike> = new Uint32Array(256);
  let overlay: Uint32Array<ArrayBufferLike> | null = null;
  let markers: CanvasMarker[] = [];
  let image: ImageData | null = null;
  let dirty = true;

  const background = () => opts.theme === 'dark' ? '#0b1220' : '#ffffff';
  const gridLine = () => opts.theme === 'dark' ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.10)';

  function paintPixels() {
    if (!grid) return;
    if (!image || image.width !== grid.w || image.height !== grid.h) {
      off.width = grid.w;
      off.height = grid.h;
      image = offCtx.createImageData(grid.w, grid.h);
    }
    const out = new Uint32Array(image.data.buffer);
    for (let i = 0; i < grid.w * grid.h; i++) {
      const v = grid.cells[i]!;
      let color = palette[v] ?? toAbgr(0xff00ff);
      const ov = overlay?.[i] ?? 0;
      if (ov !== 0) {
        const sa = ((ov >>> 24) & 0xff) / 255;
        const sr = (ov & 0xff);
        const sg = (ov >> 8) & 0xff;
        const sb = (ov >> 16) & 0xff;
        const dr = color & 0xff;
        const dg = (color >> 8) & 0xff;
        const db = (color >> 16) & 0xff;
        const r = Math.round(sr * sa + dr * (1 - sa));
        const g = Math.round(sg * sa + dg * (1 - sa));
        const b = Math.round(sb * sa + db * (1 - sa));
        color = (0xff << 24) | (b << 16) | (g << 8) | r;
      }
      out[i] = color;
    }
    offCtx.putImageData(image, 0, 0);
    dirty = false;
  }

  function render() {
    if (!grid) return;
    if (dirty) paintPixels();
    const cw = canvas.clientWidth || host.clientWidth || grid.w;
    const ch = Math.round((cw * grid.h) / grid.w);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.height = `${ch}px`;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = background();
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(off, 0, 0, cw, ch);

    const cell = cw / grid.w;
    if (cell >= 6) {
      ctx.strokeStyle = gridLine();
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < grid.w; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, ch); }
      for (let y = 1; y < grid.h; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(cw, y * cell + 0.5); }
      ctx.stroke();
    }

    for (const m of markers) {
      const cx = (m.x + 0.5) * cell;
      const cy = (m.y + 0.5) * cell;
      const r = Math.max(6, Math.min(cell * 1.6, 16));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `#${m.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#0b0f17';
      ctx.font = `bold ${Math.round(r * 0.9)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label.slice(0, 1), cx, cy + 0.5);
    }
  }

  const ro = new ResizeObserver(() => render());
  ro.observe(host);
  render();

  return {
    canvas,
    setGrid(g) { grid = g; dirty = true; render(); },
    setPalette(colors: Uint32Array<ArrayBufferLike>) { palette = colors; dirty = true; },
    setOverlay(rgba: Uint32Array<ArrayBufferLike> | null) { overlay = rgba; dirty = true; },
    setMarkers(m) { markers = m; },
    render,
    resize() { render(); },
    cellAt(clientX, clientY) {
      if (!grid) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      if (px < 0 || py < 0 || px >= rect.width || py >= rect.height) return null;
      return {
        x: Math.min(grid.w - 1, Math.floor((px / rect.width) * grid.w)),
        y: Math.min(grid.h - 1, Math.floor((py / rect.height) * grid.h)),
      };
    },
    dispose() {
      ro.disconnect();
      canvas.remove();
      grid = null;
      image = null;
    },
  };
}

export function paletteArray(entries: { value: number; color: number }[], theme: ThemeName): Uint32Array {
  const arr = new Uint32Array(256);
  arr.fill(toAbgr(theme === 'dark' ? 0x0b1220 : 0xffffff));
  for (const e of entries) arr[e.value] = toAbgr(e.color);
  return arr;
}

export function overlayColor(rgb: number, alpha: number): number {
  return ((Math.round(alpha * 255) << 24) | (((rgb >> 16) & 0xff) << 16) | (((rgb >> 8) & 0xff) << 8) | (rgb & 0xff)) >>> 0;
}
