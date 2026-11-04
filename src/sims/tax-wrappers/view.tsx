import { useState } from 'react';
import { Chart, type ChartSpec } from '../../ui/Chart';
import { KeyValueTable, Kpi, formatCompact } from '../../ui/kpi';
import { Rich, useTheme } from '../../ui/kit';
import type { ResultViewProps } from '../../core/types';
import { rulesFacts, type TaxParams, type TaxResult } from './model';

const COLOR: Record<string, string> = {
  taxable: 'var(--blue)',
  ike: 'var(--mint)',
  ikze: 'var(--accent)',
};

export function TaxView({ result, params, busy, meta }: ResultViewProps<TaxParams, TaxResult>) {
  const { theme } = useTheme();
  const [real, setReal] = useState(false);

  if (!result) {
    return (
      <div className="panel grid place-items-center rounded-xl px-6 py-20 text-center">
        <p className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-ink-3">projecting…</p>
      </div>
    );
  }

  const r = result;
  const currency = r.rules.currency;
  const best = r.scenarios.reduce((a, b) => (b.finalNominal > a.finalNominal ? b : a));

  const spec: ChartSpec = {
    kind: 'lines',
    x: r.years,
    xLabel: 'year',
    yFormat: (v) => formatCompact(v),
    series: r.scenarios.map((s) => ({
      label: s.label,
      color: COLOR[s.id] ?? 'var(--ink-2)',
      values: real ? s.real : s.nominal,
      width: 2,
    })),
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {r.scenarios.map((s) => (
          <Kpi
            key={s.id}
            label={s.label}
            value={`${formatCompact(real ? s.finalReal : s.finalNominal)}`}
            tone={s.id === best.id ? 'good' : 'default'}
            hint={
              s.id === 'taxable'
                ? `${currency}, ${params.years} yr horizon`
                : `${s.delta >= 0 ? '+' : '−'}${formatCompact(Math.abs(s.delta))} vs taxable (${s.deltaPct.toFixed(1)}%)`
            }
          />
        ))}
        <Kpi
          label="total tax paid"
          value={formatCompact(r.scenarios.reduce((sum, s) => sum + s.taxPaid, 0) / 3)}
          tone="accent"
          hint="average across the three scenarios"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">
          liquidation value {real ? '· real terms' : '· nominal'}
        </p>
        <button
          type="button"
          onClick={() => setReal((v) => !v)}
          aria-pressed={real}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          {real ? 'show nominal' : 'deflate by inflation'}
        </button>
      </div>
      <Chart spec={spec} theme={theme} height={290} caption={`what you could net if you exited in year N · ${currency}`} />

      <div className="panel overflow-hidden rounded-xl">
        <table className="w-full border-collapse text-left">
          <caption className="border-b border-line px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">
            results · every figure reproducible from the inputs and the rules below
          </caption>
          <thead>
            <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              <th scope="col" className="px-4 py-2 font-normal">scenario</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">final nominal</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">final real</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">tax paid</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">refunds</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Δ vs taxable</th>
            </tr>
          </thead>
          <tbody>
            {r.scenarios.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0 transition-colors hover:bg-surface-2">
                <th scope="row" className="px-4 py-2.5 text-left">
                  <span className="flex items-center gap-2 font-sans text-[13px] font-semibold text-ink">
                    <i className="h-2 w-2 rounded-full" style={{ background: COLOR[s.id] }} />
                    {s.label}
                  </span>
                </th>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] text-ink tnum">{formatCompact(s.finalNominal)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] text-ink-2 tnum">{formatCompact(s.finalReal)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] text-ink-2 tnum">{formatCompact(s.taxPaid)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] text-ink-2 tnum">{s.refunds > 0 ? formatCompact(s.refunds) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12.5px] tnum" style={{ color: s.delta >= 0 ? 'var(--mint)' : 'var(--rose)' }}>
                  {s.id === 'taxable' ? '—' : `${s.delta >= 0 ? '+' : '−'}${formatCompact(Math.abs(s.delta))} (${s.deltaPct.toFixed(1)}%)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-xl p-4">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">
            active rule-set · {r.rules.label}
          </p>
          <div className="mt-2">
            <KeyValueTable rows={rulesFacts(r.rules)} />
          </div>
          <p className="mt-3 border-t border-line pt-3 font-mono text-[10px] leading-relaxed text-ink-3">
            Limits are announced yearly and change. If an as-of date is older than the current year, treat the number as
            stale and check the source.
          </p>
        </div>

        <div className="panel rounded-xl p-4">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">assumptions &amp; simplifications</p>
          <ul className="mt-2.5 grid gap-2">
            {r.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-ink-2">
                <span className="mt-0.5 font-mono text-[10px] text-accent tnum">{String(i + 1).padStart(2, '0')}</span>
                <Rich text={a} />
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-2">
            Contributions total{' '}
            <span className="font-mono text-accent">{formatCompact(r.byId.taxable.contributions)} {currency}</span> in
            every scenario; the difference is purely tax and compounding.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 font-mono text-[10.5px] text-ink-3 tnum">
        <span>
          horizon <span className="text-ink">{params.years} yr</span>
        </span>
        <span>
          elapsed <span className="text-ink">{meta ? `${meta.ms.toFixed(1)} ms` : '—'}</span>
        </span>
        <span>
          executor <span className="text-ink">{meta?.executor ?? 'inline'}</span>
        </span>
        <span>
          payout <span className="text-ink">{params.qualified ? 'qualified' : 'early (non-qualified)'}</span>
        </span>
        {busy && <span className="text-accent">recomputing…</span>}
      </div>
    </div>
  );
}
