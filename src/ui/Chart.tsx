import { useEffect, useRef, useState } from 'react';

export interface SeriesSpec {
  label: string;
  color: string;
  values: ArrayLike<number>;
  dashed?: boolean;
  width?: number;
}

export interface BandSpec {
  label: string;
  color: string;
  alpha?: number;
  from: ArrayLike<number>;
  to: ArrayLike<number>;
}

export interface ChartSpec {
  kind: 'lines' | 'bars';
  x: number[];
  series?: SeriesSpec[];
  bands?: BandSpec[];
  markers?: { x: number; label: string }[];
  yFormat?: (v: number) => string;
  xFormat?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
}

const cache = new Map<string, string>();

/** Canvas cannot resolve `var(--x)`, so read the token once per theme. */
export function resolveColor(color: string, theme: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(color.trim());
  if (!m) return color;
  const key = `${theme}:${m[1]}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const value = getComputedStyle(document.documentElement).getPropertyValue(m[1]!).trim() || '#888';
  cache.set(key, value);
  return value;
}

export function clearChartColorCache(): void {
  cache.clear();
}

interface Hover {
  index: number;
  px: number;
  py: number;
}

export function Chart({
  spec,
  theme,
  height = 260,
  caption,
}: {
  spec: ChartSpec;
  theme: 'light' | 'dark';
  height?: number;
  caption?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((records) => {
      const w = records[0]?.contentRect.width ?? 600;
      setWidth(Math.max(240, Math.round(w)));
    });
    ro.observe(wrap);
    setWidth(Math.max(240, Math.round(wrap.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    clearChartColorCache();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = width;
    const H = height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const pad = { l: 56, r: 14, t: 12, b: 26 };
    const plotW = Math.max(10, W - pad.l - pad.r);
    const plotH = Math.max(10, H - pad.t - pad.b);

    const xs = spec.x;
    const n = xs.length;
    if (n === 0) return;

    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const s of spec.series ?? []) {
      for (let i = 0; i < n; i++) {
        const v = s.values[i];
        if (v === undefined || !Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    for (const b of spec.bands ?? []) {
      for (let i = 0; i < n; i++) {
        for (const arr of [b.from, b.to]) {
          const v = arr[i];
          if (v === undefined || !Number.isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    if (spec.kind === 'bars' || lo > 0) lo = Math.min(lo, 0) === 0 ? 0 : lo - (hi - lo) * 0.08;
    if (hi === lo) hi = lo + 1;
    const span = hi - lo;
    lo -= span * 0.04;
    hi += span * 0.06;

    const xMin = xs[0]!;
    const xMax = xs[n - 1]!;
    const xSpan = xMax - xMin || 1;
    const X = (v: number): number => pad.l + ((v - xMin) / xSpan) * plotW;
    const Y = (v: number): number => pad.t + plotH - ((v - lo) / (hi - lo)) * plotH;

    const gridColor = resolveColor('var(--line)', theme);
    const axisText = resolveColor('var(--ink-3)', theme);
    const yFmt = spec.yFormat ?? ((v: number) => v.toFixed(0));
    const xFmt = spec.xFormat ?? ((v: number) => String(Math.round(v)));

    // grid + y ticks
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const TICKS = 5;
    for (let t = 0; t <= TICKS; t++) {
      const v = lo + ((hi - lo) * t) / TICKS;
      const y = Y(v);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, Math.round(y) + 0.5);
      ctx.lineTo(pad.l + plotW, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = axisText;
      ctx.fillText(yFmt(v), pad.l - 8, y);
    }

    // x ticks
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const XT = Math.min(6, n);
    for (let t = 0; t < XT; t++) {
      const i = Math.round((t * (n - 1)) / Math.max(1, XT - 1));
      ctx.fillStyle = axisText;
      ctx.fillText(xFmt(xs[i]!), X(xs[i]!), pad.t + plotH + 7);
    }

    // bands (fan chart)
    for (const band of spec.bands ?? []) {
      ctx.globalAlpha = band.alpha ?? 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx[i === 0 ? 'moveTo' : 'lineTo'](X(xs[i]!), Y(band.to[i] ?? 0));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(xs[i]!), Y(band.from[i] ?? 0));
      ctx.closePath();
      ctx.fillStyle = resolveColor(band.color, theme);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (spec.kind === 'bars') {
      const s = spec.series?.[0];
      if (s) {
        const stepPx = n > 1 ? Math.max(1.5, plotW / n - 1.5) : plotW;
        for (let i = 0; i < n; i++) {
          const v = s.values[i] ?? 0;
          const y = Y(v);
          ctx.fillStyle = resolveColor(s.color, theme);
          ctx.fillRect(X(xs[i]!) - stepPx / 2, y, stepPx, Math.max(0, pad.t + plotH - y));
        }
      }
    } else {
      for (const s of spec.series ?? []) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          const v = s.values[i];
          if (v === undefined || !Number.isFinite(v)) continue;
          const px = X(xs[i]!);
          const py = Y(v);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = resolveColor(s.color, theme);
        ctx.lineWidth = s.width ?? 1.8;
        ctx.setLineDash(s.dashed ? [4, 3] : []);
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // markers (e.g. accumulation -> withdrawal switch)
    for (const m of spec.markers ?? []) {
      const px = X(m.x);
      ctx.strokeStyle = resolveColor('var(--line-strong)', theme);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, pad.t);
      ctx.lineTo(px, pad.t + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = axisText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(m.label, px + 4, pad.t + 2);
    }

    // hover crosshair
    if (hover && spec.kind === 'lines') {
      const px = X(xs[hover.index]!);
      ctx.strokeStyle = resolveColor('var(--accent)', theme);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, pad.t);
      ctx.lineTo(px, pad.t + plotH);
      ctx.stroke();
      for (const s of spec.series ?? []) {
        const v = s.values[hover.index];
        if (v === undefined) continue;
        ctx.beginPath();
        ctx.arc(px, Y(v), 3, 0, Math.PI * 2);
        ctx.fillStyle = resolveColor(s.color, theme);
        ctx.fill();
      }
    }

    // frame
    ctx.strokeStyle = resolveColor('var(--line)', theme);
    ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, plotW, plotH);
  }, [spec, theme, width, height, hover]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (spec.kind !== 'lines' || spec.x.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pad = { l: 56, r: 14 };
    const plotW = Math.max(10, rect.width - pad.l - pad.r);
    const rel = (e.clientX - rect.left - pad.l) / plotW;
    const index = Math.max(0, Math.min(spec.x.length - 1, Math.round(rel * (spec.x.length - 1))));
    setHover({ index, px: e.clientX - rect.left, py: e.clientY - rect.top });
  };

  const hoverRows =
    hover && spec.kind === 'lines'
      ? [
          ...(spec.bands ?? []).map((b) => ({
            label: b.label,
            value: `${(spec.yFormat ?? ((v: number) => v.toFixed(0)))(b.from[hover.index] ?? 0)} – ${(
              spec.yFormat ?? ((v: number) => v.toFixed(0))
            )(b.to[hover.index] ?? 0)}`,
            color: resolveColor(b.color, theme),
          })),
          ...(spec.series ?? []).map((s) => ({
            label: s.label,
            value: (spec.yFormat ?? ((v: number) => v.toFixed(0)))(s.values[hover.index] ?? 0),
            color: resolveColor(s.color, theme),
          })),
        ]
      : [];

  return (
    <figure className="panel rounded-xl p-3">
      {caption && (
        <figcaption className="mb-2 flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">{caption}</span>
          {spec.yLabel && <span className="font-mono text-[10px] text-ink-3">{spec.yLabel}</span>}
        </figcaption>
      )}
      <div ref={wrapRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ height }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={caption ?? 'chart'}
        />
        {hover && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute z-10 min-w-[9rem] rounded-md border border-line bg-surface/95 px-2.5 py-2 shadow-lg backdrop-blur-sm"
            style={{
              left: Math.min(Math.max(4, hover.px + 12), Math.max(4, width - 150)),
              top: Math.max(4, hover.py - 10),
            }}
          >
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              {(spec.xFormat ?? ((v: number) => String(v)))(spec.x[hover.index]!)}
              {spec.xLabel ? ` ${spec.xLabel}` : ''}
            </p>
            {hoverRows.map((r) => (
              <p key={r.label} className="flex items-center justify-between gap-3 font-mono text-[10.5px] text-ink-2">
                <span className="flex items-center gap-1.5">
                  <i className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </span>
                <span className="tnum text-ink">{r.value}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
