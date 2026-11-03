// ─── main bootstrap (the spec's Step 10) ────────────────────────────────────
// hashchange → parseHash → mount hub | sim page | not-found. The previous
// page's dispose runs via React effect cleanup (runner stopped, no leaks).
// Theme: prefers-color-scheme first, manual override persisted in
// localStorage (try/catch — private mode must not break the app).

import { useCallback, useEffect, useState } from 'react';
import { Compass, Moon, Sun, Dices, GitBranch } from 'lucide-react';
import type { Route } from './core/router';
import { parseHash } from './core/router';
import type { ThemeName } from './core/types';
import { entries } from './sims/index';
import { findEntry, randomEntry } from './core/registry';
import { Hub } from './ui/hub';
import { SimPage } from './ui/sim-page';

const THEME_KEY = 'sim-hub-theme';

function initialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => { setRoute(parseHash(location.hash)); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  const route = useHashRoute();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const goRandom = useCallback(() => {
    const e = randomEntry(entries, route.name === 'sim' ? route.id : undefined, Math.random());
    if (e) location.hash = `#/sim/${e.meta.id}`;
  }, [route]);

  const entry = route.name === 'sim' ? findEntry(entries, route.id) : undefined;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100"
      style={{ backgroundImage: theme === 'dark' ? 'radial-gradient(900px 420px at 50% -80px, rgba(245,158,11,.12), transparent 65%)' : 'radial-gradient(900px 420px at 50% -80px, rgba(245,158,11,.16), transparent 65%)' }}>
      <header className="sticky top-0 z-40 border-b border-slate-900/[.07] bg-white/75 backdrop-blur-md dark:border-white/[.08] dark:bg-slate-950/75">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <a href="#/" className="flex items-center gap-2.5" aria-label="Simulation Hub home">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-md shadow-orange-500/30">
              <Compass className="h-[18px] w-[18px]" />
            </span>
            <span className="leading-none">
              <span className="block text-[15px] font-black tracking-tight">Simulation Hub</span>
              <span className="mt-0.5 block font-mono text-[9px] font-bold tracking-[.18em] text-slate-400 uppercase dark:text-slate-500">Contract v1 · Phase 1</span>
            </span>
          </a>
          <nav className="ml-4 hidden items-center gap-1 text-[13px] font-semibold sm:flex" aria-label="Primary">
            <a href="#/" className={`rounded-lg px-3 py-1.5 transition ${route.name === 'home' ? 'bg-slate-900/[.06] text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>Hub</a>
            <a href="#/sim/bouncing-balls" className={`rounded-lg px-3 py-1.5 transition ${route.name === 'sim' ? 'bg-slate-900/[.06] text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>Bouncing Balls</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={goRandom} className="hidden h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 md:inline-flex dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5">
              <Dices className="h-4 w-4" /> Random
            </button>
            <a href="#/sim/bouncing-balls?seed=7&count=200&gravity=0"
              className="hidden h-9 items-center rounded-lg bg-slate-900/[.05] px-3 font-mono text-[11px] text-slate-500 transition hover:text-slate-900 lg:inline-flex dark:bg-white/[.07] dark:text-slate-400 dark:hover:text-white"
              title="Try a deep link: zero-gravity, 200 balls, seed 7">
              try: ?seed=7&amp;count=200&amp;gravity=0
            </a>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'dark'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-amber-300 dark:hover:bg-white/5">
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>
      </header>

      {route.name === 'home' && <Hub entries={entries} onRandom={goRandom} />}
      {route.name === 'sim' && entry && <SimPage key={`${entry.meta.id}:${route.query.toString()}`} entry={entry} query={route.query} theme={theme} />}
      {route.name === 'sim' && !entry && <NotFound id={route.id} />}

      <footer className="border-t border-slate-900/[.07] dark:border-white/[.08]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-5 text-[12px] text-slate-400 sm:px-6 dark:text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-semibold"><Compass className="h-3.5 w-3.5" /> Simulation Hub — Phase 1 foundation</span>
          <span className="font-mono text-[11px]">core/ pure TS · sims lazy-loaded · fixed dt 1/60 · mulberry32 seeded RNG</span>
          <span className="ml-auto inline-flex items-center gap-3">
            <span className="font-mono text-[11px]">npm test · lint · typecheck · build → GitHub Pages</span>
            <GitBranch className="h-4 w-4" />
          </span>
        </div>
      </footer>
    </div>
  );
}

function NotFound({ id }: { id: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/15 font-mono text-2xl font-black text-rose-500">404</span>
      <h1 className="mt-5 text-2xl font-black text-slate-900 dark:text-white">Simulation not found</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        No sim is registered under <code className="rounded bg-slate-900/[.06] px-1.5 py-0.5 font-mono text-[12px] dark:bg-white/10">“{id}”</code>.
        It may be a Phase-2 sim that has not landed yet — or a typo in the link.
      </p>
      <a href="#/" className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900">← Back to the hub</a>
    </main>
  );
}
