import { Chart, type ChartSpec } from '../../ui/Chart';
import { Kpi, formatCompact, formatPct } from '../../ui/kpi';
import { Rich, useTheme } from '../../ui/kit';
import type { ResultViewProps } from '../../core/types';
import type { McResult } from './job';
import { successRule, type McParams } from './model';

const EMPTY = (
  <div className="panel grid place-items-center rounded-xl px-6 py-20 text-center">
    <p className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-ink-3">waiting for the first run…</p>
  </div>
);

export function McView({ result, params, busy, meta }: ResultViewProps<McParams, McResult>) {
  const { theme } = useTheme();
  if (!result) return EMPTY;
  const r = result;

  const fan: ChartSpec = {
    kind: 'lines',
    x: r.years,
    xLabel: 'year',
    yFormat: (v) => formatCompact(v),
    bands: [
      { label: 'p10 – p90', color: 'var(--blue)', alpha: 0.15, from: r.series.p10, to: r.series.p90 },
      { label: 'p25 – p75', color: 'var(--blue)', alpha: 0.3, from: r.series.p25, to: r.series.p75 },
    ],
    series: [
      { label: 'median (p50)', color: 'var(--accent)', values: r.series.p50, width: 2.2 },
      { label: 'mean', color: 'var(--mint)', values: r.mean, dashed: true, width: 1.4 },
      { label: 'p10 (bad case)', color: 'var(--rose)', values: r.series.p10, dashed: true, width: 1.1 },
    ],
    markers: r.accumYears > 0 ? [{ x: r.accumYears, label: 'stop contributing' }] : undefined,
  };

  const hist: ChartSpec = {
    kind: 'bars',
    x: Array.from(r.histogram.binStart),
    xLabel: 'final balance',
    xFormat: (v) => formatCompact(v, 1),
    yFormat: (v) => formatCompact(v, 1),
    series: [{ label: 'runs', color: 'var(--mint)', values: Array.from(r.histogram.count) }],
    markers: [{ x: r.finals.p50, label: 'median' }],
  };

  const depletion: ChartSpec | null = r.depletionByYear
    ? {
        kind: 'lines',
        x: r.years,
        xLabel: 'year',
        yFormat: (v) => `${(v * 100).toFixed(0)}%`,
        series: [{ label: 'P(depleted by year)', color: 'var(--rose)', values: r.depletionByYear, width: 2 }],
        markers: r.accumYears > 0 ? [{ x: r.accumYears, label: 'retirement' }] : undefined,
      }
    : null;

  const successTone = r.successProb >= 0.8 ? 'good' : r.successProb >= 0.55 ? 'accent' : 'bad';
  const runsPerSec = meta && meta.ms > 0 ? r.runs / (meta.ms / 1000) : 0;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="success probability"
          value={formatPct(r.successProb, 1)}
          tone={successTone}
          hint={successRule(params)}
        />
        <Kpi label="median final" value={formatCompact(r.finals.p50)} tone="accent" hint="p50 of all runs" />
        <Kpi label="p10 · bad case" value={formatCompact(r.finals.p10)} tone="bad" hint="1 run in 10 does worse" />
        <Kpi label="p90 · good case" value={formatCompact(r.finals.p90)} tone="good" hint="1 run in 10 does better" />
      </div>

      <Chart
        spec={fan}
        theme={theme}
        height={300}
        caption={`balance fan · ${r.runs.toLocaleString('en-US')} paths · today's money`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart spec={hist} theme={theme} height={220} caption={`final balances · 40 bins, clipped at p99 (${formatCompact(r.histogram.clippedAt, 1)})`} />
        {depletion ? (
          <Chart spec={depletion} theme={theme} height={220} caption={`depletion risk · P(gone by year) = ${formatPct(r.depletedProb)}`} />
        ) : (
          <div className="panel grid place-items-center rounded-xl px-5 py-10 text-center">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">no withdrawal phase</p>
              <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-2">
                Success is measured against the target balance instead:{' '}
                <span className="font-mono text-accent">{formatCompact(params.targetBalance)}</span>. Add withdrawal
                years to see depletion risk.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="panel rounded-xl p-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">what am I looking at?</p>
        <div className="mt-2 grid gap-2.5 text-[13px] leading-relaxed text-ink-2 md:grid-cols-2">
          <p>
            <Rich text="Each line is a **percentile across runs**, not a forecast. The shaded fan is p10–p90: nine out of ten simulated lives land inside it. The **median is below the mean** because the distribution is right-skewed — a few spectacular paths drag the average up." />
          </p>
          <p>
            <Rich text="The fan widens with time because uncertainty **compounds**. Notice the kink where contributions stop: that is where **sequence-of-returns risk** bites — a bad first year of withdrawals permanently shrinks the pot, which is what the shock slider demonstrates." />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 font-mono text-[10.5px] text-ink-3 tnum">
        <span>
          runs <span className="text-ink">{r.runs.toLocaleString('en-US')}</span>
        </span>
        <span>
          checkpoints <span className="text-ink">{r.checkpoints}</span>
        </span>
        <span>
          elapsed <span className="text-ink">{meta ? `${meta.ms.toFixed(0)} ms` : '—'}</span>
        </span>
        <span>
          throughput <span className="text-ink">{formatCompact(runsPerSec, 1)} runs/s</span>
        </span>
        <span>
          executor{' '}
          <span className="text-ink">
            {meta?.executor === 'workers' ? `${meta.workers ?? '?'} workers` : 'inline (main thread)'}
          </span>
        </span>
        <span>
          chunks <span className="text-ink">{meta?.chunks ?? '—'} × 1,000</span>
        </span>
        {busy && <span className="text-accent">recomputing…</span>}
      </div>
    </div>
  );
}
