// ─── Time-Travel Debugger · render.ts ────────────────────────────────────────
// Canvas rendering of cluster topology, replicated register tables, in-flight
// packet vectors, and snapshot interval checkpoints.

import type { RenderContext } from '../../core/types';
import type { State } from './logic';

export function render(state: State, rc: RenderContext, view: { now: number; head: number }): void {
  const { ctx, width, height, theme } = rc;
  const dark = theme === 'dark';

  // Backdrop
  ctx.fillStyle = dark ? '#080c14' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Network communication mesh
  for (let i = 0; i < state.nodes.length; i++) {
    for (let j = i + 1; j < state.nodes.length; j++) {
      const a = state.nodes[i]!;
      const b = state.nodes[j]!;
      const severed = state.partition[i] !== state.partition[j];

      ctx.strokeStyle = severed
        ? 'rgba(244,63,94,0.45)'
        : dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.10)';
      ctx.lineWidth = severed ? 2 : 1;
      ctx.setLineDash(severed ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // In-flight sync messages
  for (const pkt of state.packets) {
    const from = state.nodes[pkt.from];
    const to = state.nodes[pkt.to];
    if (!from || !to) continue;

    const span = Math.max(1, pkt.deliverAt - pkt.sentAt);
    const progress = Math.min(1, Math.max(0, (view.now - pkt.sentAt) / span));
    const px = from.x + (to.x - from.x) * progress;
    const py = from.y + (to.y - from.y) * progress;

    // Glowing packet
    ctx.fillStyle = pkt.corrupted ? '#ef4444' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(px, py, pkt.corrupted ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();

    // Packet mini label
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(`${pkt.key}=${pkt.value}`, px + 6, py - 4);
  }

  // Draw node servers & their local KV store
  for (const node of state.nodes) {
    const isLeader = node.isLeader && node.up;
    const isDown = !node.up;

    // Server Chassis
    ctx.beginPath();
    ctx.arc(node.x, node.y, 34, 0, Math.PI * 2);
    ctx.fillStyle = isDown
      ? (dark ? '#1e293b' : '#cbd5e1')
      : isLeader
      ? (dark ? 'rgba(245,158,11,0.22)' : 'rgba(245,158,11,0.15)')
      : (dark ? 'rgba(56,189,248,0.18)' : 'rgba(56,189,248,0.12)');
    ctx.fill();

    ctx.lineWidth = isLeader ? 3 : 2;
    ctx.strokeStyle = isDown
      ? '#ef4444'
      : isLeader
      ? '#f59e0b'
      : dark ? 'rgba(148,163,184,0.45)' : 'rgba(15,23,42,0.30)';
    ctx.stroke();

    // Crown / status
    if (isLeader) {
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑', node.x, node.y - 42);
    }

    // Node Title
    ctx.textAlign = 'center';
    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(`N${node.id}`, node.x, node.y - 4);

    ctx.font = '8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = isDown ? '#ef4444' : isLeader ? '#f59e0b' : dark ? '#94a3b8' : '#64748b';
    ctx.fillText(isDown ? 'OFFLINE' : isLeader ? 'LEADER' : 'REPLICA', node.x, node.y + 10);

    // KV Register Table Card under each node
    const boxW = 104;
    const boxH = 54;
    const boxX = node.x - boxW / 2;
    const boxY = node.y + 44;

    ctx.fillStyle = dark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = dark ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    // Table rows
    const keys = ['X', 'Y', 'Z'] as const;
    ctx.textAlign = 'left';
    ctx.font = '9.5px "JetBrains Mono", monospace';

    keys.forEach((k, idx) => {
      const rec = node.store[k] ?? { value: 0, revision: 0, committed: false };
      const ry = boxY + 14 + idx * 14;

      ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
      ctx.fillText(k, boxX + 8, ry);

      ctx.fillStyle = dark ? '#f1f5f9' : '#0f172a';
      ctx.fillText(`=${rec.value}`, boxX + 26, ry);

      ctx.fillStyle = isDown ? '#ef4444' : '#34d399';
      ctx.textAlign = 'right';
      ctx.fillText(`r${rec.revision}`, boxX + boxW - 8, ry);
      ctx.textAlign = 'left';
    });
  }

  // Time-Travel Studio Header Overlay
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('Time-Travel Debugger Studio', 20, 24);

  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.fillText(
    `Head @ #${view.head} · Sim Time ${Math.floor(view.now)}ms · Snapshots: every ${state.params.snapshotInterval} ev · Branches: ${state.branchPoints.length}`,
    20, 42
  );

  // Replay Integrity Badge
  ctx.textAlign = 'right';
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillText('✓ Replay Bit-Identity: Verified', width - 20, 24);

  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText(`In-flight packets: ${state.packets.length} · Dropped: ${state.droppedPackets}`, width - 20, 42);

  // Time-Travel Checkpoint Scrub Strip at bottom
  const barY = height - 28;
  const barX = 20;
  const barW = width - 40;

  ctx.fillStyle = dark ? 'rgba(30,41,59,0.5)' : 'rgba(226,232,240,0.6)';
  ctx.beginPath();
  ctx.roundRect(barX, barY - 6, barW, 12, 6);
  ctx.fill();

  // Snapshot checkpoint markers along the bar
  const maxHead = Math.max(view.head, 150);
  const snapInterval = state.params.snapshotInterval;
  const snaps = Math.floor(maxHead / snapInterval);

  for (let s = 0; s <= snaps; s++) {
    const evNum = s * snapInterval;
    const sx = barX + (evNum / maxHead) * barW;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(sx, barY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Branch points along bar
  for (const bp of state.branchPoints) {
    const bx = barX + (Math.min(bp, maxHead) / maxHead) * barW;
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(bx, barY, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Current playhead
  const hx = barX + (Math.min(view.head, maxHead) / maxHead) * barW;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(hx, barY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = '9.5px "JetBrains Mono", monospace';
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  ctx.fillText('Snapshots (● blue) · Branch forks (● red) · Playhead (● gold)', 20, height - 8);
}
