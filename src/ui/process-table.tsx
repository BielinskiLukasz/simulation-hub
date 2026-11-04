// ─── ui/process-table.tsx — custom editor for the scheduler workload ───────
// Rows ⇄ "arrival:burst:priority;..." string (the `workload` text param).
// Validates integers, burst ≥ 1; writes back on every valid edit.

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { encodeWorkload, parseWorkload, type ProcSpec } from '../sims/cpu-scheduler/algorithms';

export function ProcessTableEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rows, setRows] = useState<ProcSpec[]>(() => parseWorkload(value));
  const [error, setError] = useState('');

  useEffect(() => {
    const parsed = parseWorkload(value);
    if (encodeWorkload(parsed) !== encodeWorkload(rows)) setRows(parsed);
  }, [value]);

  const commit = (next: ProcSpec[]) => {
    setRows(next);
    const bad = next.findIndex((r) => !Number.isFinite(r.arrival) || !Number.isFinite(r.burst) || r.burst < 1 || r.arrival < 0);
    if (bad >= 0) { setError(`Row ${bad + 1}: arrival ≥ 0, burst ≥ 1, integers only`); return; }
    setError('');
    onChange(encodeWorkload(next.map((r) => ({
      arrival: Math.floor(r.arrival), burst: Math.floor(r.burst), priority: Math.max(1, Math.floor(r.priority) || 1),
    }))));
  };

  const set = (i: number, field: keyof ProcSpec, raw: string) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [field]: Number(raw) } : r));
    commit(next);
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">Process table</span>
        <button type="button" onClick={() => commit([...rows, { arrival: 0, burst: 5, priority: 3 }])}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900/[.05] px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/[.08] dark:text-slate-200">
          <Plus className="h-3 w-3" /> Add process
        </button>
      </div>
      <table className="w-full font-mono text-[12px]">
        <thead>
          <tr className="text-left text-[10px] tracking-wider text-slate-400 uppercase dark:text-slate-500">
            <th className="pb-1">pid</th><th className="pb-1">arrival</th><th className="pb-1">burst</th><th className="pb-1">prio</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-0.5 pr-2 font-bold text-slate-500 dark:text-slate-300">P{i + 1}</td>
              {(['arrival', 'burst', 'priority'] as const).map((f) => (
                <td key={f} className="py-0.5 pr-2">
                  <input
                    value={String(r[f])} inputMode="numeric" aria-label={`P${i + 1} ${f}`}
                    onChange={(e) => set(i, f, e.target.value.replace(/[^0-9-]/g, ''))}
                    className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 dark:border-white/15 dark:bg-white/[.06] dark:text-slate-100"
                  />
                </td>
              ))}
              <td>
                <button type="button" aria-label={`Remove P${i + 1}`} onClick={() => commit(rows.filter((_, idx) => idx !== i))}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p className="mt-1.5 text-[11px] font-semibold text-rose-500">{error}</p>
        : <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">Lower priority number = higher priority. Edits update the URL workload.</p>}
    </div>
  );
}
