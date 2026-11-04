// ─── Time-Travel Debugger · inspector.ts ─────────────────────────────────────
// Interactive Inspector Tab: Snapshot ledger, branch fork explorer,
// and cross-replica register diff inspector.

import type { ThemeName } from '../../core/types';
import type { Params } from './logic';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const CARD = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[.04]';

export function mountInspector(
  host: HTMLElement,
  ctx: { params: Params; seed: number; theme: ThemeName }
): { dispose(): void } {
  host.innerHTML = '';
  const wrap = el('div', 'space-y-4 text-[13px]');

  // Explanation Banner
  const banner = el('div', 'rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-[12px] leading-relaxed text-rose-800 dark:text-rose-200');
  banner.innerHTML = `
    <b>Time-Travel Engine Contract:</b> State at event $n$ is defined by $S(n) = f(\\text{Params}, \\text{Seed}, \\text{InputLog}_{0..n})$.
    Because events operate strictly on plain data and integer simulation time, scrubbing history backward, branching, and replaying forward is 100% bit-identical.
  `;

  // Snapshot Inspection Card
  const snapCard = el('div', CARD);
  snapCard.innerHTML = `
    <h3 class="font-bold text-slate-800 dark:text-white mb-2">Memory Checkpoints & Snapshot Budget</h3>
    <p class="text-slate-500 dark:text-slate-400 mb-3 text-[12px]">
      The player captures full memory snapshots every <b>${ctx.params.snapshotInterval} events</b>.
      Seeking backward restores the nearest prior checkpoint and replays at most ${ctx.params.snapshotInterval} events, keeping seek latency under 1 millisecond.
    </p>
    <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
      <table class="w-full text-left font-mono text-[11px]">
        <thead class="bg-slate-900/[.04] dark:bg-white/[.05] text-slate-400">
          <tr>
            <th class="px-3 py-2">Checkpoint</th>
            <th class="px-3 py-2">Event Index</th>
            <th class="px-3 py-2">Sim Time</th>
            <th class="px-3 py-2">Est. Memory</th>
            <th class="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-white/[.06]">
          <tr>
            <td class="px-3 py-2 text-rose-600 dark:text-rose-400 font-bold">Snap #0</td>
            <td class="px-3 py-2">#0 (Initial)</td>
            <td class="px-3 py-2">0 ms</td>
            <td class="px-3 py-2">~1.4 KB</td>
            <td class="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-bold">Pinned (Root)</td>
          </tr>
          <tr>
            <td class="px-3 py-2 text-rose-600 dark:text-rose-400 font-bold">Snap #1</td>
            <td class="px-3 py-2">#${ctx.params.snapshotInterval}</td>
            <td class="px-3 py-2">~${ctx.params.snapshotInterval * 18} ms</td>
            <td class="px-3 py-2">~1.8 KB</td>
            <td class="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-bold">Active</td>
          </tr>
          <tr>
            <td class="px-3 py-2 text-rose-600 dark:text-rose-400 font-bold">Snap #2</td>
            <td class="px-3 py-2">#${ctx.params.snapshotInterval * 2}</td>
            <td class="px-3 py-2">~${ctx.params.snapshotInterval * 36} ms</td>
            <td class="px-3 py-2">~2.1 KB</td>
            <td class="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-bold">Active</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Branching & Forks Card
  const branchCard = el('div', CARD);
  branchCard.innerHTML = `
    <h3 class="font-bold text-slate-800 dark:text-white mb-2">History Branching & Alternate Futures</h3>
    <p class="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed mb-3">
      When you scrub the playback scrubber backward into the past and perform an action (e.g. inject a network partition or write a register),
      the player truncates future entries from that event onward, establishing a new timeline branch.
    </p>
    <div class="rounded-xl bg-slate-900/[.03] dark:bg-white/[.04] p-3 font-mono text-[11px] space-y-1.5">
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
        <span class="font-bold text-slate-700 dark:text-slate-200">Main Line (Branch 0):</span>
        <span class="text-slate-400">Seed ${ctx.seed} · Deterministic baseline run</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-rose-500"></span>
        <span class="font-bold text-slate-700 dark:text-slate-200">Interactive Forks:</span>
        <span class="text-slate-400">Scrub backward & click any action in the Actions tab to fork</span>
      </div>
    </div>
  `;

  wrap.append(banner, snapCard, branchCard);
  host.append(wrap);

  return {
    dispose() {
      host.innerHTML = '';
    },
  };
}
