// ─── Pathfinding · view.ts — grid canvas + overlays + shared editor ───────

import { createGridCanvas, overlayColor, paletteArray, type GridCanvasHandle } from '../../ui/grid-canvas';
import { mountGridEditor, type EditorHandle } from '../../ui/grid-editor';
import { applyEdit } from '../../core/grid/ops';
import { exportJson, importJson } from '../../core/grid/codec';
import { cloneGrid } from '../../core/grid/grid';
import { createRng } from '../../core/rng';
import { TraceCursor } from '../../core/trace/cursor';
import type { GridEdit, TraceResult, TraceView, TraceViewContext } from '../../core/types';
import { STEP, type PathTrace } from './algorithms';
import { isAdmissible, heuristicLabel } from './heuristics';
import { input as inputSpec, type Input, type Params } from './model';

interface PathState { cellState: Uint8Array; onPath: Uint8Array }

function palette(theme: 'light' | 'dark'): ReturnType<typeof paletteArray> {
  return paletteArray([
    { value: 0, color: theme === 'dark' ? 0x0f172a : 0xf8fafc },
    { value: 1, color: theme === 'dark' ? 0x475569 : 0x334155 },
    { value: 2, color: theme === 'dark' ? 0x166534 : 0xbbf7d0 },
    { value: 5, color: theme === 'dark' ? 0x78350f : 0xd97706 },
    { value: 10, color: theme === 'dark' ? 0x1e40af : 0x60a5fa },
  ], theme);
}

export function mountView(host: HTMLElement, ctx: TraceViewContext): TraceView<Input, PathTrace> {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'space-y-2';
  const toolbarHost = document.createElement('div');
  const gridHost = document.createElement('div');
  gridHost.className = 'overflow-hidden rounded-xl border border-slate-200 dark:border-white/10';
  const genHost = document.createElement('div');
  genHost.className = 'flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-2 dark:border-white/10';
  const stats = document.createElement('div');
  stats.className = 'grid grid-cols-2 gap-1.5 font-mono text-[11px] sm:grid-cols-4';
  const message = document.createElement('p');
  message.className = 'text-[11px] text-rose-500';
  wrap.append(toolbarHost, gridHost, genHost, stats, message);
  host.append(wrap);

  const canvas: GridCanvasHandle = createGridCanvas(gridHost, { theme: ctx.theme });
  canvas.setPalette(palette(ctx.theme));

  let currentInput: Input = inputSpec.initial(ctx.seed);
  let result: TraceResult<PathTrace> | null = null;
  let cursor: TraceCursor<PathState> | null = null;
  let params: Params | null = null;
  let position = 0;
  let editor: EditorHandle | null = null;
  let genCounter = 0;

  const notify = () => ctx.onInputChange?.(currentInput);

  function markers() {
    return [
      { id: 'start', x: currentInput.start % currentInput.grid.w, y: Math.floor(currentInput.start / currentInput.grid.w), color: 0x22c55e, label: 'S' },
      { id: 'goal', x: currentInput.goal % currentInput.grid.w, y: Math.floor(currentInput.goal / currentInput.grid.w), color: 0xf43f5e, label: 'G' },
    ];
  }

  function markersForEditor() {
    return markers().map((m) => ({ ...m, color: 0x22c55e }));
  }

  function refreshMarkers() {
    canvas.setMarkers(markers());
    canvas.render();
  }

  function installEditor() {
    editor?.dispose();
    const spec = inputSpec.editor!;
    editor = mountGridEditor(toolbarHost, spec, {
      canvas: canvas.canvas,
      cellAt: (x, y) => canvas.cellAt(x, y),
      getTarget: () => currentInput.grid,
      onEdit: (edit: GridEdit) => {
        const patch = applyEdit(currentInput.grid, edit);
        notify();
        return patch;
      },
      onChanged: () => { notify(); refreshMarkers(); },
      requestRender: () => { refreshMarkers(); render(position); },
      getMarkers: markersForEditor,
      onMarkerMove: (id, x, y) => {
        const grid = currentInput.grid;
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return false;
        const cell = y * grid.w + x;
        if (grid.cells[cell] === 1) return false;
        if (id === 'start') {
          if (cell === currentInput.goal) return false;
          currentInput = { ...currentInput, start: cell };
        } else {
          if (cell === currentInput.start) return false;
          currentInput = { ...currentInput, goal: cell };
        }
        notify();
        refreshMarkers();
        return true;
      },
      onExport: () => {
        const blob = new Blob([exportJson(currentInput.grid, currentInput.start, currentInput.goal)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'pathfinding-grid.json'; a.click();
        URL.revokeObjectURL(url);
      },
      onImport: (text) => {
        const doc = importJson(text);
        if (!doc) { message.textContent = 'Import failed: not a valid grid JSON file.'; return; }
        message.textContent = '';
        currentInput = { grid: { w: doc.w, h: doc.h, cells: doc.cells }, start: doc.start, goal: doc.goal };
        canvas.setGrid(currentInput.grid);
        refreshMarkers();
        notify();
      },
      onCopyLink: () => { void navigator.clipboard.writeText(location.href); },
    });
  }

  // generators
  function installGenerators() {
    genHost.innerHTML = '';
    for (const gen of inputSpec.generators ?? []) {
      const box = document.createElement('div');
      box.className = 'flex items-end gap-1.5 rounded-lg bg-slate-900/[.03] p-1.5 dark:bg-white/[.05]';
      const title = document.createElement('span');
      title.className = 'mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-400';
      title.textContent = gen.label;
      box.append(title);
      const values: Record<string, number | string | boolean> = { ...gen.defaults };
      const fields: HTMLInputElement[] = [];
      for (const [key, def] of Object.entries(gen.paramSchema)) {
        const label = document.createElement('label');
        label.className = 'flex flex-col text-[9px] text-slate-400';
        label.textContent = key;
        let inputEl: HTMLInputElement;
        if (def.kind === 'select') {
          inputEl = document.createElement('select') as unknown as HTMLInputElement;
          for (const opt of def.options) {
            const o = document.createElement('option');
            o.value = opt; o.textContent = opt;
            (inputEl as unknown as HTMLSelectElement).append(o);
          }
          (inputEl as unknown as HTMLSelectElement).value = String(values[key]);
        } else {
          inputEl = document.createElement('input');
          inputEl.type = def.kind === 'number' ? 'number' : 'range';
          if (def.kind === 'range' || def.kind === 'number') {
            inputEl.min = String(def.min ?? 0);
            inputEl.max = String(def.max ?? 100);
            inputEl.step = String(def.step ?? 1);
          }
          inputEl.value = String(values[key]);
        }
        inputEl.className = 'w-20 rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-[10px] dark:border-white/15 dark:bg-white/[.06]';
        inputEl.addEventListener('input', () => {
          values[key] = inputEl.type === 'number' || inputEl.type === 'range' ? Number(inputEl.value) : inputEl.value;
        });
        label.append(inputEl);
        box.append(label);
        fields.push(inputEl);
      }
      const go = document.createElement('button');
      go.type = 'button';
      go.textContent = 'Generate';
      go.className = 'rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900';
      go.addEventListener('click', () => {
        const next = gen.generate(currentInput, values, createRng(ctx.seed + (++genCounter)));
        currentInput = next;
        canvas.setGrid(next.grid);
        refreshMarkers();
        notify();
      });
      box.append(go);
      genHost.append(box);
      void fields;
    }
  }

  function makeCursor(trace: PathTrace): TraceCursor<PathState> {
    return new TraceCursor<PathState>({
      length: trace.kind.length,
      every: 128,
      create: () => ({ cellState: new Uint8Array(trace.w * trace.h), onPath: new Uint8Array(trace.w * trace.h) }),
      apply(s, i) {
        const kind = trace.kind[i]!;
        const cell = trace.cell[i]!;
        if (cell < 0) return;
        if (kind === STEP.OPEN || kind === STEP.UPDATE) s.cellState[cell] = 1;
        else if (kind === STEP.EXPAND) s.cellState[cell] = 2;
        else if (kind === STEP.SCAN) { if (s.cellState[cell] === 0) s.cellState[cell] = 3; }
        else if (kind === STEP.PATH) s.onPath[cell] = 1;
      },
      clone(s) { return { cellState: s.cellState.slice(), onPath: s.onPath.slice() }; },
    });
  }

  function render(pos: number) {
    position = pos;
    if (!result || !cursor) return;
    const trace = result.data;
    const state = cursor.seek(pos);
    const n = trace.w * trace.h;
    const overlay = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      if (state.onPath[i]) overlay[i] = overlayColor(0xf59e0b, 0.95);
      else if (state.cellState[i] === 2) overlay[i] = overlayColor(0x6366f1, 0.55);
      else if (state.cellState[i] === 1) overlay[i] = overlayColor(0x3b82f6, 0.45);
      else if (state.cellState[i] === 3) overlay[i] = overlayColor(0x22d3ee, 0.22);
    }
    const stepKind = pos > 0 ? trace.kind[pos - 1] : -1;
    const stepCell = pos > 0 ? trace.cell[pos - 1]! : -1;
    if (stepCell >= 0 && stepKind !== STEP.PATH) overlay[stepCell] = overlayColor(0xfacc15, 0.85);
    canvas.setOverlay(overlay);
    canvas.render();
    updateStats(pos);
  }

  function updateStats(pos: number) {
    if (!result || !params) return;
    const trace = result.data;
    const s = result.summary as PathTrace['summary'] & { admissible?: boolean; optimal?: boolean; optimalCost?: number };
    const expandedAt = trace.expandedCum[Math.min(pos, trace.expandedCum.length - 1)] ?? 0;
    const frontierAt = pos > 0 ? trace.frontier[pos - 1] ?? 0 : 0;
    const badge = (ok: boolean, text: string) => `<span class="rounded px-1.5 py-0.5 font-bold ${ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'}">${text}</span>`;
    const adm = isAdmissible(params.heuristic, params.diagonal, params.heuristicWeight);
    stats.innerHTML = `
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">found <b>${s.found ? 'yes' : 'no'}</b> · cost <b>${s.found ? s.cost : '—'}</b></div>
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">expanded <b>${expandedAt}</b> · frontier <b>${frontierAt}</b></div>
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">generated <b>${s.generated}</b> · scanned <b>${s.scanned}</b></div>
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">path <b>${s.pathCells || 0}</b> cells · step #${pos}/${result.length}</div>
      <div class="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-4">
        ${badge(adm, adm ? 'heuristic admissible' : 'heuristic NOT admissible')}
        ${badge(!!s.optimal, s.optimal ? 'path optimal' : `not optimal (best ${s.optimalCost})`)}
        <span class="text-slate-400">${heuristicLabel(params.heuristic)} · ${params.diagonal ? '8-connected' : '4-connected'} · ${params.weighted ? 'weighted' : 'uniform'}</span>
      </div>`;
  }

  installGenerators();
  canvas.setGrid(currentInput.grid);
  refreshMarkers();
  installEditor();
  canvas.setGrid(currentInput.grid);
  refreshMarkers();

  return {
    setInput(value) {
      currentInput = value;
      canvas.setGrid(currentInput.grid);
      refreshMarkers();
      installEditor();
    },
    setResult(res, paramsUnknown) {
      result = res;
      params = paramsUnknown as Params;
      cursor = makeCursor(res.data);
      render(Math.min(position, res.length));
    },
    render,
    dispose() {
      editor?.dispose();
      canvas.dispose();
      host.innerHTML = '';
    },
  };
}

/** Contrast helper exposed for tests (theme palettes are distinct). */
export function gridsDiffer(a: Input, b: Input): boolean {
  if (a.grid.w !== b.grid.w || a.grid.h !== b.grid.h) return true;
  const ca = cloneGrid(a.grid).cells;
  const cb = b.grid.cells;
  for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) return true;
  return false;
}
