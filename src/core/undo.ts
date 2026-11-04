// ─── core/undo.ts — generic capped undo/redo stack ──────────────────────────

export class UndoStack<P> {
  private entries: P[] = [];
  private cursor = 0; // number of applied entries
  constructor(private cap = 200) {}

  push(entry: P): void {
    this.entries.length = this.cursor;
    this.entries.push(entry);
    if (this.entries.length > this.cap) this.entries.shift();
    this.cursor = this.entries.length;
  }

  undo(): P | null {
    if (this.cursor === 0) return null;
    this.cursor--;
    return this.entries[this.cursor]!;
  }

  redo(): P | null {
    if (this.cursor >= this.entries.length) return null;
    const e = this.entries[this.cursor]!;
    this.cursor++;
    return e;
  }

  get canUndo(): boolean { return this.cursor > 0; }
  get canRedo(): boolean { return this.cursor < this.entries.length; }
  get size(): number { return this.entries.length; }
  clear(): void { this.entries = []; this.cursor = 0; }
}
