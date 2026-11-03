import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildHash } from '../core/router';
import { decodeState, encodeState } from '../core/url-state';
import type { AnySimulation, ParamDef, SimEntry } from '../core/types';
import { SimStage, type StageStats } from './SimStage';
import {
  CATEGORY,
  DIFFICULTY,
  IconArrow,
  IconBack,
  IconBook,
  IconCheck,
  IconDice,
  IconLink,
  IconPause,
  IconPlay,
  IconReset,
  IconSliders,
  IconStep,
  Kicker,
  Rich,
  useTheme,
} from './kit';

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/* ------------------------------------------------------------------ *
 * Schema → controls
 * ------------------------------------------------------------------ */
function Control({
  paramKey,
  def,
  value,
  onChange,
}: {
  paramKey: string;
  def: ParamDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const id = `ctl-${paramKey}`;

  if (def.kind === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 transition-colors hover:border-line-strong">
        <label htmlFor={id} className="cursor-pointer font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-2">
          {def.label}
        </label>
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(paramKey, e.target.checked)}
        />
      </div>
    );
  }

  if (def.kind === 'select') {
    return (
      <div className="grid gap-1.5">
        <label htmlFor={id} className="field-label">
          {def.label}
        </label>
        <select id={id} value={String(value)} onChange={(e) => onChange(paramKey, e.target.value)} className="w-full">
          {def.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (def.kind === 'color') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2">
        <label htmlFor={id} className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-2">
          {def.label}
        </label>
        <span className="flex items-center gap-2">
          <code className="font-mono text-[11.5px] text-ink-3">{String(value)}</code>
          <input id={id} type="color" value={String(value)} onChange={(e) => onChange(paramKey, e.target.value)} />
        </span>
      </div>
    );
  }

  if (def.kind === 'number') {
    return (
      <div className="grid gap-1.5">
        <label htmlFor={id} className="field-label">
          {def.label}
        </label>
        <input
          id={id}
          type="number"
          value={Number(value)}
          min={def.min}
          max={def.max}
          step={def.step ?? 1}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            if (!Number.isNaN(n)) onChange(paramKey, n);
          }}
          className="w-full tnum"
        />
        {(def.min !== undefined || def.max !== undefined) && (
          <p className="font-mono text-[10px] text-ink-3">
            {def.min ?? '−∞'} … {def.max ?? '∞'}
          </p>
        )}
      </div>
    );
  }

  // range
  const min = def.min;
  const max = def.max;
  const num = Number(value);
  const pct = max > min ? ((num - min) / (max - min)) * 100 : 0;
  const decimals = def.step < 0.1 ? 2 : def.step < 1 ? 2 : 0;

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="field-label">
          {def.label}
        </label>
        <output htmlFor={id} className="font-mono text-[12px] font-semibold text-accent tnum">
          {num.toFixed(decimals)}
          {def.unit ? <span className="ml-0.5 text-[10px] text-ink-3">{def.unit}</span> : null}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={def.step}
        value={num}
        onChange={(e) => onChange(paramKey, Number.parseFloat(e.target.value))}
        style={{ ['--fill' as string]: `${pct.toFixed(2)}%` }}
      />
      <div className="flex justify-between font-mono text-[9.5px] text-ink-3 tnum">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function Controls({
  schema,
  params,
  onChange,
}: {
  schema: Record<string, ParamDef>;
  params: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="grid gap-4">
      {Object.entries(schema).map(([key, def]) => (
        <Control key={key} paramKey={key} def={def as ParamDef} value={params[key]} onChange={onChange} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Toolbar button
 * ------------------------------------------------------------------ */
function ToolButton({
  onClick,
  children,
  label,
  active = false,
  disabled = false,
  primary = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
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

/* ------------------------------------------------------------------ *
 * The session: state, URL sync, toolbar, tabs, shortcuts
 * ------------------------------------------------------------------ */
function SimSession({ sim, initialQuery }: { sim: AnySimulation; initialQuery: URLSearchParams }) {
  const { theme } = useTheme();
  const decoded = useMemo(
    () => decodeState<Record<string, unknown>>(initialQuery, sim.defaultParams, sim.paramSchema),
    [sim, initialQuery],
  );

  const [params, setParams] = useState<Record<string, unknown>>(decoded.params);
  const [seed, setSeed] = useState(decoded.seed);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'controls' | 'docs'>('controls');
  const [stepSignal, setStepSignal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<StageStats>({ fps: 0, steps: 0, time: 0, metrics: [] });

  const schema = sim.paramSchema as Record<string, ParamDef>;
  const cat = CATEGORY[sim.meta.category];
  const urlQuery = useMemo(
    () => encodeState(params as never, sim.defaultParams, seed),
    [params, sim, seed],
  );
  const hash = buildHash(sim.meta.id, urlQuery);

  // URL is the save file. replaceState: no hashchange, no history spam.
  useEffect(() => {
    window.history.replaceState(null, '', hash);
  }, [hash]);

  const onChange = useCallback((key: string, value: unknown) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const doReset = useCallback(() => {
    setParams({ ...(sim.defaultParams as Record<string, unknown>) });
    setPaused(false);
  }, [sim]);

  const newSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 0x7fffffff));
  }, []);

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    try {
      void navigator.clipboard.writeText(url).then(done).catch(done);
    } catch {
      done();
    }
  }, [hash]);

  // shortcuts — ignored while a field has focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === '.') {
        e.preventDefault();
        setStepSignal((s) => s + 1);
      } else if (e.key === 'r' || e.key === 'R') {
        doReset();
      } else if (e.key === 'n' || e.key === 'N') {
        newSeed();
      } else if (e.key === 'c' || e.key === 'C') {
        copyLink();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doReset, newSeed, copyLink]);

  const onStats = useCallback((next: StageStats) => setStats(next), []);

  return (
    <main id="main" className="relative z-10 mx-auto w-full max-w-[1640px] px-4 pt-5 pb-14 lg:px-6">
      {/* title row */}
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
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
              {DIFFICULTY[sim.meta.difficulty]}
            </span>
          </div>
          {sim.meta.tagline && <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">{sim.meta.tagline}</p>}
        </div>

        <div className="flex items-center gap-2">
          <ToolButton onClick={copyLink} label="Copy shareable link (C)">
            {copied ? <IconCheck className="h-3.5 w-3.5 text-mint" /> : <IconLink className="h-3.5 w-3.5" />}
            {copied ? 'copied' : 'copy link'}
          </ToolButton>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_368px]">
        {/* ---------------- stage column ---------------- */}
        <div className="min-w-0">
          {/* toolbar */}
          <div className="panel mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5">
            <ToolButton primary onClick={() => setPaused((p) => !p)} label="Play / pause (Space)">
              {paused ? <IconPlay className="h-3.5 w-3.5" /> : <IconPause className="h-3.5 w-3.5" />}
              {paused ? 'play' : 'pause'}
            </ToolButton>
            <ToolButton onClick={() => setStepSignal((s) => s + 1)} label="Advance one fixed step (.)">
              <IconStep className="h-3.5 w-3.5" />
              step
            </ToolButton>
            <ToolButton onClick={doReset} label="Reset to defaults (R)">
              <IconReset className="h-3.5 w-3.5" />
              reset
            </ToolButton>
            <ToolButton onClick={newSeed} label="New random seed (N)">
              <IconDice className="h-3.5 w-3.5" />
              seed
            </ToolButton>

            <div className="mx-1 h-6 w-px bg-line" />

            <div className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={[
                    'rounded px-2 py-1.5 font-mono text-[11px] transition-all duration-150 tnum',
                    speed === s ? 'bg-accent text-white' : 'text-ink-3 hover:text-ink',
                  ].join(' ')}
                >
                  {s}×
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2 font-mono text-[11px] text-ink-3 tnum">
              <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-ink-3' : 'live-dot bg-mint'}`} />
              {paused ? 'paused' : 'running'}
            </div>
          </div>

          {/* canvas */}
          <div className="panel brackets overflow-hidden rounded-xl">
            <div className="relative aspect-[4/3] max-h-[min(72vh,760px)] w-full bg-bg-deep">
              <SimStage
                sim={sim}
                params={params}
                seed={seed}
                paused={paused}
                speed={speed}
                stepSignal={stepSignal}
                onStats={onStats}
                label={`${sim.meta.title} simulation canvas`}
              >
                {/* HUD */}
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 font-mono text-[10.5px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-line bg-bg/70 px-2 py-1.5 backdrop-blur-[2px]">
                      <span className="text-ink-3">
                        t <span className="text-ink tnum">{stats.time.toFixed(2)}s</span>
                      </span>
                      <span className="text-ink-3">
                        steps <span className="text-ink tnum">{stats.steps.toLocaleString('en-US')}</span>
                      </span>
                      <span className="text-ink-3">
                        fps <span className="text-ink tnum">{stats.fps.toFixed(0)}</span>
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1 rounded-md border border-line bg-bg/70 px-2 py-1.5 text-right backdrop-blur-[2px]">
                      {stats.metrics.map((m) => (
                        <span key={m.label} className="text-ink-3">
                          {m.label} <span className="text-accent tnum">{m.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <span className="rounded-md border border-line bg-bg/70 px-2 py-1 text-ink-3 backdrop-blur-[2px]">
                      seed <span className="text-mint tnum">{seed}</span>
                    </span>
                    <span className="rounded-md border border-line bg-bg/70 px-2 py-1 text-ink-3 backdrop-blur-[2px]">
                      {sim.world.w}×{sim.world.h} world · dt 1/60 · {speed}×
                    </span>
                  </div>
                </div>
              </SimStage>
            </div>

            {/* url readout */}
            <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-3 py-2">
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">url state</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2" title={hash}>
                {hash}
              </code>
              <a
                href={hash}
                onClick={(e) => e.preventDefault()}
                className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3"
              >
                synced
              </a>
            </div>
          </div>

          {/* shortcuts */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10.5px] text-ink-3">
            <span className="uppercase tracking-[0.16em]">shortcuts</span>
            {[
              ['space', 'play / pause'],
              ['.', 'step'],
              ['r', 'reset'],
              ['n', 'new seed'],
              ['c', 'copy link'],
            ].map(([key, action]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[10px] text-ink-2">{key}</kbd>
                {action}
              </span>
            ))}
          </div>

          {/* description under the stage */}
          <p className="mt-5 max-w-3xl text-[14px] leading-relaxed text-ink-2">
            <Rich text={sim.meta.description} />
          </p>
        </div>

        {/* ---------------- side panel ---------------- */}
        <aside className="min-w-0">
          <div className="panel sticky top-4 overflow-hidden rounded-xl xl:max-h-[calc(100vh-2rem)]">
            <div className="flex border-b border-line" role="tablist" aria-label="Simulation panels">
              {(
                [
                  ['controls', 'Controls', <IconSliders key="a" className="h-3.5 w-3.5" />],
                  ['docs', 'How it works', <IconBook key="b" className="h-3.5 w-3.5" />],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={[
                    'relative flex flex-1 items-center justify-center gap-2 px-3 py-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors',
                    tab === id ? 'text-accent' : 'text-ink-3 hover:text-ink-2',
                  ].join(' ')}
                >
                  {icon}
                  {label}
                  {tab === id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto px-4 py-4 xl:max-h-[calc(100vh-8.5rem)]">
              {tab === 'controls' ? (
                <>
                  <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">seed</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="number"
                        value={seed}
                        min={0}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          if (!Number.isNaN(n)) setSeed(Math.abs(n) % 0x7fffffff);
                        }}
                        className="w-28 text-right tnum"
                        aria-label="Seed"
                      />
                      <button
                        type="button"
                        onClick={newSeed}
                        aria-label="Randomise seed"
                        className="rounded-md border border-line bg-surface p-1.5 text-ink-2 transition-colors hover:border-accent hover:text-accent"
                      >
                        <IconDice className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>

                  <Controls schema={schema} params={params} onChange={onChange} />

                  <p className="mt-5 border-t border-line pt-4 font-mono text-[10.5px] leading-relaxed text-ink-3">
                    Changing a parameter re-inits with the same seed — deterministic by design. Live parameter
                    tweaking without a reset is a per-sim opt-in reserved for Phase 2.
                  </p>
                </>
              ) : (
                <div className="grid gap-4">
                  {sim.meta.formula && (
                    <div className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-center">
                      <Kicker className="mb-2">governing rule</Kicker>
                      <code className="font-mono text-[12.5px] text-accent">{sim.meta.formula}</code>
                    </div>
                  )}
                  {(sim.meta.howItWorks ?? []).map((block, i) => (
                    <p key={i} className="text-[13.2px] leading-relaxed text-ink-2">
                      <span className="mr-2 font-mono text-[11px] text-accent tnum">{String(i + 1).padStart(2, '0')}</span>
                      <Rich text={block} />
                    </p>
                  ))}
                  <div className="rounded-lg border border-dashed border-line px-3 py-3">
                    <Kicker className="mb-2">platform guarantees</Kicker>
                    <ul className="grid gap-1.5 font-mono text-[11px] text-ink-2">
                      <li>· fixed dt = 1/60 s, max 8 steps / frame</li>
                      <li>· state = f(params, seed) — replayable forever</li>
                      <li>· logic has no DOM, no clock, no Math.random</li>
                      <li>· {sim.world.w}×{sim.world.h} logical world, HiDPI scaled</li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sim.meta.tags.map((tag) => (
                      <a
                        key={tag}
                        href={`#/?q=${encodeURIComponent(tag)}`}
                        className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
                      >
                        #{tag}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* related */}
      <div className="mt-10 border-t border-line pt-6">
        <div className="flex items-center justify-between gap-4">
          <Kicker>same contract, different model</Kicker>
          <a href="#/" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-2 transition-colors hover:text-accent">
            all simulations <IconArrow className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      <p className="mt-3 font-mono text-[11px] text-ink-3">
        theme: {theme} · contract v1 · every sim on this page arrived through a dynamic import()
      </p>
    </main>
  );
}

/* ------------------------------------------------------------------ *
 * Loading / failure states
 * ------------------------------------------------------------------ */
function SimPage({ entry, query }: { entry: SimEntry; query: URLSearchParams }) {
  const [sim, setSim] = useState<AnySimulation | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSim(null);
    setFailed(false);
    entry
      .load()
      .then((mod) => {
        if (alive) setSim(mod.default);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [entry]);

  if (failed) {
    return (
      <main className="relative z-10 mx-auto max-w-xl px-5 py-24 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">chunk failed to load</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-ink">Couldn’t start {entry.meta.title}</h1>
        <a href="#/" className="mt-6 inline-flex items-center gap-2 rounded-lg border border-line-strong px-4 py-2.5 font-mono text-[11.5px] uppercase tracking-wider text-ink-2 hover:border-accent hover:text-accent">
          <IconBack className="h-4 w-4" /> back to hub
        </a>
      </main>
    );
  }

  if (!sim) {
    return (
      <main className="relative z-10 mx-auto max-w-5xl px-5 py-16">
        <div className="flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.18em] text-ink-3">
          <span className="spin-slow">◌</span> importing {entry.meta.id}…
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_368px]">
          <div className="panel aspect-[4/3] max-h-[70vh] animate-pulse rounded-xl" />
          <div className="panel h-72 animate-pulse rounded-xl" />
        </div>
      </main>
    );
  }

  return <SimSession key={entry.meta.id} sim={sim} initialQuery={query} />;
}

export default SimPage;
