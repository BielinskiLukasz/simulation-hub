// ─── CPU Scheduler · render.ts — CPU, ready queue, per-process progress ────

import type { RenderContext } from '../../core/types';
import type { State } from './logic';
import { computeMetrics } from './algorithms';

const PID_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#facc15'];

export function render(state: State, rc: RenderContext, view: { now: number }): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#0a0f16' : '#f2f6fb';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'left';

  // CPU box
  const running = state.running >= 0 ? state.procs[state.running - 1] : undefined;
  const switching = state.switchingTo >= 0;
  ctx.fillStyle = dark ? '#111c2b' : '#ffffff';
  ctx.strokeStyle = dark ? 'rgba(148,163,184,0.4)' : 'rgba(15,23,42,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(28, 26, 300, 96, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillText('CPU', 44, 44);
  ctx.font = 'bold 26px Inter, sans-serif';
  if (switching) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`switching → P${state.switchingTo}`, 44, 78);
  } else if (running) {
    ctx.fillStyle = PID_COLORS[(running.pid - 1) % 6]!;
    ctx.fillText(`P${running.pid}`, 44, 78);
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillStyle = dark ? '#cbd5e1' : '#475569';
    const remainingNow = running.remaining - (view.now - state.runStart);
    ctx.fillText(`remaining ${Math.max(0, Math.ceil(remainingNow))}u · started t=${state.runStart}`, 44, 102);
  } else {
    ctx.fillStyle = dark ? '#64748b' : '#94a3b8';
    ctx.fillText(state.procs.every((p) => p.completedAt >= 0) ? 'done' : 'idle', 44, 78);
  }

  // ready queue
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillText('READY QUEUE', 356, 44);
  if (state.ready.length === 0) {
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.fillText('— empty —', 356, 72);
  }
  state.ready.forEach((pid, i) => {
    const x = 356 + i * 52;
    if (x > width - 70) return;
    ctx.fillStyle = PID_COLORS[(pid - 1) % 6]!;
    ctx.beginPath(); ctx.roundRect(x, 52, 44, 34, 8); ctx.fill();
    ctx.fillStyle = '#0b0f17';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`P${pid}`, x + 22, 73);
    ctx.textAlign = 'left';
  });

  // time + algorithm
  ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.fillText(`t = ${Math.floor(view.now)}u`, 356, 116);
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.fillText(`${state.params.algorithm}${state.params.algorithm === 'rr' ? ` q=${state.params.quantum}` : ''} · switches ${state.switches}`, 470, 116);

  // process rows
  const rowTop = 148;
  const rowH = Math.min(34, (height - rowTop - 64) / Math.max(state.procs.length, 1));
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.fillText('PROC', 28, rowTop - 8);
  ctx.fillText('ARR', 84, rowTop - 8);
  ctx.fillText('BURST', 128, rowTop - 8);
  ctx.fillText('PROGRESS (executed / burst)', 182, rowTop - 8);
  ctx.fillText('STATUS', 640, rowTop - 8);

  state.procs.forEach((p, i) => {
    const y = rowTop + i * rowH;
    const executed = p.burst - p.remaining - (state.running === p.pid ? Math.max(0, view.now - state.runStart) : 0);
    const doneFrac = Math.min(1, Math.max(0, executed / p.burst));
    ctx.fillStyle = PID_COLORS[(p.pid - 1) % 6]!;
    ctx.beginPath(); ctx.roundRect(28, y, 42, rowH - 8, 6); ctx.fill();
    ctx.fillStyle = '#0b0f17';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`P${p.pid}`, 49, y + rowH / 2 + 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = dark ? '#cbd5e1' : '#334155';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(String(p.arrival), 84, y + rowH / 2 + 1);
    ctx.fillText(String(p.burst), 128, y + rowH / 2 + 1);
    // progress bar
    ctx.fillStyle = dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.10)';
    ctx.beginPath(); ctx.roundRect(182, y + 3, 430, rowH - 14, 5); ctx.fill();
    ctx.fillStyle = PID_COLORS[(p.pid - 1) % 6]!;
    ctx.beginPath(); ctx.roundRect(182, y + 3, 430 * doneFrac, rowH - 14, 5); ctx.fill();
    ctx.fillStyle = dark ? '#e2e8f0' : '#334155';
    ctx.fillText(`${Math.floor(Math.max(0, executed))}/${p.burst}`, 622 - 42, y + rowH / 2 + 1);
    const status = p.completedAt >= 0 ? `done @${p.completedAt}` : state.running === p.pid ? 'running' : p.firstRun >= 0 || state.ready.includes(p.pid) ? 'ready' : 'waiting';
    ctx.fillStyle = p.completedAt >= 0 ? '#34d399' : dark ? '#94a3b8' : '#64748b';
    ctx.fillText(status, 640, y + rowH / 2 + 1);
  });

  // footer metrics when finished
  if (state.procs.every((p) => p.completedAt >= 0) && state.procs.length > 0) {
    const m = computeMetrics(state.procs, state.slices, state.switches);
    ctx.fillStyle = dark ? 'rgba(52,211,153,0.12)' : 'rgba(5,150,105,0.08)';
    ctx.beginPath(); ctx.roundRect(28, height - 44, width - 56, 32, 8); ctx.fill();
    ctx.fillStyle = dark ? '#6ee7b7' : '#047857';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(
      `avg wait ${m.avgWaiting.toFixed(2)} · avg turnaround ${m.avgTurnaround.toFixed(2)} · avg response ${m.avgResponse.toFixed(2)} · util ${(m.utilization * 100).toFixed(0)}% · makespan ${m.makespan}`,
      42, height - 24,
    );
  }
}
