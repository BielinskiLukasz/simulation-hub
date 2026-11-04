// ─── ui/kpi.tsx — KPI cards, progress bar, results table (batch sims) ───────

export function KpiCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-white/[.04]">
      <div className="text-[10px] font-bold tracking-widest text-slate-400 uppercase dark:text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-[22px] leading-none font-black ${accent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-white'}`}>{value}</div>
      {hint && <div className="mt-1.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-900/[.08] dark:bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
      {label && <div className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-500">{label} · {pct}%</div>}
    </div>
  );
}

export function ResultsTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="bg-slate-900/[.04] dark:bg-white/[.05]">
            {head.map((h) => (
              <th key={h} className="px-3.5 py-2.5 text-[11px] font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 dark:border-white/[.06]">
              {r.map((c, j) => (
                <td key={j} className={`px-3.5 py-2.5 ${j === 0 ? 'font-bold text-slate-700 dark:text-slate-100' : 'font-mono text-slate-600 dark:text-slate-300'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
