// ─── Circuit · editor.tsx — custom netlist editor (palette, wiring, undo) ──

import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Cable, MousePointer2, Play, Plus, Trash2, Undo2, Redo2 } from 'lucide-react';
import type { CustomEditorCtx, CustomEditorSpec } from '../../core/types';
import { UndoStack } from '../../core/undo';
import {
  GATE_TYPES, applyNetPatch, applyOp, compileNetlist, type Component, type GateType, type NetPatch, type Netlist,
} from './model';
import { CELL, ORIGIN, routeWire } from './render';

let externalSetMode: ((m: 'edit' | 'simulate') => void) | null = null;

function CircuitEditor({ ctx }: { ctx: CustomEditorCtx<Netlist> }) {
  const [net, setNet] = useState<Netlist>(() => ctx.getInput());
  const [mode, setMode] = useState<'edit' | 'simulate'>('edit');
  const [selected, setSelected] = useState<number[]>([]);
  const [placeType, setPlaceType] = useState<GateType | null>(null);
  const [wireFrom, setWireFrom] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const undoRef = useRef(new UndoStack<NetPatch>(120));
  const dragRef = useRef<{ ids: number[]; startX: number; startY: number; orig: Netlist; moved: boolean } | null>(null);

  externalSetMode = (m) => setMode(m);

  const compiled = useMemo(() => {
    try { return compileNetlist(net); } catch { return null; }
  }, [net]);
  const signals = ctx.signals?.();

  const commit = (next: Netlist, label: string) => {
    setNet(next);
    ctx.commit(next, label);
  };

  const apply = (op: Parameters<typeof applyOp>[1]) => {
    try {
      const { net: next, patch } = applyOp(net, op);
      undoRef.current.push(patch);
      commit(next, op.op);
      setMessage('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const doUndo = () => {
    const patch = undoRef.current.undo();
    if (!patch) return;
    commit(applyNetPatch(net, patch, 'undo'), 'undo');
  };
  const doRedo = () => {
    const patch = undoRef.current.redo();
    if (!patch) return;
    commit(applyNetPatch(net, patch, 'redo'), 'redo');
  };

  const gridAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 800;
    const y = ((e.clientY - rect.top) / rect.height) * 600;
    return { gx: Math.round((x - ORIGIN.x) / CELL), gy: Math.round((y - ORIGIN.y) / CELL), x, y };
  };

  const onSvgDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== 'edit' || !placeType) return;
    const { gx, gy } = gridAt(e);
    const inputs = placeType === 'not' || placeType === 'buf' || placeType === 'led' ? 1 : placeType === 'switch' || placeType === 'button' || placeType === 'clock' || placeType === 'const0' || placeType === 'const1' ? 0 : 2;
    const comp: Component = { id: net.nextId, type: placeType, x: Math.max(0, gx), y: Math.max(0, gy), inputs, delay: 1, label: placeType.toUpperCase() };
    apply({ op: 'addComponent', comp });
    setSelected([comp.id]);
    setPlaceType(null);
  };

  const compCenter = (c: Component) => ({ x: ORIGIN.x + c.x * CELL, y: ORIGIN.y + c.y * CELL });

  const selectedComp = selected.length === 1 ? net.comps.find((c) => c.id === selected[0]) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg bg-slate-900/[.05] p-0.5 dark:bg-white/[.07]" role="group" aria-label="Editor mode">
          <button onClick={() => setMode('edit')} className={`rounded-md px-2 py-1 text-[11px] font-bold ${mode === 'edit' ? 'bg-white shadow dark:bg-slate-100 dark:text-slate-900' : 'text-slate-400'}`}><MousePointer2 className="mr-1 inline h-3 w-3" />Edit</button>
          <button onClick={() => setMode('simulate')} className={`rounded-md px-2 py-1 text-[11px] font-bold ${mode === 'simulate' ? 'bg-white shadow dark:bg-slate-100 dark:text-slate-900' : 'text-slate-400'}`}><Play className="mr-1 inline h-3 w-3" />Simulate</button>
        </div>
        <button onClick={doUndo} className="rounded-lg border border-slate-300 p-1.5 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Undo"><Undo2 className="h-3.5 w-3.5" /></button>
        <button onClick={doRedo} className="rounded-lg border border-slate-300 p-1.5 text-slate-500 dark:border-white/15 dark:text-slate-300" title="Redo"><Redo2 className="h-3.5 w-3.5" /></button>
        <button disabled={selected.length === 0 || mode !== 'edit'} onClick={() => apply({ op: 'deleteSelection', ids: selected })} className="rounded-lg border border-slate-300 p-1.5 text-slate-500 disabled:opacity-40 dark:border-white/15 dark:text-slate-300" title="Delete selection"><Trash2 className="h-3.5 w-3.5" /></button>
        <span className="ml-auto font-mono text-[10px] text-slate-400">{net.comps.length} gates · {net.wires.length} wires</span>
      </div>

      {mode === 'edit' && (
        <div className="flex flex-wrap gap-1">
          {GATE_TYPES.map((t) => (
            <button key={t} onClick={() => setPlaceType(t)} className={`rounded-md border px-1.5 py-1 font-mono text-[10px] font-bold ${placeType === t ? 'border-amber-400 bg-amber-500/15 text-amber-600' : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-300'}`}>
              <Plus className="mr-0.5 inline h-3 w-3" />{t}
            </button>
          ))}
        </div>
      )}
      {wireFrom !== null && <p className="flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400"><Cable className="h-3.5 w-3.5" /> wiring from #{wireFrom}: click an input pin (left side of a gate)</p>}
      {message && <p className="text-[11px] font-semibold text-rose-500">{message}</p>}

      <svg viewBox="0 0 800 600" className="w-full rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950" onPointerDown={onSvgDown} role="img" aria-label={`Circuit editor: ${net.comps.length} gates, ${net.wires.length} wires`}>
        {net.wires.map((wire) => {
          const from = net.comps.find((c) => c.id === wire.from);
          const to = net.comps.find((c) => c.id === wire.to);
          if (!from || !to || !compiled) return null;
          const a = compCenter(from);
          const b = compCenter(to);
          const pts = routeWire({ x: a.x + 30, y: a.y }, { x: b.x - 30, y: b.y + (wire.pin - (to.inputs - 1) / 2) * 10 });
          const dense = compiled.indexById.get(wire.from)!;
          const v = signals?.[dense] ?? 2;
          return <polyline key={wire.id} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={v === 1 ? '#22c55e' : v === 0 ? '#64748b' : '#a8a29e'} strokeWidth={v === 1 ? 2.4 : 1.6} strokeDasharray={v === 2 ? '5 4' : undefined} />;
        })}
        {net.comps.map((comp) => {
          const { x, y } = compCenter(comp);
          const dense = compiled?.indexById.get(comp.id);
          const v = dense !== undefined ? signals?.[dense] ?? 2 : 2;
          const isSel = selected.includes(comp.id);
          return (
            <g key={comp.id} transform={`translate(${x},${y})`}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (mode === 'simulate') {
                  if (comp.type === 'switch' || comp.type === 'button') ctx.act?.({ a: 'toggle', comp: comp.id });
                  return;
                }
                setSelected(e.shiftKey ? [...selected, comp.id] : [comp.id]);
                dragRef.current = { ids: e.shiftKey ? [...selected, comp.id] : [comp.id], startX: e.clientX, startY: e.clientY, orig: structuredClone(net), moved: false };
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current;
                if (!drag || mode !== 'edit') return;
                const dx = Math.round((e.clientX - drag.startX) / CELL);
                const dy = Math.round((e.clientY - drag.startY) / CELL);
                if (dx === 0 && dy === 0) return;
                drag.moved = true;
                const orig = drag.orig;
                setNet({ ...orig, comps: orig.comps.map((c) => drag.ids.includes(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c) });
              }}
              onPointerUp={() => {
                const drag = dragRef.current;
                if (drag?.moved) {
                  // one undoable patch for the whole drag
                  undoRef.current.push({ before: drag.orig, after: structuredClone(net) });
                  ctx.commit(net, 'move');
                }
                dragRef.current = null;
              }}
              className="cursor-pointer">
              <rect x={-30} y={-17} width={60} height={34} rx={8} fill={comp.type === 'led' && v === 1 ? '#facc15' : '#111c2b'} stroke={isSel ? '#f59e0b' : compiled?.feedback.has(dense ?? -1) ? '#fb7185' : '#64748b'} strokeWidth={isSel || compiled?.feedback.has(dense ?? -1) ? 3 : 1.5} />
              <text textAnchor="middle" y={-1} fontSize={10} fontWeight={700} fill="#e2e8f0">{(comp.label || comp.type).slice(0, 9)}</text>
              <text textAnchor="middle" y={10} fontSize={8.5} fill="#94a3b8" fontFamily="monospace">{comp.type} · {v === 2 ? 'X' : v}</text>
              {mode === 'edit' && comp.inputs > 0 && Array.from({ length: comp.inputs }).map((_, pin) => (
                <circle key={pin} cx={-34} cy={(pin - (comp.inputs - 1) / 2) * 10} r={6} fill={wireFrom !== null ? '#38bdf8' : '#1e293b'} stroke="#e2e8f0"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (wireFrom !== null) {
                      apply({ op: 'addWire', wire: { id: net.nextId, from: wireFrom, to: comp.id, pin } });
                      setWireFrom(null);
                    }
                  }} />
              ))}
              {mode === 'edit' && comp.type !== 'led' && (
                <circle cx={34} cy={0} r={6} fill={wireFrom === comp.id ? '#f59e0b' : '#1e293b'} stroke="#e2e8f0"
                  onPointerDown={(e) => { e.stopPropagation(); setWireFrom(comp.id); }} />
              )}
            </g>
          );
        })}
      </svg>

      {selectedComp && mode === 'edit' && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900/[.04] p-2 font-mono text-[11px] dark:bg-white/[.05]">
          <label>label<input value={selectedComp.label} onChange={(e) => apply({ op: 'setProps', id: selectedComp.id, props: { label: e.target.value } })} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-1 dark:border-white/15 dark:bg-white/[.06]" /></label>
          <label>delay<input type="number" min={1} value={selectedComp.delay} onChange={(e) => apply({ op: 'setProps', id: selectedComp.id, props: { delay: Math.max(1, Number(e.target.value) || 1) } })} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-1 dark:border-white/15 dark:bg-white/[.06]" /></label>
          <label>inputs<input type="number" min={1} max={4} value={selectedComp.inputs} onChange={(e) => apply({ op: 'setProps', id: selectedComp.id, props: { inputs: Math.min(4, Math.max(1, Number(e.target.value) || 1)) } })} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-1 dark:border-white/15 dark:bg-white/[.06]" /></label>
          <label>initial<select value={selectedComp.init ?? ''} onChange={(e) => apply({ op: 'setProps', id: selectedComp.id, props: { init: e.target.value === '' ? undefined : Number(e.target.value) as 0 | 1 } })} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-1 dark:border-white/15 dark:bg-white/[.06]"><option value="">X</option><option value="0">0</option><option value="1">1</option></select></label>
        </div>
      )}
      <p className="text-[10.5px] leading-snug text-slate-400">Edit: pick a gate, click the canvas to place · drag gates to move · click an output dot, then an input dot to wire · Simulate: click switches. A drag ending commits one undoable patch.</p>
    </div>
  );
}

export const circuitEditorSpec: CustomEditorSpec<Netlist> = {
  kind: 'custom',
  mount(host, ctx) {
    const container = document.createElement('div');
    host.append(container);
    const root = createRoot(container);
    root.render(<CircuitEditor ctx={ctx} />);
    return {
      setMode(mode) { externalSetMode?.(mode); },
      renderOverlay() { /* SVG editor is self-rendering */ },
      dispose() { root.unmount(); container.remove(); },
    };
  },
};
