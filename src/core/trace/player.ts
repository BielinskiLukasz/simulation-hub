// ─── core/trace/player.ts — fractional-rate playback over a trace ──────────

export class TracePlayer {
  position = 0;
  playing = false;
  rate = 60;
  private carry = 0;
  onChange: (() => void) | null = null;

  constructor(public length: number) {}

  setLength(n: number): void {
    this.length = Math.max(0, Math.floor(n));
    if (this.position > this.length) this.position = this.length;
    this.emit();
  }

  tick(dtSeconds: number): void {
    if (!this.playing || this.length === 0) return;
    this.carry += Math.max(0, dtSeconds) * this.rate;
    if (this.carry < 1) return;
    const advance = Math.floor(this.carry);
    this.carry -= advance;
    this.position += advance;
    if (this.position >= this.length) {
      this.position = this.length;
      this.playing = false;
      this.carry = 0;
    }
    this.emit();
  }

  stepForward = (k = 1): void => { this.seek(this.position + k); this.playing = false; };
  stepBack = (k = 1): void => { this.seek(this.position - k); this.playing = false; };
  seek = (n: number): void => {
    this.position = Math.max(0, Math.min(Math.floor(n), this.length));
    this.emit();
  };
  toStart = (): void => { this.seek(0); this.playing = false; this.emit(); };
  toEnd = (): void => { this.seek(this.length); this.playing = false; this.emit(); };
  togglePlay = (): void => {
    if (this.position >= this.length) this.position = 0;
    this.playing = !this.playing;
    this.emit();
  };
  fitRate = (seconds: number): void => {
    this.rate = Math.max(0.2, this.length / Math.max(0.2, seconds));
    this.emit();
  };

  private emit(): void { this.onChange?.(); }
}
