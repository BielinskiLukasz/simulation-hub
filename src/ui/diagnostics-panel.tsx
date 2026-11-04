// ─── ui/diagnostics-panel.tsx — conserved quantities + drift chart ─────────

import type { Diagnostics } from '../core/types';
import { driftSeries, energyDrift, momentumMagnitude, totalEnergy } from '../core/diagnostics';

export function fmt(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v !== 0 && (Math.abs(v) < 0.001 || Math.abs(v) >= 1e6)) return v.toExponential(2);
  return Number(v.toFixed(digits)).toString();
}

export function DiagnosticsPanel({ samples, samplesB, labelB }: {
  samples: readonly Diagnostics[];
  samplesB?: readonly Diagnostics[];
  labelB?: string;
}) {
  const latest = samples[samples.length - 1];
  const drift = energyDrift(samples);
  const driftB = samplesB ? energyDrift(samplesB) : null;
  const series = driftSeries(samples);
  const seriesB = samplesB ? driftSeries(samplesB) : [];
  const all = [...series, ...seriesB];
  const maxT = Math.max(1, ...all.map((s) => s.t));
  const driftColor = drift === null ? 'text-slate-400' : Math.abs(drift) < 0.001 ? 'text-emerald-600 dark:text-emerald-400' : Math.abs(drift) < 0.01 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  const points = (data: typeof series) => data.map((s) => `${(s.t / maxT) * 260},${38 - ((s.logDrift + 12) / 12) * 34}`).join(' ');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[11px] font-black tracking-wider text-slate-500 uppercase dark:text-slate-300">Diagnostics · conserved quantities</h3>
        <span className={`ml-auto font-mono text-[11px] font-bold ${driftColor}`}>ΔE/E₀ {drift === null ? '—' : `${(drift * 100).toFixed(3)}%`}</span>
        {samplesB && <span className="font-mono text-[11px] font-bold text-sky-600 dark:text-sky-400">B {driftB === null ? '—' : `${(driftB * 100).toFixed(3)}%`}</span>}
      </div>
      <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] sm:grid-cols-5">
        <Cell label="E total" value={fmt(totalEnergy(latest))} />
        <Cell label="K" value={fmt(latest?.energy?.kinetic)} />
        <Cell label="U" value={fmt(latest?.energy?.potential)} />
        <Cell label="|p|" value={fmt(momentumMagnitude(latest))} />
        <Cell label="Lz" value={fmt(latest?.angularMomentum)} />
      </div>
      {latest?.extras && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10px] text-slate-400">
          {Object.entries(latest.extras).map(([k, v]) => <span key={k} className="rounded bg-slate-900/[.04] px-1.5 py-0.5 dark:bg-white/[.06]">{k} <b className="text-slate-600 dark:text-slate-200">{fmt(v)}</b></span>)}
          {latest.approximate && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">≈ tree-estimated potential</span>}
        </div>
      )}
      <svg viewBox="0 0 260 44" className="mt-2 h-11 w-full rounded-lg bg-slate-950/90" role="img" aria-label="Log energy drift over time">
        <line x1="0" y1="38" x2="260" y2="38" stroke="#334155" strokeWidth="1" />
        {series.length > 1 && <polyline points={points(series)} fill="none" stroke="#f59e0b" strokeWidth="1.6" />}
        {seriesB.length > 1 && <polyline points={points(seriesB)} fill="none" stroke="#38bdf8" strokeWidth="1.6" />}
        <text x="4" y="10" fill="#94a3b8" fontSize="7" fontFamily="monospace">log10 |ΔE/E₀| (0 at bottom)</text>
        {labelB && <text x="256" y="10" fill="#38bdf8" fontSize="7" fontFamily="monospace" textAnchor="end">{labelB}</text>}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-400"><span>t=0</span><span>decimating recorder · {samples.length} samples</span><span>t={fmt(maxT, 1)}</span></div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">
      <div className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">{label}</div>
      <div className="truncate font-bold text-slate-700 dark:text-slate-100">{value}</div>
    </div>
  );
}
