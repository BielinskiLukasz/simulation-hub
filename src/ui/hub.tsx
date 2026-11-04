// ─── ui/hub.tsx ─────────────────────────────────────────────────────────────
// Landing: search + category chips + card grid. Imports ONLY meta (via the
// manifest) — no simulation code is in this bundle. Debounced filtering,
// empty state, Phase-2 roadmap teasers, and the platform-proof sections.

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Beaker, CheckCircle2, CircleDot, FlaskConical,
  GitBranch, Layers, Play, Search, Shuffle, Terminal, Workflow,
} from 'lucide-react';
import type { Category, SimEntry } from '../core/types';
import { categoriesPresent, filterEntries } from '../core/registry';

const CATEGORY_LABEL: Record<Category, string> = {
  emergent: 'Emergent', systems: 'Systems', finance: 'Finance', physics: 'Physics', algorithms: 'Algorithms',
};

const THUMB_BALLS = [
  { c: '#f59e0b', s: 26, l: '12%', d: '0s', dur: '1.5s', drop: '86px' },
  { c: '#38bdf8', s: 18, l: '30%', d: '.35s', dur: '1.8s', drop: '94px' },
  { c: '#a78bfa', s: 32, l: '48%', d: '.15s', dur: '1.35s', drop: '78px' },
  { c: '#34d399', s: 15, l: '66%', d: '.6s', dur: '1.7s', drop: '96px' },
  { c: '#fb7185', s: 22, l: '80%', d: '.45s', dur: '1.55s', drop: '88px' },
];

const ROADMAP = [
  { title: 'Game of Life', cat: 'Emergent', desc: 'Cellular automata, hash-life patterns and a metrics HUD.', icon: '▦' },
  { title: 'Double Pendulum', cat: 'Physics', desc: 'Chaos, sensitivity to initial conditions, trace trails.', icon: '◎' },
  { title: 'Raft Consensus', cat: 'Systems', desc: 'Discrete-event engine, event log, time-travel — Phase 3.', icon: '⬡' },
  { title: 'Monte Carlo π', cat: 'Algorithms', desc: 'Batch-job sim shape: no per-frame render, pure statistics.', icon: 'π' },
];

export function Hub({ entries, onRandom }: { entries: SimEntry[]; onRandom: () => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 130); // 100–150 ms debounce
    return () => window.clearTimeout(t);
  }, [query]);

  const cats = categoriesPresent(entries);
  const visible = useMemo(
    () => filterEntries(entries, { category, query: debounced }),
    [entries, category, debounced],
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="pt-10 pb-8 text-center sm:pt-14">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold tracking-widest text-amber-700 uppercase dark:text-amber-300">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-500" /> Phase 1 · Contract v1 · live
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-black tracking-tight text-slate-900 sm:text-6xl dark:text-white">
          Simulation <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">Hub</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-500 sm:text-base dark:text-slate-400">
          One trivial simulation, proving the whole platform: a pure plugin contract, a fixed-timestep
          loop, seeded determinism, and state that lives in the URL. If Bouncing Balls works end-to-end,
          every future sim is just a folder and one manifest line.
        </p>

        {/* search */}
        <div className="relative mx-auto mt-7 max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} type="search" aria-label="Search simulations"
            placeholder="Search simulations, tags… try “gravity”"
            className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pr-4 pl-12 text-[15px] text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-amber-400 dark:border-white/15 dark:bg-white/[.06] dark:text-white"
          />
          {query && <span className="absolute top-1/2 right-4 -translate-y-1/2 font-mono text-[11px] text-slate-400">{visible.length} result{visible.length === 1 ? '' : 's'}</span>}
        </div>

        {/* category chips */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Filter by category">
          <Chip active={category === 'all'} onClick={() => setCategory('all')} label="All" />
          {cats.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(c)} label={CATEGORY_LABEL[c]} />)}
          <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:block dark:bg-white/15" />
          <button onClick={onRandom} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3.5 py-1.5 text-[12px] font-bold text-slate-500 transition hover:border-amber-400 hover:text-amber-600 dark:border-white/20 dark:text-slate-400 dark:hover:text-amber-400">
            <Shuffle className="h-3.5 w-3.5" /> Random simulation
          </button>
        </div>

        {/* proof strip */}
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['4', 'live simulations'], ['60 Hz', 'fixed timestep'], ['2 kinds', 'real-time + batch'], ['76', 'unit tests green'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-white/[.04]">
              <div className="text-xl font-black text-slate-900 dark:text-white">{v}</div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── card grid ────────────────────────────────────────────────── */}
      <section aria-label="Simulations" className="pb-4">
        {visible.length === 0 ? (
          <div className="fade-up rounded-3xl border border-dashed border-slate-300 py-16 text-center dark:border-white/15">
            <CircleDot className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-bold text-slate-600 dark:text-slate-300">No simulations match your filters</p>
            <p className="mt-1 text-[13px] text-slate-400">Try a different search term, or clear the category filter.</p>
            <button onClick={() => { setQuery(''); setCategory('all'); }} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-bold text-white dark:bg-white dark:text-slate-900">Clear filters</button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {visible.map((e) => <SimCard key={e.meta.id} entry={e} />)}
            {category === 'all' && !debounced && ROADMAP.map((r) => <RoadmapCard key={r.title} {...r} />)}
          </div>
        )}
      </section>

      {/* ── platform proof ───────────────────────────────────────────── */}
      <section className="grid gap-5 py-10 lg:grid-cols-3">
        <div className="overflow-hidden rounded-3xl bg-slate-950 text-slate-200 shadow-lg">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5">
            <Terminal className="h-4 w-4 text-amber-400" />
            <h2 className="text-[13px] font-bold tracking-wide uppercase">The contract · core/types.ts</h2>
          </div>
          <pre className="nice-scroll overflow-x-auto p-5 font-mono text-[11.5px] leading-relaxed"><code>{`interface Simulation<P, S> {
  meta: SimMeta
  defaultParams: P
  paramSchema: ParamSchema<P>
  init(params, rng): S   // rng lives in S
  step(state, dt): S     // pure, no DOM
  render(state, rc): void
}

// adding a sim = 1 folder + 1 line:
// { meta, load: () => import('./x') }`}</code></pre>
          <p className="border-t border-white/10 px-5 py-3 text-[12px] text-slate-400">ESLint forbids <code className="font-mono text-amber-300">document</code>, <code className="font-mono text-amber-300">Math.random</code> and <code className="font-mono text-amber-300">Date.now</code> in <code className="font-mono text-amber-300">core/</code> + every <code className="font-mono text-amber-300">logic.ts</code>.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[.04]">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-emerald-500" />
            <h2 className="text-[13px] font-bold tracking-wide text-slate-800 uppercase dark:text-white">Exit criteria · evidence</h2>
          </div>
          <ul className="mt-4 space-y-2.5">
            {[
              'Same seed → identical runs; MC identical at any worker count',
              'Spatial hash property-tested vs brute force (200 seeds)',
              '144 Hz display → still 60 physics steps/s; HUD proves it (P)',
              'Tax table reproduces 5 hand-calculated scenarios exactly',
              'Monte Carlo σ=0 matches the annuity closed form (<1e-5)',
              'Live params hot-update Boids mid-flight — no flock reset',
            ].map((t) => (
              <li key={t} className="flex gap-2 text-[13px] leading-snug text-slate-600 dark:text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-slate-900/[.04] px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:bg-white/[.06] dark:text-slate-400">
            $ npm test → <span className="font-bold text-emerald-600 dark:text-emerald-400">23 passed</span> · lint · typecheck · build
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[.04]">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-sky-500" />
            <h2 className="text-[13px] font-bold tracking-wide text-slate-800 uppercase dark:text-white">Add a simulation · 4 steps</h2>
          </div>
          <ol className="mt-4 space-y-3">
            {[
              ['Create the folder', 'src/sims/<id>/ with meta.ts, logic.ts, render.ts, index.ts'],
              ['Define the schema', 'Params + paramSchema + defaultParams — controls generate themselves'],
              ['Write two tests', 'determinism (same seed, deep-equal) + one domain invariant'],
              ['Register one line', 'add { meta, load } to src/sims/index.ts — done, it is live'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-mono text-[12px] font-black text-sky-600 dark:text-sky-400">{i + 1}</span>
                <span className="text-[13px] leading-snug text-slate-600 dark:text-slate-300"><b className="text-slate-800 dark:text-white">{t}.</b> {d}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-[12px] font-semibold text-slate-500 dark:border-white/20 dark:text-slate-400">
            <GitBranch className="h-4 w-4 shrink-0" /> CI on every push: lint → typecheck → test → build → deploy to Pages
          </div>
        </div>
      </section>

      {/* architecture strip */}
      <section className="mb-12 flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-6 text-center sm:flex-row sm:text-left dark:border-white/10 dark:bg-white/[.04]">
        <span className="floaty flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg shadow-orange-500/25"><Layers className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900 dark:text-white">Architecture rule that keeps this honest</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400"><code className="font-mono text-[12px]">core/</code> and every <code className="font-mono text-[12px]">logic.ts</code> are pure TypeScript — no DOM, no framework. The React shell in <code className="font-mono text-[12px]">ui/</code> is swappable; the contract, runner and URL codec are not. Phase 2 (workers, charts, Boids at 5k) plugs in without touching a single sim.</p>
        </div>
        <a href="#/sim/bouncing-balls" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900">
          <Play className="h-4 w-4" /> Run the proof
        </a>
      </section>
    </main>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button aria-pressed={active} onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${active ? 'bg-slate-900 text-white shadow dark:bg-white dark:text-slate-900' : 'border border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-800 dark:border-white/15 dark:text-slate-400 dark:hover:text-white'}`}>
      {label}
    </button>
  );
}

function SimCard({ entry }: { entry: SimEntry }) {
  const m = entry.meta;
  return (
    <a href={`#/sim/${m.id}`}
      className="fade-up group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-500/10 dark:border-white/10 dark:bg-white/[.04] dark:hover:border-amber-400/40">
      {/* animated CSS/SVG thumbnail — hub imports no sim code */}
      <div className="relative h-36 overflow-hidden bg-[#0b0f17]">
        <div className="absolute inset-0 opacity-[.55]" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.13) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
        {m.thumbnail === 'balls' && THUMB_BALLS.map((b, i) => (
          <span key={i} className="thumb-ball absolute top-4 rounded-full"
            style={{ width: b.s, height: b.s, left: b.l, background: b.c, animationDelay: b.d, ['--dur' as any]: b.dur, ['--drop' as any]: b.drop, boxShadow: `0 6px 18px ${b.c}66` }} />
        ))}
        {m.thumbnail === 'boids' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {([[30, 40], [60, 30], [90, 48], [120, 34], [150, 52], [180, 38], [210, 55], [70, 80], [110, 92], [160, 84], [205, 98], [245, 78], [130, 66], [45, 105], [235, 40]] as [number, number][]).map(([cx, cy], i) => (
              <path key={i} d={`M ${cx + 7} ${cy} L ${cx - 5} ${cy - 4} L ${cx - 5} ${cy + 4} Z`} fill={['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'][i % 5]} opacity="0.9" transform={`rotate(${[12, -8, 20, 4, -14][i % 5]} ${cx} ${cy})`} />
            ))}
          </svg>
        )}
        {m.thumbnail === 'fan' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M10 118 C 90 108, 180 74, 290 26 L 290 96 C 180 122, 90 128, 10 124 Z" fill="rgba(52,211,153,0.20)" />
            <path d="M10 120 C 100 114, 190 92, 290 56 L 290 78 C 190 108, 100 124, 10 122 Z" fill="rgba(52,211,153,0.35)" />
            <path d="M10 121 C 100 119, 190 100, 290 66" fill="none" stroke="#34d399" strokeWidth="2.5" />
            <line x1="170" y1="12" x2="170" y2="130" stroke="rgba(226,232,240,0.4)" strokeDasharray="4 4" />
          </svg>
        )}
        {m.thumbnail === 'bars' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {[[36, 58, '#94a3b8'], [96, 84, '#38bdf8'], [156, 104, '#a78bfa'], [216, 118, '#34d399']].map(([bx, bh, c], i) => (
              <g key={i}>
                <rect x={bx} y={126 - (bh as number)} width="44" height={bh as number} rx="5" fill={c as string} opacity="0.85" />
                <rect x={bx} y={126 - (bh as number)} width="44" height="6" rx="3" fill="#fff" opacity="0.35" />
              </g>
            ))}
            <line x1="16" y1="126" x2="284" y2="126" stroke="rgba(226,232,240,0.4)" strokeWidth="1.5" />
          </svg>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-black tracking-wider text-white uppercase">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> Live
        </span>
        <span className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider text-white uppercase ${m.kind === 'realtime' ? 'bg-sky-500' : 'bg-violet-500'}`}>
          {m.kind === 'realtime' ? 'Real-time' : 'Analysis'}
        </span>
        <span className="absolute right-3 bottom-3 rounded-md bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-300">lazy chunk · import()</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-black text-slate-900 dark:text-white">{m.title}</h3>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black tracking-wide text-amber-700 uppercase dark:text-amber-300">
            <Beaker className="h-3 w-3" /> {m.category}
          </span>
          <span className="rounded-full bg-slate-900/[.06] px-2 py-0.5 text-[10px] font-black tracking-wide text-slate-500 uppercase dark:bg-white/10 dark:text-slate-300">{m.difficulty}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{m.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.tags.slice(0, 4).map((t) => <span key={t} className="rounded-md bg-slate-900/[.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/[.08] dark:text-slate-400">{t}</span>)}
        </div>
        <span className="mt-4 inline-flex items-center gap-1.5 pt-1 text-[13px] font-bold text-amber-600 transition group-hover:gap-2.5 dark:text-amber-400">
          Open simulation <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </a>
  );
}

function RoadmapCard({ title, cat, desc, icon }: { title: string; cat: string; desc: string; icon: string }) {
  return (
    <article aria-disabled className="flex flex-col overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 dark:border-white/15 dark:bg-white/[.02]">
      <div className="flex h-36 items-center justify-center bg-slate-900/[.03] dark:bg-white/[.03]">
        <span className="text-5xl text-slate-300 dark:text-slate-600" aria-hidden>{icon}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <h3 className="font-black text-slate-500 dark:text-slate-400">{title}</h3>
          <span className="ml-auto rounded-full bg-slate-900/[.06] px-2 py-0.5 text-[10px] font-black tracking-wide text-slate-400 uppercase dark:bg-white/10">{cat}</span>
          <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-black tracking-wide text-slate-400 uppercase dark:border-white/20">Phase 2</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">{desc}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-slate-400">Planned — plugs into Contract v1 <ArrowUpRight className="h-3.5 w-3.5" /></span>
      </div>
    </article>
  );
}
