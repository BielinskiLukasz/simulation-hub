import type { SimEntry } from '../core/types';
import { Kicker, Reveal } from './kit';

const LOOP_STEPS = ['tick(ts)', 'acc += dt·speed', 'step() ×N', 'render()'];
const JOB_STEPS = ['plan', 'chunk 0…N', 'process', 'reduce'];

/** Contract v2 in one screen: the two shapes of work, as live diagrams. */
export function Kinds({ entries }: { entries: SimEntry[] }) {
  const realtime = entries.filter((e) => e.kind === 'realtime');
  const batch = entries.filter((e) => e.kind === 'batch');

  return (
    <section id="kinds" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-12">
      <Reveal>
        <Kicker>contract v2 · two shapes of work</Kicker>
        <h2 className="mt-3 max-w-3xl font-display text-[clamp(1.8rem,3.6vw,2.7rem)] leading-[1.05] font-extrabold tracking-[-0.02em] text-ink">
          One manifest. A frame loop and a job queue.
        </h2>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">
          A Monte Carlo run has no frames, and a flock of 10,000 boids has nothing to reduce. Phase 1 asked one shape
          to do both; v2 splits them and lets the shell dispatch on{' '}
          <code className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-accent">
            kind
          </code>
          .
        </p>
      </Reveal>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Reveal delay={60} className="h-full">
          <div className="panel brackets flex h-full flex-col rounded-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ borderColor: 'var(--mint)', color: 'var(--mint)' }}
              >
                <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--mint)' }} />
                kind: realtime
              </span>
              <span className="font-mono text-[10.5px] text-ink-3 tnum">{realtime.length} sims</span>
            </div>

            <h3 className="mt-4 font-display text-[22px] leading-tight font-extrabold text-ink">Loop driven</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              The runner accumulates real frame time and emits whole fixed steps, so a 144 Hz display and a throttled
              laptop simulate identically.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              {LOOP_STEPS.map((label, i) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span
                    className="rail-chip rounded-md border bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-ink-2"
                    style={{ ['--i' as string]: i }}
                  >
                    {label}
                  </span>
                  {i < LOOP_STEPS.length - 1 && <span className="text-ink-3">→</span>}
                </span>
              ))}
              <svg viewBox="0 0 34 16" className="ml-1 h-4 w-8 text-accent" aria-hidden="true">
                <path d="M2 14 C 14 14, 20 2, 32 2" fill="none" stroke="currentColor" strokeWidth="1.4" className="dash-run" />
                <path d="M28 0 L33 2 L28 5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </div>

            <ul className="mt-5 grid gap-1.5 border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-ink-2">
              <li>· dt fixed at 1/60 s, at most 8 steps per frame</li>
              <li>· pointer input lands on a step boundary, never mid-integration</li>
              <li>
                · <span style={{ color: 'var(--mint)' }}>live</span> params patch state in place; the rest re-init from
                the same seed
              </li>
            </ul>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {realtime.map((e) => (
                <a
                  key={e.meta.id}
                  href={`#/sim/${e.meta.id}`}
                  className="rounded border border-line px-2 py-1 font-mono text-[10.5px] text-ink-3 transition-colors hover:border-mint hover:text-mint"
                >
                  {e.meta.thumbnail} {e.meta.id}
                </a>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={140} className="h-full">
          <div className="panel brackets flex h-full flex-col rounded-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                kind: batch
              </span>
              <span className="font-mono text-[10.5px] text-ink-3 tnum">{batch.length} sims</span>
            </div>

            <h3 className="mt-4 font-display text-[22px] leading-tight font-extrabold text-ink">Job driven</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              Plan fixed chunks, process them anywhere, reduce them in index order. No frame loop, no canvas — and
              nothing Monte-Carlo-specific in the runtime.
            </p>

            <div className="relative mt-6 mb-2 h-9 overflow-hidden rounded-md border border-line bg-surface-2">
              <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="flow-dot"
                  style={{ ['--delay' as string]: `${i * 0.55}s`, ['--dur' as string]: '2.9s' }}
                />
              ))}
              <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-surface px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
                plan
              </span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-surface px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
                reduce
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {JOB_STEPS.map((label, i) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-ink-2">
                    {label}
                  </span>
                  {i < JOB_STEPS.length - 1 && <span className="text-ink-3">→</span>}
                </span>
              ))}
            </div>

            <ul className="mt-5 grid gap-1.5 border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-ink-2">
              <li>· chunk size is a constant — never derived from the CPU count</li>
              <li>
                · chunk <span className="text-accent">i</span> runs on deriveSeed(seed, i), its own RNG stream
              </li>
              <li>· abort + supersede on every slider, progress per chunk, inline fallback</li>
            </ul>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {batch.map((e) => (
                <a
                  key={e.meta.id}
                  href={`#/sim/${e.meta.id}`}
                  className="rounded border border-line px-2 py-1 font-mono text-[10.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
                >
                  {e.meta.thumbnail} {e.meta.id}
                </a>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
