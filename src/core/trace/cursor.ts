// ─── core/trace/cursor.ts — checkpointed time-travel over a trace ──────────
// Position semantics: position n means steps 0..n-1 have been applied.
// position 0 = initial state, position length = final state.

export interface TraceCursorSpec<S> {
  length: number;
  every: number;
  create(): S;
  apply(s: S, i: number): void;
  clone(s: S): S;
}

export class TraceCursor<S> {
  private checkpoints = new Map<number, S>();
  private _position = 0;
  private _state: S;

  constructor(private spec: TraceCursorSpec<S>) {
    const temp = spec.create();
    this.checkpoints.set(0, spec.clone(temp));
    for (let i = 0; i < spec.length; i++) {
      spec.apply(temp, i);
      if ((i + 1) % spec.every === 0 || i + 1 === spec.length) {
        this.checkpoints.set(i + 1, spec.clone(temp));
      }
    }
    this._state = spec.clone(this.checkpoints.get(0)!);
  }

  get position(): number { return this._position; }
  get state(): S { return this._state; }
  get length(): number { return this.spec.length; }
  get checkpointCount(): number { return this.checkpoints.size; }

  seek(n: number): S {
    const target = Math.max(0, Math.min(Math.floor(n), this.spec.length));
    if (target === this._position) return this._state;
    if (target < this._position) {
      let best = 0;
      for (const key of this.checkpoints.keys()) if (key <= target && key > best) best = key;
      this._state = this.spec.clone(this.checkpoints.get(best)!);
      this._position = best;
    }
    while (this._position < target) {
      this.spec.apply(this._state, this._position);
      this._position++;
    }
    return this._state;
  }
}
