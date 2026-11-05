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

// Compare Mode is no longer a teaser: trace sims (Pathfinding, Cache) have
// in-page compare, and realtime sims (N-Body, Cloth, Ecosystem) have a
// lockstep Compare button in their toolbar. Only genuinely future work stays.
const ROADMAP = [
  { title: 'City Growth & Scenarios', cat: 'Emergent', desc: 'WebGL overlays, named scenarios with "Try this" cards.', icon: '◫', phase: 'Phase 7' },
  { title: 'Supply Chain & Factory', cat: 'Systems', desc: 'Little’s law with CIs, belts, buffers, bottleneck highlighting.', icon: '⇥', phase: 'Phase 7' },
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
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-500" /> Phase 3 · Contract v3 · live
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-black tracking-tight text-slate-900 sm:text-6xl dark:text-white">
          Simulation <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">Hub</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-500 sm:text-base dark:text-slate-400">
          Fourteen simulations over three execution engines (real-time, batch, discrete-event):
          Time-Travel Debugger studio, CPU scheduling, Raft consensus with fault injection, JVM garbage collection,
          Monte Carlo with Web Workers, Boids flocking, and chaos physics — all seeded and deterministic.
        </p>

        {/* search */}
        <div className="relative mx-auto mt-7 max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} type="search" aria-label="Search simulations"
            placeholder="Search simulations, tags… try “time-travel” or “raft”"
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
            ['21', 'live simulations'], ['4 kinds', 'realtime, batch, event, trace'], ['Time-Travel', 'scrub, seek & branch'], ['295', 'unit tests green'],
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
        {m.thumbnail === 'life' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {([[0,0],[1,0],[0,1],[1,1],[4,1],[5,2],[3,3],[4,3],[5,3],[8,0],[9,0],[8,1],[9,1]] as [number, number][]).map(([cx, cy], i) => (
              <rect key={i} x={26 + cx * 26} y={22 + cy * 26} width="22" height="22" rx="4" fill={i % 3 === 0 ? '#4ade80' : i % 3 === 1 ? '#22c55e' : '#86efac'} opacity="0.9" />
            ))}
            <path d="M 210 118 l 12 -8 l 2 10 l 10 2 l -9 6 l 3 10 l -11 -6 l -9 6 l 2 -11 Z" fill="#bbf7d0" opacity="0.85" />
          </svg>
        )}
        {m.thumbnail === 'pendulum' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M60 118 A 105 105 0 0 1 240 30" fill="none" stroke="rgba(251,113,133,0.35)" strokeWidth="10" strokeLinecap="round" />
            <line x1="150" y1="18" x2="196" y2="86" stroke="#e2e8f0" strokeWidth="3" />
            <line x1="196" y1="86" x2="238" y2="66" stroke="#e2e8f0" strokeWidth="3" />
            <circle cx="150" cy="18" r="5" fill="#f8fafc" />
            <circle cx="196" cy="86" r="9" fill="#fb7185" />
            <circle cx="238" cy="66" r="7" fill="#f43f5e" />
            <path d="M238 66 q 26 10 18 34 q -6 18 -26 16" fill="none" stroke="rgba(251,113,133,0.6)" strokeWidth="2" strokeDasharray="3 4" />
          </svg>
        )}
        {m.thumbnail === 'raft' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {([[150, 26], [218, 66], [196, 122], [104, 122], [82, 66]] as [number, number][]).map(([cx, cy], i) => (
              <g key={i}>
                <circle cx={cx} cy={cy} r="17" fill={i === 0 ? '#f59e0b' : '#38bdf8'} opacity="0.92" />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#0b0f17" fontFamily="monospace">N{i}</text>
              </g>
            ))}
            <circle cx="184" cy="46" r="3.5" fill="#fbbf24" />
            <circle cx="128" cy="96" r="3.5" fill="#34d399" />
            <circle cx="160" cy="116" r="3.5" fill="#fb7185" />
          </svg>
        )}
        {m.thumbnail === 'pi' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <rect x="86" y="14" width="128" height="116" fill="none" stroke="rgba(226,232,240,0.55)" strokeWidth="2" />
            <circle cx="86" cy="130" r="128" fill="rgba(56,189,248,0.16)" stroke="#38bdf8" strokeWidth="2" />
            {([[110, 40], [150, 70], [190, 36], [128, 104], [176, 112], [204, 92], [98, 76], [160, 22]] as [number, number][]).map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="3.4" fill={i % 3 === 0 ? '#f59e0b' : '#7dd3fc'} />
            ))}
            <text x="238" y="76" fontSize="34" fill="#e2e8f0" fontFamily="serif" fontStyle="italic">π</text>
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
        {m.thumbnail === 'cpu' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <rect x="80" y="24" width="140" height="96" rx="10" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
            <rect x="110" y="44" width="80" height="56" rx="6" fill="rgba(56,189,248,0.25)" stroke="#38bdf8" strokeWidth="1.5" />
            <text x="150" y="78" textAnchor="middle" fontSize="16" fontWeight="900" fill="#38bdf8" fontFamily="monospace">CPU</text>
            {[-2, -1, 0, 1, 2].map((i) => (
              <g key={i}>
                <line x1={150 + i * 20} y1="12" x2={150 + i * 20} y2="24" stroke="#38bdf8" strokeWidth="2" />
                <line x1={150 + i * 20} y1="120" x2={150 + i * 20} y2="132" stroke="#38bdf8" strokeWidth="2" />
              </g>
            ))}
          </svg>
        )}
        {m.thumbnail === 'gc' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {([[0,0,'#22c55e'],[1,0,'#22c55e'],[2,0,'#15803d'],[3,0,'#15803d'],[4,0,'#2563eb'],[5,0,'#2563eb'],[6,0,'#2563eb'],[7,0,'#2563eb'],
               [0,1,'#22c55e'],[1,1,'#22c55e'],[2,1,'#15803d'],[3,1,'#c026d3'],[4,1,'#c026d3'],[5,1,'#2563eb'],[6,1,'#2563eb'],[7,1,'#2563eb'],
               [0,2,'#22c55e'],[1,2,'#22c55e'],[2,2,'#15803d'],[3,2,'#c026d3'],[4,2,'#c026d3'],[5,2,'#2563eb'],[6,2,'#2563eb'],[7,2,'#2563eb']] as [number, number, string][]).map(([gx, gy, col], i) => (
              <rect key={i} x={38 + gx * 28} y={28 + gy * 30} width="22" height="24" rx="4" fill={col} opacity="0.88" />
            ))}
            <line x1="148" y1="20" x2="148" y2="124" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3 3" />
          </svg>
        )}
        {m.thumbnail === 'debugger' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <line x1="30" y1="74" x2="270" y2="74" stroke="rgba(244,63,94,0.4)" strokeWidth="4" strokeLinecap="round" />
            <path d="M 120 74 Q 150 38 210 38 L 270 38" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4 4" />
            <circle cx="120" cy="74" r="6" fill="#f43f5e" />
            <text x="120" y="94" textAnchor="middle" fontSize="9" fontWeight="800" fill="#f43f5e" fontFamily="monospace">BRANCH</text>
            {[48, 84, 120, 165, 210, 255].map((cx, i) => (
              <g key={i}>
                <circle cx={cx} cy={74} r={cx === 165 ? 7 : 4} fill={cx === 165 ? '#38bdf8' : '#e2e8f0'} />
                {cx === 165 && <line x1="165" y1="20" x2="165" y2="124" stroke="#38bdf8" strokeWidth="2" strokeDasharray="2 3" />}
              </g>
            ))}
            <path d="M 64 36 L 48 48 L 64 60 Z M 82 36 L 66 48 L 82 60 Z" fill="#f43f5e" opacity="0.85" />
            <text x="212" y="30" fontSize="10" fontWeight="700" fill="#f59e0b" fontFamily="monospace">ALT FUTURE</text>
          </svg>
        )}
        {m.thumbnail === 'path' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <rect key={i} x={(i % 6) * 44 + 18} y={Math.floor(i / 6) * 58 + 20} width="40" height="54" rx="3" fill="#0f172a" stroke="rgba(148,163,184,0.25)" />
            ))}
            {[[38,42],[82,42],[126,42],[170,42],[214,42],[258,42],[258,96],[214,96],[170,96],[126,96],[82,96],[38,96]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r="4" fill={i < 8 ? '#a78bfa' : '#f59e0b'} />
            ))}
            <circle cx="38" cy="42" r="8" fill="#22c55e" /><text x="38" y="45" textAnchor="middle" fontSize="9" fontWeight="900" fill="#052e16">S</text>
            <circle cx="258" cy="96" r="8" fill="#f43f5e" /><text x="258" y="99" textAnchor="middle" fontSize="9" fontWeight="900" fill="#fff1f2">G</text>
          </svg>
        )}
        {m.thumbnail === 'sand' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <rect x="70" y="10" width="160" height="120" rx="6" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
            <path d="M95 22 H205 L175 66 H125 Z" fill="#fbbf24" opacity="0.9" />
            <path d="M125 66 H175 L205 120 H95 Z" fill="#fbbf24" opacity="0.55" />
            <rect x="150" y="112" width="24" height="8" fill="#64748b" />
            <circle cx="120" cy="100" r="3" fill="#60a5fa" /><circle cx="180" cy="92" r="3" fill="#60a5fa" />
            <circle cx="140" cy="108" r="2.5" fill="#ef4444" /><circle cx="196" cy="30" r="2" fill="#bfdbfe" />
          </svg>
        )}
        {m.thumbnail === 'cache' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => {
              const row = Math.floor(i / 4);
              const col = i % 4;
              const hit = (row + col * 2) % 3 !== 0;
              return <rect key={i} x={40 + col * 34 + Math.floor(row / 2) * 130} y={20 + (row % 2) * 54} width="30" height="50" rx="4" fill={hit ? '#22c55e' : '#ef4444'} opacity={0.35 + ((i * 37) % 60) / 100} />;
            })}
            <text x="40" y="140" fontSize="10" fill="#94a3b8" fontFamily="monospace">row-major 93.75%</text>
            <text x="170" y="140" fontSize="10" fill="#94a3b8" fontFamily="monospace">col-major 0%</text>
            <line x1="155" y1="16" x2="155" y2="120" stroke="rgba(148,163,184,0.4)" strokeDasharray="3 3" />
          </svg>
        )}
        {m.thumbnail === 'nbody' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <ellipse cx="150" cy="72" rx="105" ry="48" fill="none" stroke="rgba(56,189,248,0.35)" strokeWidth="1.5" strokeDasharray="3 4" />
            <circle cx="150" cy="72" r="12" fill="#fbbf24" />
            {([[70,50],[105,38],[196,44],[232,76],[188,108],[96,104]] as [number,number][]).map(([x,y],i) => <circle key={i} cx={x} cy={y} r={i%2?4:6} fill={['#38bdf8','#22d3ee','#fb7185','#a78bfa','#34d399','#f59e0b'][i]} />)}
            <path d="M70 50 Q110 90 150 72 T232 76" fill="none" stroke="rgba(125,211,252,0.4)" strokeWidth="2" />
          </svg>
        )}
        {m.thumbnail === 'cloth' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({length:6}).map((_,r) => Array.from({length:9}).map((_,c) => <circle key={`${r}-${c}`} cx={62+c*22} cy={24+r*18} r="3" fill={r===0?'#f43f5e':'#34d399'} />))}
            {Array.from({length:5}).map((_,r) => <path key={r} d={`M62 ${24+r*18} Q150 ${54+r*18} 238 ${24+r*18}`} fill="none" stroke="#34d399" strokeWidth="1.6" opacity="0.75" />)}
            <path d="M62 114 Q150 132 238 114" fill="none" stroke="#38bdf8" strokeWidth="2" />
          </svg>
        )}
        {m.thumbnail === 'circuit' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M62 44 H118 M62 92 H118 M158 68 H214" stroke="#22c55e" strokeWidth="3" />
            <path d="M118 44 V92 M182 68 V112 H214" fill="none" stroke="#64748b" strokeWidth="2" />
            <rect x="118" y="50" width="42" height="36" rx="6" fill="#111c2b" stroke="#e2e8f0" strokeWidth="1.5" />
            <text x="139" y="72" textAnchor="middle" fontSize="10" fontWeight="800" fill="#e2e8f0">XOR</text>
            <circle cx="228" cy="68" r="11" fill="#facc15" /><text x="228" y="72" textAnchor="middle" fontSize="9" fontWeight="900" fill="#713f12">S</text>
            <rect x="30" y="36" width="32" height="16" rx="4" fill="#1e293b" stroke="#94a3b8" /><text x="46" y="47" textAnchor="middle" fontSize="9" fill="#e2e8f0">A=1</text>
            <rect x="30" y="84" width="32" height="16" rx="4" fill="#1e293b" stroke="#94a3b8" /><text x="46" y="95" textAnchor="middle" fontSize="9" fill="#e2e8f0">B=0</text>
          </svg>
        )}
        {m.thumbnail === 'ecosystem' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <rect x="18" y="14" width="264" height="116" rx="8" fill="#06120c" stroke="rgba(74,222,128,0.25)" />
            {[[42,40],[66,88],[96,54],[120,104],[150,76],[180,46],[204,96],[232,62],[256,110],[82,120]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3.2 : 2.4} fill="#4ade80" opacity="0.9" />
            ))}
            {[[110,40],[160,110],[220,34],[70,58],[246,86]].map(([x,y],i) => (
              <circle key={`h${i}`} cx={x} cy={y} r="4" fill="#38bdf8" />
            ))}
            <circle cx="190" cy="76" r="5.5" fill="#f43f5e" />
            <circle cx="76" cy="98" r="5.5" fill="#f43f5e" />
            <path d="M190 76 L160 110 M76 98 L70 58" stroke="rgba(244,63,94,0.5)" strokeWidth="1.2" strokeDasharray="3 3" />
            <ellipse cx="196" cy="78" rx="34" ry="26" fill="rgba(244,63,94,0.08)" />
            <ellipse cx="84" cy="92" rx="30" ry="22" fill="rgba(56,189,248,0.10)" />
          </svg>
        )}
        {m.thumbnail === 'epidemic' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({ length: 44 }).map((_, i) => {
              const ang = (i / 44) * Math.PI * 2;
              const x = 150 + Math.cos(ang) * 52; const y = 72 + Math.sin(ang) * 46;
              const status = i % 9 === 0 ? '#ef4444' : i % 5 === 0 ? '#22c55e' : i % 11 === 0 ? '#38bdf8' : '#475569';
              return <circle key={i} cx={x} cy={y} r={i % 9 === 0 ? 4 : 2.6} fill={status} />;
            })}
            <circle cx="150" cy="72" r="62" fill="none" stroke="rgba(251,113,133,0.25)" strokeWidth="1" />
            <text x="150" y="76" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fb7185" fontFamily="monospace">R₀</text>
          </svg>
        )}
        {m.thumbnail === 'market' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M18 42 L60 40 L100 46 L126 44 L146 50 L168 48 L188 54 L206 52 L220 90 L232 104 L248 96 L266 74 L286 62" fill="none" stroke="#f43f5e" strokeWidth="2.4" />
            {[0,1,2,3].map((i) => (
              <g key={i}>
                <rect x={210} y={16 + i * 12} width={62 - i * 10} height="8" rx="2" fill="rgba(244,63,94,0.35)" />
                <rect x={210} y={82 + i * 12} width={40 + i * 12} height="8" rx="2" fill="rgba(34,197,94,0.35)" />
              </g>
            ))}
            <text x="18" y="132" fontSize="9" fill="#94a3b8" fontFamily="monospace">flash crash · liquidity withdrawn</text>
          </svg>
        )}
        {m.thumbnail === 'traffic' && (
          <svg viewBox="0 0 300 144" className="absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({ length: 16 }).map((_, r) => Array.from({ length: 22 }).map((_, c) => {
              const band = Math.abs(((c + r * 0.9) % 22) - 6) < 2;
              return <rect key={`${r}-${c}`} x={28 + c * 11} y={14 + r * 7} width="10" height="6" fill={band ? '#ef4444' : `hsl(${90 + r * 4} 65% ${band ? 45 : 45}%)`} opacity={band ? 0.9 : 0.55} />;
            }))}
            <path d="M 232 118 L 216 104" stroke="#f8fafc" strokeWidth="2" />
            <text x="28" y="136" fontSize="9" fill="#94a3b8" fontFamily="monospace">space-time: jams slope backwards</text>
          </svg>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-black tracking-wider text-white uppercase">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> Live
        </span>
        <span className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider text-white uppercase ${m.kind === 'realtime' ? 'bg-sky-500' : m.kind === 'event' ? 'bg-rose-500' : m.kind === 'trace' ? 'bg-violet-500' : 'bg-emerald-500'}`}>
          {m.kind === 'realtime' ? 'Real-time' : m.kind === 'event' ? 'Event' : m.kind === 'trace' ? 'Trace' : 'Analysis'}
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

function RoadmapCard({ title, cat, desc, icon, phase }: { title: string; cat: string; desc: string; icon: string; phase: string }) {
  return (
    <article aria-disabled className="flex flex-col overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 dark:border-white/15 dark:bg-white/[.02]">
      <div className="flex h-36 items-center justify-center bg-slate-900/[.03] dark:bg-white/[.03]">
        <span className="text-5xl text-slate-300 dark:text-slate-600" aria-hidden>{icon}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <h3 className="font-black text-slate-500 dark:text-slate-400">{title}</h3>
          <span className="ml-auto rounded-full bg-slate-900/[.06] px-2 py-0.5 text-[10px] font-black tracking-wide text-slate-400 uppercase dark:bg-white/10">{cat}</span>
          <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-black tracking-wide text-slate-400 uppercase dark:border-white/20">{phase}</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">{desc}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-slate-400">Planned — plugs into Contract v1 <ArrowUpRight className="h-3.5 w-3.5" /></span>
      </div>
    </article>
  );
}
