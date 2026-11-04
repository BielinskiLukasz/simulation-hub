// ─── ui/hud.tsx — perf HUD overlay (runner stats + sim getStats) ────────────
// Toggled by key P or ?hud=1 in the realtime shell. No per-sim special cases:
// whatever getStats returns is rendered generically (Phase-6 recorder seed).

import { Activity } from 'lucide-react';
import type { RunnerStats } from '../core/stats';

export function HudOverlay({ stats, entries }: { stats: RunnerStats | null; entries: Record<string, number | string> }) {
  return (
    <div className="absolute top-3 right-3 rounded-xl bg-black/68 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300 backdrop-blur-sm" aria-label="Performance HUD">
      <div className="mb-1 flex items-center gap-1.5 font-bold tracking-wider text-white/80 uppercase"><Activity className="h-3 w-3" /> perf · P to hide</div>
      <div>fps <b className="float-right ml-6 text-white">{stats ? stats.fps.toFixed(0) : '—'}</b></div>
      <div>step <b className="float-right ml-6 text-white">{stats ? stats.stepMs.toFixed(2) : '—'} ms</b></div>
      <div>render <b className="float-right ml-6 text-white">{stats ? stats.renderMs.toFixed(2) : '—'} ms</b></div>
      <div>max frame <b className="float-right ml-6 text-white">{stats ? stats.maxFrameMs.toFixed(1) : '—'} ms</b></div>
      <div>steps/frame <b className="float-right ml-6 text-white">{stats ? stats.stepsPerFrame : '—'}</b></div>
      {Object.entries(entries).map(([k, v]) => (
        <div key={k}>{k} <b className="float-right ml-6 text-amber-300">{String(v)}</b></div>
      ))}
    </div>
  );
}
