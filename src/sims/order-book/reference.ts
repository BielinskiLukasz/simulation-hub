// ─── Order book · reference.ts — naive model for differential testing ────
// Arrays sorted by (price, seq), linear scans, no clever tricks. Tests only.

export interface RefOrder { id: number; side: number; price: number; qty: number; remaining: number; trader: number; seq: number }

export class ReferenceBook {
  live: RefOrder[] = [];
  private seq = 1;
  private nextId = 1;

  submit(side: number, price: number, qty: number, trader: number, fills: { price: number; qty: number; makerTrader: number; takerTrader: number }[]): { id: number; filled: number; rested: boolean } {
    const isMarket = price < 0 || price > 1023;
    const taker: RefOrder = { id: this.nextId++, side, price, qty, remaining: qty, trader, seq: 0 };
    const opposite = side === 0 ? 1 : 0;
    let filled = 0;
    for (;;) {
      const candidates = this.live.filter((o) => o.side === opposite && o.remaining > 0 && (isMarket || (side === 0 ? o.price <= price : o.price >= price)));
      if (candidates.length === 0) break;
      candidates.sort((a, b) => side === 0 ? a.price - b.price || a.seq - b.seq : b.price - a.price || a.seq - b.seq);
      const maker = candidates[0]!;
      const q = Math.min(taker.remaining, maker.remaining);
      if (q <= 0) break;
      fills.push({ price: maker.price, qty: q, makerTrader: maker.trader, takerTrader: trader });
      filled += q;
      taker.remaining -= q;
      maker.remaining -= q;
      if (maker.remaining === 0) this.live = this.live.filter((o) => o.id !== maker.id);
      if (taker.remaining === 0) break;
    }
    if (taker.remaining > 0 && !isMarket) {
      taker.seq = this.seq++;
      this.live.push(taker);
      return { id: taker.id, filled, rested: true };
    }
    return { id: taker.id, filled, rested: false };
  }

  cancel(id: number): boolean {
    const found = this.live.find((o) => o.id === id);
    if (!found) return false;
    this.live = this.live.filter((o) => o.id !== id);
    return true;
  }

  top(side: number, n: number): { price: number; qty: number }[] {
    const list = [...this.live].filter((o) => o.side === side).sort((a, b) => side === 0 ? b.price - a.price || a.seq - b.seq : a.price - b.price || a.seq - b.seq);
    const out: { price: number; qty: number }[] = [];
    for (const o of list) {
      const level = out.find((l) => l.price === o.price);
      if (level) level.qty += o.remaining; else out.push({ price: o.price, qty: o.remaining });
    }
    return out.slice(0, n);
  }
}
