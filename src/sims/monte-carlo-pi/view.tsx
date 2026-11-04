import { useEffect, useRef, useState } from 'react';
import { Chart, resolveColor, type ChartSpec } from '../../ui/Chart';
import { Kpi, formatCompact } from '../../ui/kpi';
import { Rich, useTheme } from '../../ui/kit';
import type { ResultViewProps } from '../../core/types';
import { TRUE_PI } from './model';
import type { PiResult } from './job';

function PointCloud({ cloud, theme }: { cloud: Float32Array | null; theme: 'light' | 'dark' }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState(240);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => setSize(Math.max(160, Math.min(340, Math.round(wrap.getBoundingClientRect().width))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = resolveColor(theme === 'dark' ? 'var(--bg-deep)' : 'var(--surface-2)', theme);
    ctx.fillRect(0, 0, size, size);

    // quarter disc
    ctx.beginPath();
    ctx.arc(0, size, size, -Math.PI / 2, 0);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fillStyle = resolveColor('var(--accent)', theme);
    ctx.globalAlpha = 0.08;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = resolveColor('var(--accent)', theme);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, size, size, -Math.PI / 2, 0);
    ctx.stroke();

    if (!cloud) return;
    const inside = resolveColor('var(--mint)', theme);
    const outside = resolveColor('var(--ink-3)', theme);
    const n = Math.floor(cloud.length / 3);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const isIn = cloud[i * 3 + 2]! === 1;
        if ((pass === 0) !== isIn) continue;
        ctx.moveTo(cloud[i * 3]! * size + 1.3, cloud[i * 3 + 1]! * size);
        ctx.arc(cloud[i * 3]! * size, cloud[i * 3 + 1]! * size, 1.3, 0, Math.PI * 2);
      }
      ctx.fillStyle = pass === 0 ? inside : outside;
      ctx.globalAlpha = pass === 0 ? 0.95 : 0.4;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [cloud, theme, size]);

  return (
    <div ref={wrapRef} className="panel rounded-xl p-3">
      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">
        chunk 0 · {cloud ? formatCompact(cloud.length / 3, 0) : 'no'} darts
      </p>
      <div className="flex justify-center">
        <canvas ref={canvasRef} className="rounded-md" role="img" aria-label="Sampled points in the unit square" />
      </div>
    </div>
  );
}

export function PiView({ result, params, busy, meta }: ResultViewProps<import('./model').PiParams, PiResult>) {
  const { theme } = useTheme();

  if (!result) {
    return (
      <div className="panel grid place-items-center rounded-xl px-6 py-20 text-center">
        <p className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-ink-3">throwing darts…</p>
      </div>
    );
  }

  const r = result;
  const c = r.convergence;
  const flat = new Array<number>(c.samplesAt.length).fill(TRUE_PI);

  const convergence: ChartSpec = {
    kind: 'lines',
    x: c.samplesAt,
    xLabel: 'samples',
    xFormat: (v) => formatCompact(v, 1),
    yFormat: (v) => v.toFixed(3),
    bands: [{ label: '±2σ', color: 'var(--blue)', alpha: 0.18, from: c.lo, to: c.hi }],
    series: [
      { label: 'π̂ cumulative', color: 'var(--accent)', values: c.pi, width: 2.2 },
      { label: 'true π', color: 'var(--mint)', values: flat, dashed: true, width: 1.4 },
    ],
  };

  const histogram: ChartSpec = {
    kind: 'bars',
    x: r.histogram.binStart,
    xLabel: 'per-chunk π̂',
    xFormat: (v) => v.toFixed(3),
    yFormat: (v) => String(Math.round(v)),
    series: [{ label: 'chunks', color: 'var(--blue)', values: r.histogram.count }],
    markers: [{ x: TRUE_PI, label: 'π' }],
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="π̂ estimate" value={r.pi.toFixed(6)} tone="accent" hint={`${r.sampler} sampler`} />
        <Kpi
          label="absolute error"
          value={r.absError.toFixed(6)}
          tone={r.absError < r.se ? 'good' : 'bad'}
          hint={`${r.relErrorPct.toFixed(4)}% · ${r.absError < r.se ? 'inside 1σ' : 'outside 1σ'}`}
        />
        <Kpi label="95% confidence" value={`${r.ci95Lo.toFixed(4)} – ${r.ci95Hi.toFixed(4)}`} hint={`±${(1.96 * r.se).toFixed(4)} (2σ̂ = ±${(2 * r.se).toFixed(4)})`} />
        <Kpi
          label="samples"
          value={formatCompact(r.samples)}
          hint={`${r.chunks} chunks × 25k · ${formatCompact(r.hits)} hits`}
        />
      </div>

      <Chart spec={convergence} theme={theme} height={290} caption="convergence · the ±2σ band narrows as 1/√N" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart spec={histogram} theme={theme} height={230} caption={`sampling distribution · ${r.chunks} chunk estimates`} />
        <PointCloud cloud={r.cloud} theme={theme} />
      </div>

      <div className="panel rounded-xl p-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">what am I looking at?</p>
        <div className="mt-2 grid gap-2.5 text-[13px] leading-relaxed text-ink-2 md:grid-cols-2">
          <p>
            <Rich text="Each dart is a Bernoulli trial with `p = π/4`, so `π̂ = 4·hits/N` is unbiased and its standard error shrinks as **1/√N**. Quadrupling the samples only halves the error — that is why the band narrows so stubbornly." />
          </p>
          <p>
            <Rich text="The histogram is the **sampling distribution**: one estimate per 25,000-sample chunk, centred on π. Switch the sampler to `antithetic` or `stratified` and the same N gives a tighter spread — variance reduction, not more data." />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 font-mono text-[10.5px] text-ink-3 tnum">
        <span>
          elapsed <span className="text-ink">{meta ? `${meta.ms.toFixed(0)} ms` : '—'}</span>
        </span>
        <span>
          throughput{' '}
          <span className="text-ink">
            {meta && meta.ms > 0 ? `${formatCompact(r.samples / (meta.ms / 1000), 1)}/s` : '—'}
          </span>
        </span>
        <span>
          executor{' '}
          <span className="text-ink">{meta?.executor === 'workers' ? `${meta.workers ?? '?'} workers` : 'inline'}</span>
        </span>
        <span>
          params requested <span className="text-ink">{formatCompact(params.samples)}</span>
        </span>
        {busy && <span className="text-accent">recomputing…</span>}
      </div>
    </div>
  );
}
