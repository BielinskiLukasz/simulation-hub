import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { buildHash } from '../core/router';
import { decodeState, encodeState } from '../core/url-state';
import type { AnyBatch, BatchRunMeta, JobDefinition, ParamDef, ResultViewProps, SimEntry } from '../core/types';
import { workerTransport } from '../runtime/expose-worker';
import { AbortError, WorkerPool, defaultPoolSize } from '../runtime/worker-pool';
import { Controls } from './Controls';
import { ProgressBar } from './kpi';
import { Shortcuts, SimTitleRow, ToolButton, UrlBar } from './SimHeader';
import { IconBook, IconCheck, IconDice, IconLink, IconReset, IconSliders, Kicker, Rich } from './kit';

/** Inline fallback that still reports progress and yields to the event loop. */
async function runProgressive<P, C, Part, R>(
  job: JobDefinition<P, C, Part, R>,
  params: P,
  seed: number,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<R> {
  const chunks = job.plan(params, seed);
  const parts: Part[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (signal.aborted) throw new AbortError();
    parts.push(job.process(chunks[i]!));
    onProgress(i + 1, chunks.length);
    if (i % 3 === 2) await new Promise((r) => window.setTimeout(r, 0));
  }
  if (signal.aborted) throw new AbortError();
  return job.reduce(parts, params);
}

const isAbort = (err: unknown): boolean => err instanceof Error && err.name === 'AbortError';

export function BatchSession({
  sim,
  entry,
  initialQuery,
}: {
  sim: AnyBatch;
  entry: SimEntry;
  initialQuery: URLSearchParams;
}) {
  const decoded = useMemo(
    () => decodeState<Record<string, unknown>>(initialQuery, sim.defaultParams, sim.paramSchema),
    [sim, initialQuery],
  );
  const schema = sim.paramSchema as Record<string, ParamDef>;
  const View = sim.view as ComponentType<ResultViewProps<never, never>>;

  const [params, setParams] = useState<Record<string, unknown>>(decoded.params);
  const [seed, setSeed] = useState(decoded.seed);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [meta, setMeta] = useState<BatchRunMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'controls' | 'docs'>('controls');
  const [copied, setCopied] = useState(false);
  const [workersBlocked, setWorkersBlocked] = useState(false);

  const poolRef = useRef<WorkerPool | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const firstRun = useRef(true);

  const hash = useMemo(
    () => buildHash(sim.meta.id, encodeState(params as never, sim.defaultParams, seed)),
    [sim, params, seed],
  );

  useEffect(() => {
    window.history.replaceState(null, '', hash);
  }, [hash]);

  const recompute = useCallback(
    async (nextParams: Record<string, unknown>, nextSeed: number): Promise<void> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setBusy(true);
      setProgress(0);
      setError(null);
      const started = performance.now();

      try {
        // inside the try: a malformed plan() must surface as an error state,
        // not as an unhandled rejection
        const chunks = sim.job.plan(nextParams as never, nextSeed).length;
        let value: unknown;
        let executor: BatchRunMeta['executor'] = 'inline';

        if (sim.createWorker && !workersBlocked) {
          try {
            if (!poolRef.current) {
              poolRef.current = new WorkerPool(() => workerTransport(sim.createWorker!), defaultPoolSize());
            }
            value = await poolRef.current.run(sim.job, nextParams as never, nextSeed, {
              signal: controller.signal,
              onProgress: (done, total) => setProgress(total > 0 ? done / total : 0),
            });
            executor = 'workers';
          } catch (err) {
            if (isAbort(err)) throw err;
            // workers unavailable (single-file build, blocked by CSP, bad chunk URL) → inline
            poolRef.current?.dispose();
            poolRef.current = null;
            setWorkersBlocked(true);
            value = await runProgressive(sim.job, nextParams as never, nextSeed, (d, t) => setProgress(d / t), controller.signal);
          }
        } else {
          value = await runProgressive(sim.job, nextParams as never, nextSeed, (d, t) => setProgress(d / t), controller.signal);
        }

        if (controller.signal.aborted) return;
        setResult(value);
        setMeta({
          ms: performance.now() - started,
          chunks,
          executor,
          workers: poolRef.current?.workerCount,
        });
      } catch (err) {
        if (isAbort(err) || controller.signal.aborted) return; // superseded: keep the last good result
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          setProgress(0);
        }
      }
    },
    [sim, workersBlocked],
  );

  // debounced recompute; the URL updates immediately
  useEffect(() => {
    const delay = firstRun.current ? 0 : 200;
    firstRun.current = false;
    const t = window.setTimeout(() => {
      void recompute(params, seed);
    }, delay);
    return () => window.clearTimeout(t);
  }, [params, seed, recompute]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      poolRef.current?.dispose();
      poolRef.current = null;
    },
    [],
  );

  const onChange = useCallback((key: string, value: unknown) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const newSeed = useCallback(() => setSeed(Math.floor(Math.random() * 0x7fffffff)), []);

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    const done = (): void => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    try {
      void navigator.clipboard.writeText(url).then(done).catch(done);
    } catch {
      done();
    }
  }, [hash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === 'n' || e.key === 'N') newSeed();
      else if (e.key === 'c' || e.key === 'C') copyLink();
      else if (e.key === 'r' || e.key === 'R') void recompute(params, seed);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newSeed, copyLink, recompute, params, seed]);

  const status = result && meta ? (sim.summarize ? sim.summarize(result, meta) : `${meta.ms.toFixed(0)} ms`) : '—';

  return (
    <main id="main" className="relative z-10 mx-auto w-full max-w-[1640px] px-4 pt-5 pb-14 lg:px-6">
      <SimTitleRow
        sim={sim}
        kind="analysis"
        right={
          <>
            <ToolButton onClick={() => void recompute(params, seed)} label="Re-run the job (R)" disabled={busy}>
              <IconReset className="h-3.5 w-3.5" />
              re-run
            </ToolButton>
            <ToolButton onClick={newSeed} label="New random seed (N)">
              <IconDice className="h-3.5 w-3.5" />
              seed
            </ToolButton>
            <ToolButton onClick={copyLink} label="Copy shareable link (C)">
              {copied ? <IconCheck className="h-3.5 w-3.5 text-mint" /> : <IconLink className="h-3.5 w-3.5" />}
              {copied ? 'copied' : 'copy link'}
            </ToolButton>
          </>
        }
      />

      {sim.meta.disclaimer && (
        <p className="mt-4 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed" style={{ borderColor: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 10%, transparent)', color: 'var(--ink-2)' }}>
          <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--amber)' }}>
            disclaimer
          </span>
          {sim.meta.disclaimer}
        </p>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_368px]">
        <div className="min-w-0">
          <div className="panel mb-3 flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
              <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'live-dot bg-accent' : 'bg-mint'}`} />
              {busy ? 'computing' : 'ready'}
            </span>
            <span className="font-mono text-[11.5px] text-ink tnum">{status}</span>
            <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
              {meta?.executor === 'workers'
                ? `${meta.workers ?? defaultPoolSize()} workers`
                : workersBlocked
                  ? 'inline · workers unavailable'
                  : 'inline · main thread'}
            </span>
          </div>
          <ProgressBar value={progress} busy={busy} />

          {error && (
            <div className="mt-3 rounded-lg border px-3.5 py-2.5 font-mono text-[11.5px]" style={{ borderColor: 'var(--rose)', color: 'var(--rose)' }}>
              job failed: {error} — showing the last good result
            </div>
          )}

          <div className={`mt-4 transition-opacity duration-200 ${busy ? 'opacity-55' : 'opacity-100'}`}>
            <View
              {...({
                result,
                params,
                busy,
                progress,
                meta,
                error,
              } as ResultViewProps<never, never>)}
            />
          </div>
        </div>

        <aside className="min-w-0">
          <div className="panel sticky top-4 overflow-hidden rounded-xl xl:max-h-[calc(100vh-2rem)]">
            <div className="flex border-b border-line" role="tablist" aria-label="Simulation panels">
              {(
                [
                  ['controls', 'Inputs', <IconSliders key="a" className="h-3.5 w-3.5" />],
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
                        aria-label="Seed"
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          if (!Number.isNaN(n)) setSeed(Math.abs(n) % 0x7fffffff);
                        }}
                        className="w-28 text-right tnum"
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
                    Batch sims have no frame loop: inputs are debounced by 200 ms, the previous job is aborted, and
                    chunk count never depends on the CPU count — so one worker and sixteen give identical numbers.
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

      <div className="panel mt-5 overflow-hidden rounded-xl">
        <UrlBar hash={hash} note="synced" />
      </div>
      <Shortcuts items={[['n', 'new seed'], ['c', 'copy link'], ['r', 're-run']]} />
      <p className="mt-4 font-mono text-[11px] text-ink-3">
        {entry.kind} · contract v2 · job: plan → process (worker) → reduce in chunk order
      </p>
    </main>
  );
}
