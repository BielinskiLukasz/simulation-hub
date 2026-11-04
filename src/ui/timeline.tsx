// ─── ui/timeline.tsx — canvas Gantt/timeline with zoom, pan, click-to-seek ─
// Pure math lives in core/des/timeline-math.ts. Segments coloured by `cls`
// via a theme-aware palette. Static mode (compare tabs) shares one domain
// across several charts and disables interaction.

import type { ThemeName, TimelineData } from '../core/types';
import { niceTicks, pan, timeToX, visibleSegments, xToTime, zoom, type View } from '../core/des/timeline-math';

export interface TimelineOptions {
  theme: ThemeName;
  interactive?: boolean; // default true
  domain?: [number, number];
  onSeek?: (t: number) => void;
  follow?: boolean; // auto-scroll with the playhead
}

export interface TimelineHandle {
  setData(data: TimelineData, now: number): void;
  setPlayhead(now: number): void;
  setTheme(theme: ThemeName): void;
  dispose(): void;
}

const LABEL_W = 92;
const LANE_H = 21;
const AXIS_H = 18;

const CLS_COLORS: Record<string, string> = {
  run: '#38bdf8', wait: 'rgba(148,163,184,0.35)',
  leader: '#f59e0b', candidate: '#fb7185', follower: '#38bdf8', down: '#475569',
  pid0: '#38bdf8', pid1: '#f59e0b', pid2: '#a78bfa', pid3: '#34d399', pid4: '#fb7185', pid5: '#facc15',
  minor: '#34d399', full: '#fb7185', 'gc-minor': '#34d399', 'gc-full': '#fb7185', concurrent: 'rgba(52,211,153,0.4)',
  mutator: 'rgba(148,163,184,0.30)', blocked: 'rgba(251,113,133,0.55)',
  committed: '#34d399', action: '#f59e0b', election: '#fb7185',
};
const FALLBACK = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#facc15'];

function colorFor(cls: string): string {
  if (CLS_COLORS[cls]) return CLS_COLORS[cls]!;
  let h = 0;
  for (let i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length]!;
}

export function mountTimeline(host: HTMLElement, opts: TimelineOptions): TimelineHandle {
  const interactive = opts.interactive !== false;
  host.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.setAttribute('aria-label', 'Simulation timeline. Use the event log panel for an accessible equivalent.');
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute;pointer-events:none;opacity:0;font:11px "JetBrains Mono",monospace;padding:4px 7px;border-radius:6px;white-space:pre;z-index:5';
  host.append(canvas, tooltip);
  const ctx = canvas.getContext('2d')!;

  let data: TimelineData = { lanes: [], segments: [], markers: [] };
  let now = 0;
  let theme = opts.theme;
  let view: View = { t0: 0, t1: 100, widthPx: 800 };
  let domain: [number, number] = opts.domain ?? [0, 100];
  let userMoved = false;

  function fitDomain(): [number, number] {
    if (opts.domain) return opts.domain;
    let end = Math.max(now, 1);
    for (const s of data.segments) end = Math.max(end, s.end ?? now);
    for (const m of data.markers) end = Math.max(end, m.t);
    return [0, Math.max(end, 1)];
  }

  function draw() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w < 60 || h < 30) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    view.widthPx = Math.max(10, w - LABEL_W);
    if (!userMoved || (opts.follow && now > view.t1)) {
      domain = fitDomain();
      if (opts.follow && now > view.t1) {
        const span = view.t1 - view.t0;
        view.t0 = Math.max(domain[0], now - span * 0.85);
        view.t1 = view.t0 + span;
      } else if (!userMoved) {
        view.t0 = domain[0]; view.t1 = domain[1];
      }
    }
    const dark = theme === 'dark';
    const plotW = view.widthPx;
    const X = (t: number) => LABEL_W + timeToX(t, view);

    // lane backgrounds + labels
    ctx.font = '10px "JetBrains Mono", monospace';
    data.lanes.forEach((lane, i) => {
      const y = i * LANE_H;
      if (i % 2 === 0) { ctx.fillStyle = dark ? 'rgba(148,163,184,0.05)' : 'rgba(15,23,42,0.03)'; ctx.fillRect(0, y, w, LANE_H); }
      ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
      ctx.textAlign = 'right';
      ctx.fillText(lane.label.slice(0, 12), LABEL_W - 8, y + LANE_H / 2 + 3);
    });

    // segments (culled to the visible window)
    const byLane = new Map<string, number>();
    data.lanes.forEach((l, i) => byLane.set(l.id, i));
    for (const seg of visibleSegments(data.segments, view)) {
      const li = byLane.get(seg.lane);
      if (li === undefined) continue;
      const y = li * LANE_H + 3;
      const x0 = X(seg.start);
      const x1 = X(seg.end ?? now);
      ctx.fillStyle = colorFor(seg.cls);
      ctx.beginPath();
      ctx.roundRect(Math.max(x0, LABEL_W), y, Math.max(2, x1 - x0), LANE_H - 7, 3);
      ctx.fill();
      if (seg.label && x1 - x0 > 34) {
        ctx.fillStyle = 'rgba(4,10,18,0.75)';
        ctx.textAlign = 'left';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(seg.label, Math.max(x0, LABEL_W) + 4, y + 10);
      }
    }

    // markers
    for (const m of data.markers) {
      if (m.t < view.t0 || m.t > view.t1) continue;
      const x = X(m.t);
      const li = m.lane ? byLane.get(m.lane) : undefined;
      const y = li !== undefined ? li * LANE_H + 2 : 0;
      ctx.fillStyle = colorFor(m.cls);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3.5, y - 5);
      ctx.lineTo(x + 3.5, y - 5);
      ctx.closePath();
      ctx.fill();
    }

    // axis ticks
    const axisY = data.lanes.length * LANE_H + 4;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = dark ? '#7d8aa0' : '#7c8aa5';
    ctx.textAlign = 'center';
    for (const t of niceTicks(view.t0, view.t1, Math.max(2, Math.floor(plotW / 90)))) {
      const x = X(t);
      ctx.fillText(String(Math.round(t)), x, axisY + 9);
      ctx.strokeStyle = dark ? 'rgba(148,163,184,0.13)' : 'rgba(15,23,42,0.08)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, axisY - 2); ctx.stroke();
    }

    // playhead
    const px = X(now);
    if (px >= LABEL_W && px <= w) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, Math.max(axisY, h - AXIS_H)); ctx.stroke();
      ctx.lineWidth = 1;
    }
    void AXIS_H;
  }

  let dragStart: { x: number; view: View } | null = null;
  let dragged = false;
  const onDown = (e: PointerEvent) => {
    if (!interactive) return;
    dragStart = { x: e.clientX, view: { ...view } };
    dragged = false;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (dragStart && interactive) {
      const dx = e.clientX - dragStart.x;
      if (Math.abs(dx) > 3) {
        dragged = true;
        userMoved = true;
        view = pan({ ...dragStart.view, widthPx: view.widthPx }, dx, domain);
        draw();
      }
      return;
    }
    // hover tooltip
    if (!interactive) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < LABEL_W) { tooltip.style.opacity = '0'; return; }
    const t = xToTime(mx - LABEL_W, view);
    const li = Math.floor(my / LANE_H);
    const lane = data.lanes[li];
    let tip = `t=${Math.round(t)}`;
    if (lane) {
      const seg = data.segments.find((s) => s.lane === lane.id && s.start <= t && (s.end === null || t <= s.end));
      if (seg) tip = `${lane.label} · ${seg.label ?? seg.cls}\n${Math.round(seg.start)} → ${seg.end === null ? '…' : Math.round(seg.end)} (${seg.end === null ? 'open' : Math.round(seg.end - seg.start)})`;
    }
    tooltip.textContent = tip;
    tooltip.style.left = `${Math.min(mx + 12, rect.width - 150)}px`;
    tooltip.style.top = `${my + 10}px`;
    tooltip.style.background = theme === 'dark' ? 'rgba(2,6,23,0.9)' : 'rgba(255,255,255,0.95)';
    tooltip.style.color = theme === 'dark' ? '#e2e8f0' : '#1e293b';
    tooltip.style.opacity = '1';
  };
  const onUp = (e: PointerEvent) => {
    if (!interactive) return;
    const wasDrag = dragged;
    dragStart = null;
    dragged = false;
    if (!wasDrag && opts.onSeek) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx >= LABEL_W) opts.onSeek(Math.max(domain[0], xToTime(mx - LABEL_W, view)));
    }
  };
  const onWheel = (e: WheelEvent) => {
    if (!interactive) return;
    e.preventDefault();
    userMoved = true;
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    view = zoom(view, factor, e.clientX - rect.left - LABEL_W, domain);
    draw();
  };
  const onDbl = () => { userMoved = false; draw(); };
  const onLeave = () => { tooltip.style.opacity = '0'; };

  if (interactive) {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';
  } else {
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
  }

  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  draw();

  return {
    setData(d, n) { data = d; now = n; draw(); },
    setPlayhead(n) { now = n; draw(); },
    setTheme(t) { theme = t; draw(); },
    dispose() {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.remove();
      tooltip.remove();
    },
  };
}
