import type { ReactNode } from 'react';
import type { AnySimulation } from '../core/types';
import { CATEGORY, DIFFICULTY, IconBack } from './kit';

export function ToolButton({
  onClick,
  children,
  label,
  active = false,
  disabled = false,
  primary = false,
}: {
  onClick: () => void;
  children: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-all duration-150',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:-translate-y-px active:translate-y-0',
        primary
          ? 'border-transparent bg-accent text-white hover:brightness-110'
          : active
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function SimTitleRow({
  sim,
  kind,
  right,
}: {
  sim: AnySimulation;
  kind: 'real-time' | 'analysis';
  right?: ReactNode;
}) {
  const cat = CATEGORY[sim.meta.category];
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <a
          href="#/"
          className="group inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition-colors hover:text-accent"
        >
          <IconBack className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          hub
        </a>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-2xl">{sim.meta.thumbnail}</span>
          <h1 className="font-display text-[clamp(1.7rem,3.4vw,2.6rem)] leading-none font-extrabold tracking-[-0.025em] text-ink">
            {sim.meta.title}
          </h1>
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: cat.color, borderColor: cat.color }}
          >
            {cat.label}
          </span>
          <span
            className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2"
            title={kind === 'analysis' ? 'Batch simulation — job driven, no frame loop' : 'Realtime simulation — fixed 1/60 s loop'}
          >
            {kind}
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
            {DIFFICULTY[sim.meta.difficulty]}
          </span>
        </div>
        {sim.meta.tagline && <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">{sim.meta.tagline}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function UrlBar({ hash, note }: { hash: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-3 py-2">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">url state</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2" title={hash}>
        {hash}
      </code>
      {note && <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3">{note}</span>}
    </div>
  );
}

export function Shortcuts({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10.5px] text-ink-3">
      <span className="uppercase tracking-[0.16em]">shortcuts</span>
      {items.map(([key, action]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[10px] text-ink-2">{key}</kbd>
          {action}
        </span>
      ))}
    </div>
  );
}
