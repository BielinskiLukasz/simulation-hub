// ─── ui/grid-editor.ts — shared grid editor (Pathfinding + Falling sand) ───
// Tools, palette, brush size/shape, undo/redo (one entry per stroke),
// draggable markers, JSON import/export. Framework-free DOM helper.

import type { GridEdit, GridEditorSpec, GridPatch, GridTarget } from '../core/types';
import { applyPatch, mergePatches } from '../core/grid/ops';
import { UndoStack } from '../core/undo';

export interface EditorContext {
  canvas: HTMLCanvasElement;
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null;
  getTarget(): GridTarget;
  onEdit(edit: GridEdit): GridPatch | null;
  onChanged?(): void;
  requestRender?(): void;
  getMarkers?(): { id: string; x: number; y: number; color: number; label: string }[];
  onMarkerMove?(id: string, x: number, y: number): boolean;
  onExport?(): void;
  onImport?(json: string): void;
  onCopyLink?(): void;
}

export interface EditorHandle { dispose(): void }

export function mountGridEditor<T>(host: HTMLElement, spec: GridEditorSpec<T>, ctx: EditorContext): EditorHandle {
  host.innerHTML = '';
  const undoStack = new UndoStack<GridPatch>(120);
  let tool: (typeof spec.tools)[number] = spec.tools[0] ?? 'brush';
  let value = spec.palette[0]?.value ?? 1;
  let size = 1;
  let shape: 'circle' | 'square' = 'circle';
  const filledRect = true;
  let painting = false;
  let strokeStart: { x: number; y: number } | null = null;
  let last: { x: number; y: number } | null = null;
  let strokePatches: GridPatch[] = [];
  let draggingMarker: string | null = null;

  const bar = document.createElement('div');
  bar.className = 'flex flex-wrap items-center gap-1.5';
  host.append(bar);

  const btn = (label: string, title: string, onClick: () => void, active = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-pressed', String(active));
    b.className = `rounded-lg border px-2 py-1 text-[11px] font-bold transition ${active
      ? 'border-amber-400 bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : 'border-slate-300 text-slate-500 hover:bg-slate-900/[.04] dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[.06]'}`;
    b.addEventListener('click', onClick);
    bar.append(b);
    return b;
  };

  const toolButtons: HTMLButtonElement[] = [];
  const toolLabels: Record<string, string> = { brush: 'Brush', line: 'Line', rect: 'Rect', fill: 'Fill', eraser: 'Eraser' };
  spec.tools.forEach((t, i) => {
    toolButtons.push(btn(`${i + 1} ${toolLabels[t]}`, `Tool: ${t} (${i + 1})`, () => { tool = t; refreshTools(); }));
  });

  const sep = document.createElement('span');
  sep.className = 'mx-1 h-5 w-px bg-slate-300 dark:bg-white/15';
  bar.append(sep);

  const swatches: HTMLButtonElement[] = [];
  spec.palette.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = p.label + (p.hint ? ` — ${p.hint}` : '');
    b.setAttribute('aria-label', p.label);
    b.setAttribute('aria-pressed', 'false');
    b.className = 'h-6 w-6 rounded-md border border-black/20 ring-offset-1 transition hover:scale-110 dark:border-white/30';
    b.style.background = `#${p.color.toString(16).padStart(6, '0')}`;
    b.addEventListener('click', () => { value = p.value; refreshPalette(); });
    swatches.push(b);
    bar.append(b);
  });

  const sizeLabel = document.createElement('label');
  sizeLabel.className = 'ml-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-400 dark:text-slate-500';
  sizeLabel.innerHTML = 'brush';
  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = '1';
  sizeInput.max = '9';
  sizeInput.step = '2';
  sizeInput.value = '1';
  sizeInput.style.width = '64px';
  sizeInput.setAttribute('aria-label', 'Brush size');
  sizeInput.addEventListener('input', () => {
    size = Number(sizeInput.value);
    shapeToggle.textContent = shape === 'circle' ? '○ circle' : '□ square';
    ctx.requestRender?.();
  });
  sizeLabel.append(sizeInput);
  bar.append(sizeLabel);

  const shapeToggle = btn('○ circle', 'Toggle brush shape', () => {
    shape = shape === 'circle' ? 'square' : 'circle';
    shapeToggle.textContent = shape === 'circle' ? '○ circle' : '□ square';
  });

  if (spec.undo) {
    const undoBtn = btn('↶ Undo', 'Undo (Ctrl/Cmd+Z)', () => doUndo());
    const redoBtn = btn('↷ Redo', 'Redo (Ctrl/Cmd+Shift+Z)', () => doRedo());
    void undoBtn; void redoBtn;
  }
  if (ctx.onExport) btn('Export', 'Export grid JSON', ctx.onExport);
  if (ctx.onImport) {
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.className = 'hidden';
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      void f.text().then((text) => ctx.onImport?.(text));
      file.value = '';
    });
    host.append(file);
    btn('Import', 'Import grid JSON', () => file.click());
  }
  if (ctx.onCopyLink) btn('Copy link', 'Copy a link to this grid', ctx.onCopyLink);

  const hint = document.createElement('p');
  hint.className = 'mt-1.5 text-[10.5px] leading-snug text-slate-400 dark:text-slate-500';
  hint.textContent = 'Drag to paint · right-click erases · 1–5 tools · −/= brush size · Ctrl/Cmd+Z undo · drag S/G markers';
  host.append(hint);

  function refreshTools() {
    spec.tools.forEach((t, i) => toolButtons[i]!.className = `rounded-lg border px-2 py-1 text-[11px] font-bold transition ${tool === t
      ? 'border-amber-400 bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : 'border-slate-300 text-slate-500 hover:bg-slate-900/[.04] dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[.06]'}`);
  }
  function refreshPalette() {
    spec.palette.forEach((p, i) => {
      const active = value === p.value;
      swatches[i]!.style.outline = active ? '2px solid #f59e0b' : 'none';
      swatches[i]!.style.outlineOffset = '2px';
    });
  }

  function pushStroke(patches: GridPatch[]) {
    const merged = mergePatches(patches);
    if (merged.index.length > 0 && spec.undo) undoStack.push(merged);
  }
  function doUndo() {
    const patch = undoStack.undo();
    if (!patch) return;
    applyPatch(ctx.getTarget(), patch, 'undo');
    ctx.onChanged?.();
    ctx.requestRender?.();
  }
  function doRedo() {
    const patch = undoStack.redo();
    if (!patch) return;
    applyPatch(ctx.getTarget(), patch, 'redo');
    ctx.onChanged?.();
    ctx.requestRender?.();
  }

  function edit(ed: GridEdit): GridPatch | null {
    const patch = ctx.onEdit(ed);
    if (patch && patch.index.length > 0) strokePatches.push(patch);
    return patch;
  }

  const onDown = (e: PointerEvent) => {
    const cell = ctx.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    ctx.canvas.setPointerCapture(e.pointerId);
    const markers = ctx.getMarkers?.() ?? [];
    for (const m of markers) {
      if (Math.abs(cell.x - m.x) <= 1 && Math.abs(cell.y - m.y) <= 1) {
        draggingMarker = m.id;
        return;
      }
    }
    painting = true;
    strokeStart = cell;
    last = cell;
    strokePatches = [];
    if (tool === 'fill') {
      edit({ op: 'fill', x: cell.x, y: cell.y, value });
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      edit({ op: 'stamp', x: cell.x, y: cell.y, value: tool === 'eraser' ? spec.eraseValue : value, size, shape, onlyEmpty: spec.paintOnlyEmpty && tool !== 'eraser' });
    }
  };

  const onMove = (e: PointerEvent) => {
    const cell = ctx.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    if (draggingMarker) {
      if (ctx.onMarkerMove) {
        const accepted = ctx.onMarkerMove(draggingMarker, cell.x, cell.y);
        if (accepted) ctx.requestRender?.();
      }
      return;
    }
    if (!painting) return;
    if ((tool === 'brush' || tool === 'eraser') && last && (last.x !== cell.x || last.y !== cell.y)) {
      edit({ op: 'line', x0: last.x, y0: last.y, x1: cell.x, y1: cell.y, value: tool === 'eraser' ? spec.eraseValue : value, size, onlyEmpty: spec.paintOnlyEmpty && tool !== 'eraser' });
      last = cell;
    }
  };

  const onUp = (e: PointerEvent) => {
    const cell = ctx.cellAt(e.clientX, e.clientY);
    if (draggingMarker) { draggingMarker = null; return; }
    if (!painting) return;
    painting = false;
    if ((tool === 'line' || tool === 'rect') && strokeStart && cell) {
      if (tool === 'line') edit({ op: 'line', x0: strokeStart.x, y0: strokeStart.y, x1: cell.x, y1: cell.y, value, size });
      else edit({ op: 'rect', x0: strokeStart.x, y0: strokeStart.y, x1: cell.x, y1: cell.y, value, filled: !e.altKey && filledRect });
    }
    pushStroke(strokePatches);
    strokePatches = [];
    strokeStart = null;
    last = null;
  };

  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    const cell = ctx.cellAt(e.clientX, e.clientY);
    if (cell) edit({ op: 'stamp', x: cell.x, y: cell.y, value: spec.eraseValue, size, shape });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (e.key >= '1' && e.key <= '5') {
      const idx = Number(e.key) - 1;
      if (spec.tools[idx]) { tool = spec.tools[idx]!; refreshTools(); }
    }
    if (e.key === '-' || e.key === '_') { size = Math.max(1, size - 2); sizeInput.value = String(size); }
    if (e.key === '=' || e.key === '+') { size = Math.min(9, size + 2); sizeInput.value = String(size); }
  };

  ctx.canvas.addEventListener('pointerdown', onDown);
  ctx.canvas.addEventListener('pointermove', onMove);
  ctx.canvas.addEventListener('pointerup', onUp);
  ctx.canvas.addEventListener('contextmenu', onContext);
  const keyTarget = ctx.canvas;
  keyTarget.tabIndex = 0;
  keyTarget.addEventListener('keydown', onKey);

  refreshTools();
  refreshPalette();

  return {
    dispose() {
      ctx.canvas.removeEventListener('pointerdown', onDown);
      ctx.canvas.removeEventListener('pointermove', onMove);
      ctx.canvas.removeEventListener('pointerup', onUp);
      ctx.canvas.removeEventListener('contextmenu', onContext);
      keyTarget.removeEventListener('keydown', onKey);
      host.innerHTML = '';
    },
  };
}
