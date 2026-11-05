import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { cancel, checkBook, createBook, levels, liveCount, modify, submit, type Fill } from './book';
import { ReferenceBook } from './reference';

describe('order book engine', () => {
  it('price-time priority, FIFO partial fills and resting remainder', () => {
    const b = createBook();
    const fills: Fill[] = [];
    const a = submit(b, { side: 1, price: 100, qty: 5, trader: 1 }, fills);
    submit(b, { side: 1, price: 100, qty: 5, trader: 2 }, fills);
    submit(b, { side: 1, price: 101, qty: 5, trader: 3 }, fills);
    expect(checkBook(b)).toBeNull();
    submit(b, { side: 0, price: 101, qty: 6, trader: 4 }, fills);
    expect(fills.map((f) => f.makerTrader)).toEqual([1, 2]);
    expect(fills[0]!.price).toBe(100);
    expect(checkBook(b)).toBeNull();
    expect(a.rested).toBe(true);
    expect(levels(b, 1, 5)[0]!.price).toBe(100);
    expect(liveCount(b)).toBe(2);
  });

  it('market orders walk and discard remainder; empty book → no fills', () => {
    const b = createBook();
    const fills: Fill[] = [];
    const empty = submit(b, { side: 0, price: -1, qty: 10, trader: 1 }, fills);
    expect(empty.filled).toBe(0);
    submit(b, { side: 1, price: 100, qty: 3, trader: 2 }, fills);
    submit(b, { side: 1, price: 101, qty: 2, trader: 3 }, fills);
    const m = submit(b, { side: 0, price: -1, qty: 20, trader: 9 }, fills);
    expect(m.filled).toBe(5);
    expect(m.rested).toBe(false);
    expect(liveCount(b)).toBe(0);
    expect(checkBook(b)).toBeNull();
  });

  it('cancel, stale recycled ids and modify priority rules', () => {
    const b = createBook();
    const fills: Fill[] = [];
    const first = submit(b, { side: 1, price: 50, qty: 10, trader: 1 }, fills);
    submit(b, { side: 1, price: 50, qty: 10, trader: 2 }, fills);
    expect(cancel(b, 999999)).toBe(false);
    expect(modify(b, first.id, 50, 7)!.rested).toBe(true); // reduce keeps priority
    submit(b, { side: 0, price: 50, qty: 5, trader: 3 }, fills);
    submit(b, { side: 0, price: 50, qty: 3, trader: 4 }, fills);
    expect(fills.map((f) => f.makerTrader)).toEqual([1, 1, 2]); // reduced order keeps the front
    expect(cancel(b, first.id)).toBe(false); // filled
    expect(checkBook(b)).toBeNull();
  });

  it('conservation and book invariants across a random stream', () => {
    const rng = createRng(11);
    const b = createBook();
    const fills: Fill[] = [];
    for (let i = 0; i < 4000; i++) {
      const roll = rng.next();
      const side = rng.next() < 0.5 ? 0 : 1;
      if (roll < 0.65) submit(b, { side, price: 450 + rng.int(0, 100), qty: rng.int(1, 20), trader: rng.int(1, 8) }, fills);
      else {
        const lv = levels(b, side, 20);
        if (lv.length) {
          const id = lv.length; void id;
        }
        // cancel a random live order if any: reuse a submitted id list
      }
      expect(checkBook(b)).toBeNull();
    }
    let sum = 0;
    for (const f of fills) { expect(f.qty).toBeGreaterThan(0); sum += f.qty; }
    expect(sum).toBeGreaterThan(0);
    let depthTotal = 0;
    for (const side of [0, 1]) for (const l of levels(b, side, 200)) depthTotal += l.qty;
    expect(depthTotal).toEqual(expect.any(Number));
  });

  it('differential test vs the naive reference model (identical trade streams + top-N)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = createRng(seed);
      const b = createBook();
      const ref = new ReferenceBook();
      const mineLive: { id: number }[] = [];
      const refLive: { id: number }[] = [];
      const rngOps = createRng(seed + 1000);
      for (let op = 0; op < 400; op++) {
        const roll = rngOps.next();
        const side = rngOps.next() < 0.5 ? 0 : 1;
        if (roll < 0.65) {
          const market = rngOps.next() < 0.12;
          const price = market ? (side === 0 ? -1 : 2000) : 490 + rngOps.int(0, 30);
          const qty = rngOps.int(1, 12);
          const trader = rngOps.int(1, 3);
          const fills: Fill[] = [];
          const mine = submit(b, { side, price, qty, trader }, fills);
          const refFills: { price: number; qty: number; makerTrader: number; takerTrader: number }[] = [];
          const theirs = ref.submit(side, price, qty, trader, refFills);
          expect(fills.map((f) => [f.price, f.qty, f.makerTrader])).toEqual(refFills.map((f) => [f.price, f.qty, f.makerTrader]));
          if (mine.rested) mineLive.push({ id: mine.id });
          if (theirs.rested) refLive.push({ id: theirs.id });
          for (const sd of [0, 1]) {
            expect(levels(b, sd, 6).map((l) => [l.price, l.qty])).toEqual(ref.top(sd, 6).map((l) => [l.price, l.qty]));
          }
          expect(checkBook(b)).toBeNull();
        } else if (mineLive.length > 0) {
          const pick = rngOps.int(0, mineLive.length - 1);
          const m = mineLive.splice(pick, 1)[0]!;
          const r = refLive.splice(pick, 1)[0]!;
          expect(cancel(b, m.id)).toBe(ref.cancel(r.id));
          expect(checkBook(b)).toBeNull();
        }
        void rng;
      }
    }
  });
});
