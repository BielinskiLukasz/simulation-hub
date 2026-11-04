// ─── ui/chart.ts — small canvas chart engine (lines / fan bands / histogram) ─
// API mirrors the planned uPlot wrapper (createChart → setData / setTheme /
// resize / dispose) so the engine can be swapped without touching sim views.
// Zero dependencies, HiDPI-aware, ResizeObserver-driven, theme-aware, with a
// hover legend. dispose() removes the observer, listeners and canvas.

import type { ThemeName } from '../core/types';
import { formatCompact } from './format';
import { readChartPalette } from './chart-theme';

export { chartColors } from './chart-theme';

export interface ChartSeries {
  label: string;
  color: string;
  data: ArrayLike<number>;
  dashed?: boolean;
  width?: number;
}
export interface ChartBand {
  label: string;
  lo: ArrayLike<number>;
  hi: ArrayLike<number>;
  color: string; // fill (use rgba)
}
export type ChartData =
  | { kind: 'lines'; x: number[]; series: ChartSeries[]; vline?: { x: number; label: string }; yZero?: boolean }
  | { kind: 'bands'; x: number[]; bands: ChartBand[]; lines: ChartSeries[]; vline?: { x: number; label: string } }
  | { kind: 'histogram'; bins: { start: number; width: number; count: number }[]; color: string; marker?: { x: number; label: string } };

export interface ChartHandle {
  setData(data: ChartData): void;
  setTheme(theme: ThemeName): void;
  resize(): void;
  dispose(): void;
}

export interface ChartOptions {
  yFormat?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  theme: ThemeName;
}

const PAD = { l: 58, r: 12, t: 12, b: 24 };

export function createChart(host: HTMLElement, opts: ChartOptions): ChartHandle {
  host.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  const legend = document.createElement('div');
  legend.style.cssText =
    'position:absolute;top:6px;right:8px;pointer-events:none;font:11px "JetBrains Mono",monospace;padding:5px 8px;border-radius:8px;opacity:0;transition:opacity .12s;white-space:pre;line-height:1.5';
  host.append(canvas, legend);

  let data: ChartData | null = null;
  let theme = opts.theme;
  let hover: number | null = null;
  const ctx = canvas.getContext('2d')!;

  const palette = () => readChartPalette(theme);

  function bounds(d: ChartData): { x0: number; x1: number; y0: number; y1: number } {
    let y1 = -Infinity;
    let y0 = Infinity;
    const eat = (arr: ArrayLike<number>) => {
      for (let i = 0; i < arr.length; i++) { const v = arr[i]!; if (v > y1) y1 = v; if (v < y0) y0 = v; }
    };
    if (d.kind === 'histogram') {
      let mx = 0;
      for (const b of d.bins) if (b.count > mx) mx = b.count;
      const x0 = d.bins.length ? d.bins[0]!.start : 0;
      const last = d.bins[d.bins.length - 1];
      return { x0, x1: last ? last.start + last.width : 1, y0: 0, y1: mx * 1.08 || 1 };
    }
    if (d.kind === 'bands') { for (const b of d.bands) { eat(b.lo); eat(b.hi); } }
    const series = d.kind === 'bands' ? d.lines : d.series;
    for (const s of series) eat(s.data);
    if (d.kind === 'lines' && d.yZero) y0 = Math.min(y0, 0);
    if (!Number.isFinite(y1)) { y0 = 0; y1 = 1; }
    const pad = (y1 - y0) * 0.06 || 1;
    return { x0: d.x[0] ?? 0, x1: d.x[d.x.length - 1] ?? 1, y0: y0 - pad * 0.4, y1: y1 + pad };
  }

  function draw() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w < 40 || h < 40 || !data) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pal = palette();
    const b = bounds(data);
    const iw = w - PAD.l - PAD.r;
    const ih = h - PAD.t - PAD.b;
    const X = (v: number) => PAD.l + ((v - b.x0) / (b.x1 - b.x0 || 1)) * iw;
    const Y = (v: number) => PAD.t + ih - ((v - b.y0) / (b.y1 - b.y0 || 1)) * ih;
    const yFmt = opts.yFormat ?? formatCompact;

    // grid + y ticks
    ctx.font = '10px "JetBrains Mono",monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let t = 0; t <= 4; t++) {
      const v = b.y0 + ((b.y1 - b.y0) * t) / 4;
      const yy = Y(v);
      ctx.strokeStyle = pal.grid;
      ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(w - PAD.r, yy); ctx.stroke();
      ctx.fillStyle = pal.axis;
      ctx.fillText(yFmt(v), PAD.l - 6, yy);
    }
    // x ticks
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (data.kind !== 'histogram') {
      const xs = data.x;
      for (let t = 0; t <= 4; t++) {
        const v = xs[Math.round(((xs.length - 1) * t) / 4)] ?? 0;
        ctx.fillStyle = pal.axis;
        ctx.fillText(String(Math.round(v)), X(v), h - PAD.b + 6);
      }
    } else if (data.bins.length) {
      for (let t = 0; t <= 4; t++) {
        const v = b.x0 + ((b.x1 - b.x0) * t) / 4;
        ctx.fillStyle = pal.axis;
        ctx.fillText(formatCompact(v), X(v), h - PAD.b + 6);
      }
    }
    if (opts.xLabel) { ctx.fillStyle = pal.axis; ctx.fillText(opts.xLabel, PAD.l + iw / 2, h - 12); }

    const line = (s: ChartSeries, xs: number[]) => {
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const px = X(xs[i]!); const py = Y(s.data[i]!);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 2;
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (data.kind === 'bands') {
      for (const band of data.bands) {
        ctx.beginPath();
        for (let i = 0; i < data.x.length; i++) { const px = X(data.x[i]!); const py = Y(band.hi[i]!); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        for (let i = data.x.length - 1; i >= 0; i--) ctx.lineTo(X(data.x[i]!), Y(band.lo[i]!));
        ctx.closePath();
        ctx.fillStyle = band.color;
        ctx.fill();
      }
      for (const s of data.lines) line(s, data.x);
    } else if (data.kind === 'lines') {
      for (const s of data.series) line(s, data.x);
    } else {
      const bw = Math.max(1, (iw / Math.max(data.bins.length, 1)) - 1);
      ctx.fillStyle = data.color;
      for (const bin of data.bins) {
        const bx = X(bin.start);
        const by = Y(bin.count);
        ctx.fillRect(bx, by, bw, PAD.t + ih - by);
      }
      if (data.marker) {
        const mx = X(data.marker.x);
        ctx.strokeStyle = theme === 'dark' ? '#f8fafc' : '#0f172a';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(mx, PAD.t); ctx.lineTo(mx, PAD.t + ih); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = pal.text;
        ctx.textAlign = mx > w - 130 ? 'right' : 'left';
        ctx.fillText(data.marker.label, mx + (mx > w - 130 ? -4 : 4), PAD.t + 6);
      }
    }

    // vertical marker (e.g. accumulation → withdrawal switch)
    const vline = data.kind !== 'histogram' ? data.vline : undefined;
    if (vline) {
      const vx = X(vline.x);
      ctx.strokeStyle = pal.axis;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(vx, PAD.t); ctx.lineTo(vx, PAD.t + ih); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pal.text;
      ctx.textAlign = 'left';
      ctx.fillText(vline.label, vx + 4, PAD.t + 6);
    }

    // hover crosshair + legend
    if (hover !== null && data.kind !== 'histogram') {
      const xs = data.x;
      let idx = 0; let best = Infinity;
      for (let i = 0; i < xs.length; i++) { const d = Math.abs(X(xs[i]!) - hover); if (d < best) { best = d; idx = i; } }
      ctx.strokeStyle = pal.axis;
      ctx.beginPath(); ctx.moveTo(X(xs[idx]!), PAD.t); ctx.lineTo(X(xs[idx]!), PAD.t + ih); ctx.stroke();
      const series = data.kind === 'bands' ? data.lines : data.series;
      const bandLines = data.kind === 'bands'
        ? data.bands.flatMap((bd) => [
            { label: `${bd.label} hi`, color: pal.text, v: bd.hi[idx]! },
            { label: `${bd.label} lo`, color: pal.text, v: bd.lo[idx]! },
          ])
        : [];
      const rows = [
        `x = ${Math.round(xs[idx]!)}`,
        ...series.map((s) => `${s.label}: ${yFmt(s.data[idx]!)}`),
        ...bandLines.map((r) => `${r.label}: ${yFmt(r.v)}`),
      ];
      legend.textContent = rows.join('\n');
      legend.style.background = pal.bg;
      legend.style.color = pal.text;
      legend.style.border = `1px solid ${pal.border}`;
      legend.style.opacity = '1';
    } else if (hover !== null && data.kind === 'histogram') {
      legend.style.opacity = '0';
    } else {
      legend.style.opacity = '0';
    }
  }

  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    hover = e.clientX - rect.left;
    draw();
  };
  const onLeave = () => { hover = null; draw(); };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  draw();

  return {
    setData(d) { data = d; draw(); },
    setTheme(t) { theme = t; draw(); },
    resize() { draw(); },
    dispose() {
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.remove();
      legend.remove();
    },
  };
}

