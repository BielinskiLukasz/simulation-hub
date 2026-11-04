// ─── ui/controls.tsx ────────────────────────────────────────────────────────
// Param schema → controls generator (React rendering of the spec's
// buildControls). Controlled components, so reset / pasted URLs / "reset to
// defaults" push values back into the UI for free (the spec's syncControls).
//   range → slider + live readout (fires on input)   number → number input
//   boolean → switch   select → <select>   color → colour picker + hex

import type { ParamDef, ParamSchema } from '../core/types';

interface Props<P extends Record<string, any>> {
  schema: ParamSchema<P>;
  params: P;
  onChange: (key: keyof P, value: P[keyof P]) => void;
}

export function Controls<P extends Record<string, any>>({ schema, params, onChange }: Props<P>) {
  // Contract v4: ParamDef.group → collapsible sections (Cache uses
  // Pattern / Cache / Timing / Run). Section order = first appearance.
  const groups: { name: string | null; keys: (keyof P)[] }[] = [];
  for (const key of Object.keys(schema) as (keyof P)[]) {
    const group = (schema[key] as ParamDef).group ?? null;
    const existing = groups.find((g) => g.name === group);
    if (existing) existing.keys.push(key);
    else groups.push({ name: group, keys: [key] });
  }
  if (groups.length <= 1) {
    return <div className="space-y-5"><ControlList schema={schema} params={params} onChange={onChange} only={Object.keys(schema) as (keyof P)[]} /></div>;
  }
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <details key={g.name ?? 'general'} open={i === 0} className="group rounded-xl border border-slate-200 bg-slate-900/[.02] p-3 dark:border-white/10 dark:bg-white/[.03]">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-black tracking-wide text-slate-500 uppercase dark:text-slate-300">
            {g.name ?? 'General'}
            <span className="text-[10px] font-bold text-slate-400 transition group-open:rotate-90">▶</span>
          </summary>
          <div className="mt-3">
            <ControlList schema={schema} params={params} onChange={onChange} only={g.keys} />
          </div>
        </details>
      ))}
    </div>
  );
}

function ControlList<P extends Record<string, any>>({ schema, params, onChange, only }: Props<P> & { only: (keyof P)[] }) {
  const keys = only;
  return (
    <div className="space-y-5">
      {keys.map((key) => {
        const def: ParamDef = schema[key];
        const value = params[key];
        const id = `ctl-${String(key)}`;
        return (
          <div key={String(key)}>
            {def.kind === 'range' && (
              <>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <label htmlFor={id} className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{def.label}{def.live && <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-px align-middle font-mono text-[9px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">live</span>}</label>
                  <span className="rounded-md bg-slate-900/[.05] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
                    {typeof value === 'number' ? trimNum(value) : String(value)}{def.unit ? ` ${def.unit}` : ''}
                  </span>
                </div>
                <input
                  id={id} type="range" className="w-full" min={def.min} max={def.max} step={def.step} value={Number(value)}
                  style={{ ['--fill' as any]: `${((Number(value) - def.min) / (def.max - def.min)) * 100}%` }}
                  onChange={(e) => onChange(key, Number(e.target.value) as P[keyof P])}
                  aria-label={def.label}
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400 dark:text-slate-500">
                  <span>{def.min}</span><span>{def.max}</span>
                </div>
              </>
            )}

            {def.kind === 'number' && (
              <>
                <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-200">{def.label}{def.live && <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-px align-middle font-mono text-[9px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">live</span>}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={id} type="number" min={def.min} max={def.max} step={def.step ?? 1} value={Number(value)}
                    onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(key, n as P[keyof P]); }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[13px] text-slate-800 dark:border-white/15 dark:bg-white/[.06] dark:text-slate-100"
                  />
                  {def.unit && <span className="shrink-0 font-mono text-[11px] text-slate-400">{def.unit}</span>}
                </div>
              </>
            )}

            {def.kind === 'boolean' && (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={id} className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{def.label}{def.live && <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-px align-middle font-mono text-[9px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">live</span>}</label>
                <button
                  id={id} type="button" role="switch" aria-checked={Boolean(value)} aria-label={def.label}
                  onClick={() => onChange(key, !value as P[keyof P])}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-amber-500' : 'bg-slate-300 dark:bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            )}

            {def.kind === 'select' && (
              <>
                <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-200">{def.label}{def.live && <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-px align-middle font-mono text-[9px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">live</span>}</label>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/[.05] p-1 dark:bg-white/[.07]" role="group" aria-label={def.label}>
                  {def.options.map((opt) => (
                    <button
                      key={opt} type="button" aria-pressed={value === opt}
                      onClick={() => onChange(key, opt as P[keyof P])}
                      className={`rounded-lg px-2 py-1.5 text-[12px] font-semibold capitalize transition ${value === opt ? 'bg-white text-slate-900 shadow dark:bg-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'}`}
                    >{opt}</button>
                  ))}
                </div>
              </>
            )}

            {def.kind === 'color' && (
              <>
                <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-200">{def.label}{def.live && <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-px align-middle font-mono text-[9px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">live</span>}</label>
                <div className="flex items-center gap-2.5">
                  <input
                    id={id} type="color" value={String(value)}
                    onChange={(e) => onChange(key, e.target.value as P[keyof P])}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-white/15 dark:bg-white/[.06]"
                    aria-label={def.label}
                  />
                  <span className="rounded-md bg-slate-900/[.05] px-2 py-1 font-mono text-[12px] text-slate-600 dark:bg-white/10 dark:text-slate-200">{String(value).toUpperCase()}</span>
                  <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: String(value) }} aria-hidden />
                </div>
              </>
            )}

            {def.kind === 'text' && (
              <>
                <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-200">{def.label}</label>
                <input
                  id={id} type="text" key={String(value)} defaultValue={String(value)} placeholder={def.placeholder} aria-label={def.label}
                  onBlur={(e) => { if (e.target.value !== String(value)) onChange(key, e.target.value as P[keyof P]); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[12px] text-slate-800 dark:border-white/15 dark:bg-white/[.06] dark:text-slate-100"
                />
                {def.editor && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Structured editor below ↓</p>}
              </>
            )}

            {'hint' in def && def.hint && <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-slate-500">{def.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
