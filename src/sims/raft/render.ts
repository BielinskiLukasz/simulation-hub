// ─── Raft · render.ts — cluster ring, message packets, per-node logs ───────

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

const ROLE_COLOR: Record<string, string> = {
  leader: '#f59e0b',
  candidate: '#fb7185',
  follower: '#38bdf8',
};

export function render(state: State, rc: RenderContext): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';
  ctx.fillStyle = dark ? '#0a0e16' : '#f2f5fa';
  ctx.fillRect(0, 0, width, height);

  // links between nodes
  ctx.strokeStyle = dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < state.nodes.length; i++) {
    for (let j = i + 1; j < state.nodes.length; j++) {
      ctx.beginPath();
      ctx.moveTo(state.nodes[i]!.x, state.nodes[i]!.y);
      ctx.lineTo(state.nodes[j]!.x, state.nodes[j]!.y);
      ctx.stroke();
    }
  }

  // in-flight message packets
  for (const m of state.messages) {
    const from = state.nodes[m.from];
    const to = state.nodes[m.to];
    if (!from || !to) continue;
    const span = Math.max(1, m.deliver - m.sent);
    const t = 1 - (m.deliver - state.tick) / span;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    ctx.fillStyle = m.kind.startsWith('vote') ? '#fb7185' : m.kind === 'append' ? '#f59e0b' : '#34d399';
    ctx.beginPath();
    ctx.arc(x, y, m.kind === 'append' && (m.entries?.length ?? 0) > 0 ? 4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  for (const node of state.nodes) {
    const color = node.alive ? ROLE_COLOR[node.role]! : '#64748b';
    // node disc
    ctx.beginPath();
    ctx.arc(node.x, node.y, 27, 0, Math.PI * 2);
    ctx.fillStyle = node.alive ? color : (dark ? '#1e293b' : '#cbd5e1');
    ctx.fill();
    ctx.lineWidth = node.role === 'leader' && node.alive ? 4 : 2;
    ctx.strokeStyle = node.role === 'leader' && node.alive ? '#fbbf24' : (dark ? 'rgba(226,232,240,0.65)' : 'rgba(15,23,42,0.45)');
    ctx.stroke();

    ctx.fillStyle = node.alive ? '#0b0f17' : (dark ? '#94a3b8' : '#64748b');
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillText(`N${node.id}`, node.x, node.y - 2);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(node.alive ? node.role : 'DOWN', node.x, node.y + 11);

    if (!node.alive) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(node.x - 14, node.y - 34);
      ctx.lineTo(node.x + 14, node.y + 20);
      ctx.moveTo(node.x + 14, node.y - 34);
      ctx.lineTo(node.x - 14, node.y + 20);
      ctx.stroke();
    }

    // term + commit label
    ctx.fillStyle = dark ? '#cbd5e1' : '#475569';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`term ${node.term} · commit ${node.commitIndex}`, node.x, node.y + 42);

    // log strip: committed entries filled, uncommitted hollow
    const shown = Math.min(node.log.length, 22);
    const totalW = shown * 9;
    for (let i = 0; i < shown; i++) {
      const lx = node.x - totalW / 2 + i * 9;
      const ly = node.y + 48;
      ctx.beginPath();
      ctx.rect(lx, ly, 7, 10);
      if (i < node.commitIndex) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); }
    }
    if (node.log.length > shown) {
      ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`+${node.log.length - shown}`, node.x + totalW / 2 + 12, node.y + 57);
    }
  }

  // footer legend
  ctx.textAlign = 'left';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  const leader = state.nodes.find((n) => n.alive && n.role === 'leader');
  ctx.fillText(
    `tick ${state.tick} · elections ${state.electionsWon} · leader ${leader ? `N${leader.id} (term ${leader.term})` : '—'} · in-flight ${state.messages.length}`,
    14, height - 14,
  );
}
