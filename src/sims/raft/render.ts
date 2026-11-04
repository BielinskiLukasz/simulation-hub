// ─── Raft · render.ts — ring, in-flight messages, log strips ───────────────
// Reads only (state, view.now): message dots interpolate between sentAt and
// deliverAt, so time-travel renders any moment correctly.

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

const ROLE_COLOR = ['#38bdf8', '#fb7185', '#f59e0b']; // follower candidate leader
const ROLE_NAME = ['follower', 'candidate', 'leader'];
const TERM_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#facc15', '#f472b6', '#94a3b8'];

export function render(state: State, rc: RenderContext, view: { now: number }): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#0a0e16' : '#f2f5fa';
  ctx.fillRect(0, 0, width, height);

  // links (dashed + red when partitioned apart)
  for (let i = 0; i < state.nodes.length; i++) {
    for (let j = i + 1; j < state.nodes.length; j++) {
      const a = state.nodes[i]!;
      const b = state.nodes[j]!;
      const apart = state.partition[i] !== state.partition[j];
      ctx.strokeStyle = apart ? 'rgba(244,63,94,0.4)' : dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.10)';
      ctx.setLineDash(apart ? [5, 5] : []);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // in-flight messages interpolated by the render clock
  for (const m of state.inFlight) {
    const from = state.nodes[m.from];
    const to = state.nodes[m.to];
    if (!from || !to) continue;
    const span = Math.max(1, m.deliverAt - m.sentAt);
    const t = Math.min(1, Math.max(0, (view.now - m.sentAt) / span));
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    ctx.fillStyle = m.kind === 'rv' || m.kind === 'rvr' ? '#fb7185' : m.kind === 'ae' ? '#f59e0b' : '#34d399';
    ctx.beginPath();
    ctx.arc(x, y, m.kind === 'ae' && (m.entries?.length ?? 0) > 0 ? 4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  for (const node of state.nodes) {
    const color = node.up ? ROLE_COLOR[node.role]! : '#64748b';
    ctx.beginPath();
    ctx.arc(node.x, node.y, 27, 0, Math.PI * 2);
    ctx.fillStyle = node.up ? color : dark ? '#1e293b' : '#cbd5e1';
    ctx.fill();
    ctx.lineWidth = node.role === 2 && node.up ? 4 : 2;
    ctx.strokeStyle = node.role === 2 && node.up ? '#fbbf24' : dark ? 'rgba(226,232,240,0.65)' : 'rgba(15,23,42,0.45)';
    ctx.stroke();
    if (node.role === 2 && node.up) {
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText('👑', node.x, node.y - 34);
    }
    ctx.fillStyle = node.up ? '#0b0f17' : dark ? '#94a3b8' : '#64748b';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(`N${node.id}`, node.x, node.y - 2);
    ctx.font = '8.5px "JetBrains Mono", monospace';
    ctx.fillText(node.up ? ROLE_NAME[node.role]! : 'DOWN', node.x, node.y + 10);

    if (!node.up) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(node.x - 13, node.y - 36);
      ctx.lineTo(node.x + 13, node.y + 18);
      ctx.moveTo(node.x + 13, node.y - 36);
      ctx.lineTo(node.x - 13, node.y + 18);
      ctx.stroke();
    }

    ctx.fillStyle = dark ? '#cbd5e1' : '#475569';
    ctx.font = '10px "JetBrains Mono", monospace';
    const votes = node.role === 1 ? ` · votes ${countBits(node.votesMask)}` : '';
    ctx.fillText(`T${node.currentTerm} · commit ${node.commitIndex}${votes}`, node.x, node.y + 41);

    // log strip: cell per entry, coloured by term; commit marker line
    const shown = Math.min(node.log.length, 22);
    const totalW = shown * 9;
    for (let i = 0; i < shown; i++) {
      const ent = node.log[i]!;
      const lx = node.x - totalW / 2 + i * 9;
      ctx.fillStyle = TERM_COLORS[(ent.term - 1) % TERM_COLORS.length] ?? '#94a3b8';
      ctx.globalAlpha = i < node.commitIndex ? 1 : 0.38;
      ctx.fillRect(lx, node.y + 47, 7, 10);
      ctx.globalAlpha = 1;
    }
    if (node.log.length > shown) {
      ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`+${node.log.length - shown}`, node.x + totalW / 2 + 12, node.y + 56);
    }
  }

  ctx.textAlign = 'left';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  const leader = state.nodes.find((n) => n.up && n.role === 2);
  ctx.fillText(
    `t=${Math.floor(view.now)}ms · elections ${state.stats.elections} · leader ${leader ? `N${leader.id} (T${leader.currentTerm})` : '—'} · dropped ${state.stats.dropped} · click a node to crash/restart`,
    14, height - 14,
  );
}

function countBits(mask: number): number {
  let c = 0;
  let m = mask;
  while (m) { c += m & 1; m >>= 1; }
  return c;
}
