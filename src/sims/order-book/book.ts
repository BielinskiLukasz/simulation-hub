// ─── Order book · book.ts — price-time priority matching engine ───────────
// Integer ticks/lots only. Fixed slot pool with generation-checked ids
// (id = slot + gen·CAP) so a stale id can never touch a recycled slot.
// Per-price FIFO linked lists; best bid/ask advance past empty levels.

export const CAP = 4096;
export const MAX_TICKS = 1023;
export const SIDE_BUY = 0;
export const SIDE_SELL = 1;

export interface BookState {
  side: Int8Array;
  price: Int32Array;
  qty: Int32Array;
  remaining: Int32Array;
  trader: Int32Array;
  seq: Int32Array;
  next: Int32Array;
  prev: Int32Array;
  live: Uint8Array;
  gen: Uint16Array;
  free: Int32Array;
  freeCount: number;
  headBid: Int32Array;
  tailBid: Int32Array;
  depthBid: Int32Array;
  headAsk: Int32Array;
  tailAsk: Int32Array;
  depthAsk: Int32Array;
  bestBid: number;
  bestAsk: number;
  nextSeq: number;
}

export interface Order { side: number; price: number; qty: number; trader: number }
export interface Fill { price: number; qty: number; makerId: number; takerId: number; makerTrader: number; takerTrader: number; takerSide: number }
export interface SubmitResult { id: number; filled: number; rested: boolean; rejected?: string }

export function createBook(): BookState {
  const free = new Int32Array(CAP);
  for (let i = 0; i < CAP; i++) free[i] = CAP - 1 - i;
  return {
    side: new Int8Array(CAP), price: new Int32Array(CAP), qty: new Int32Array(CAP), remaining: new Int32Array(CAP),
    trader: new Int32Array(CAP), seq: new Int32Array(CAP), next: new Int32Array(CAP).fill(-1), prev: new Int32Array(CAP).fill(-1),
    live: new Uint8Array(CAP), gen: new Uint16Array(CAP),
    free, freeCount: CAP,
    headBid: new Int32Array(MAX_TICKS + 1).fill(-1), tailBid: new Int32Array(MAX_TICKS + 1).fill(-1), depthBid: new Int32Array(MAX_TICKS + 1),
    headAsk: new Int32Array(MAX_TICKS + 1).fill(-1), tailAsk: new Int32Array(MAX_TICKS + 1).fill(-1), depthAsk: new Int32Array(MAX_TICKS + 1),
    bestBid: -1, bestAsk: -1, nextSeq: 1,
  };
}

export function liveCount(b: BookState): number { return CAP - b.freeCount; }

function pushBack(b: BookState, slot: number): void {
  const p = b.price[slot]!;
  const buy = b.side[slot] === SIDE_BUY;
  const tail = buy ? b.tailBid : b.tailAsk;
  const head = buy ? b.headBid : b.headAsk;
  const depth = buy ? b.depthBid : b.depthAsk;
  b.prev[slot] = tail[p]!;
  b.next[slot] = -1;
  if (tail[p]! >= 0) b.next[tail[p]!] = slot; else head[p] = slot;
  tail[p] = slot;
  depth[p] = depth[p]! + 1;
  if (buy) {
    if (b.bestBid < 0 || p > b.bestBid) b.bestBid = p;
  } else if (b.bestAsk < 0 || p < b.bestAsk) b.bestAsk = p;
}

function unlink(b: BookState, slot: number): void {
  const p = b.price[slot]!;
  const buy = b.side[slot] === SIDE_BUY;
  const head = buy ? b.headBid : b.headAsk;
  const tail = buy ? b.tailBid : b.tailAsk;
  const depth = buy ? b.depthBid : b.depthAsk;
  const pr = b.prev[slot]!; const nx = b.next[slot]!;
  if (pr >= 0) b.next[pr] = nx; else head[p] = nx;
  if (nx >= 0) b.prev[nx] = pr; else tail[p] = pr;
  b.prev[slot] = -1; b.next[slot] = -1;
  depth[p] = Math.max(0, depth[p]! - 1);
  if (depth[p] === 0) {
    if (buy) {
      while (b.bestBid >= 0 && b.depthBid[b.bestBid] === 0) b.bestBid--;
    } else {
      while (b.bestAsk <= MAX_TICKS && b.bestAsk >= 0 && b.depthAsk[b.bestAsk] === 0) b.bestAsk++;
      if (b.bestAsk > MAX_TICKS) b.bestAsk = -1;
    }
  }
}

function release(b: BookState, slot: number): void {
  b.live[slot] = 0;
  b.gen[slot] = (b.gen[slot]! + 1) & 0xffff;
  b.free[b.freeCount++] = slot;
}

function acquire(b: BookState): number {
  if (b.freeCount === 0) return -1;
  return b.free[--b.freeCount]!;
}

function idOf(b: BookState, slot: number): number { return slot + b.gen[slot]! * CAP; }
function slotOf(b: BookState, id: number): number {
  const slot = id % CAP;
  const gen = Math.floor(id / CAP);
  if (slot < 0 || slot >= CAP || !b.live[slot] || b.gen[slot] !== gen) return -1;
  return slot;
}

/** Submit a limit or market order. Market = price -1 (buy) / MAX_TICKS+1 (sell). */
export function submit(b: BookState, order: Order, fills: Fill[]): SubmitResult {
  if (order.side !== SIDE_BUY && order.side !== SIDE_SELL) return { id: -1, filled: 0, rested: false, rejected: 'side' };
  if (!Number.isInteger(order.qty) || order.qty <= 0) return { id: -1, filled: 0, rested: false, rejected: 'qty' };
  const isMarket = order.price < 0 || order.price > MAX_TICKS;
  if (!isMarket && (order.price < 0 || order.price > MAX_TICKS)) return { id: -1, filled: 0, rested: false, rejected: 'price' };
  if (!isMarket && !Number.isInteger(order.price)) return { id: -1, filled: 0, rested: false, rejected: 'price' };
  const slot = acquire(b);
  if (slot < 0) return { id: -1, filled: 0, rested: false, rejected: 'pool' };
  b.side[slot] = order.side; b.price[slot] = isMarket ? (order.side === SIDE_BUY ? MAX_TICKS + 1 : -1) : order.price;
  b.qty[slot] = order.qty; b.remaining[slot] = order.qty; b.trader[slot] = order.trader;
  b.seq[slot] = b.nextSeq++; b.live[slot] = 1;
  let filled = 0;
  const buy = order.side === SIDE_BUY;
  for (;;) {
    const best = buy ? b.bestAsk : b.bestBid;
    if (best < 0) break;
    if (!isMarket) {
      if (buy && best > order.price) break;
      if (!buy && best < order.price) break;
    }
    const restingSlot = buy ? b.headAsk[best]! : b.headBid[best]!;
    if (restingSlot < 0) break;
    const tradeQty = Math.min(b.remaining[slot]!, b.remaining[restingSlot]!);
    if (tradeQty <= 0) { release(b, restingSlot); continue; }
    fills.push({
      price: b.price[restingSlot]!, qty: tradeQty,
      makerId: idOf(b, restingSlot), takerId: idOf(b, slot),
      makerTrader: b.trader[restingSlot]!, takerTrader: b.trader[slot]!,
      takerSide: order.side,
    });
    filled += tradeQty;
    b.remaining[slot] = b.remaining[slot]! - tradeQty;
    b.remaining[restingSlot] = b.remaining[restingSlot]! - tradeQty;
    if (b.remaining[restingSlot] === 0) { unlink(b, restingSlot); release(b, restingSlot); }
    if (b.remaining[slot] === 0) break;
  }
  if (b.remaining[slot] === 0) {
    const id = idOf(b, slot);
    release(b, slot);
    return { id, filled, rested: false };
  }
  if (isMarket) {
    const id = idOf(b, slot);
    release(b, slot);
    return { id, filled, rested: false };
  }
  pushBack(b, slot);
  return { id: idOf(b, slot), filled, rested: true };
}

export function cancel(b: BookState, id: number): boolean {
  const slot = slotOf(b, id);
  if (slot < 0) return false;
  unlink(b, slot);
  release(b, slot);
  return true;
}

export function modify(b: BookState, id: number, price: number, qty: number): { id: number; filled: number; rested: boolean; rejected?: string } | null {
  const slot = slotOf(b, id);
  if (slot < 0) return null;
  const oldQty = b.remaining[slot]!;
  const oldPrice = b.price[slot]!;
  const side = b.side[slot]!;
  const trader = b.trader[slot]!;
  if (Number.isInteger(qty) && qty > 0 && qty <= oldQty && price === oldPrice) {
    b.qty[slot] = qty;
    b.remaining[slot] = qty;
    return { id, filled: 0, rested: true };
  }
  cancel(b, id);
  return submit(b, { side, price, qty, trader }, []);
}

export function bestBidAsk(b: BookState): { bid: number; ask: number } {
  return { bid: b.bestBid, ask: b.bestAsk };
}

export function depthAt(b: BookState, side: number, price: number): number {
  return depthFor(b, side)[price] ?? 0;
}
function depthFor(b: BookState, side: number): Int32Array {
  return side === SIDE_BUY ? b.depthBid : b.depthAsk;
}

export interface Level { price: number; qty: number; count: number }

export function levels(b: BookState, side: number, n: number): Level[] {
  const out: Level[] = [];
  const depth = depthFor(b, side);
  if (side === SIDE_BUY) {
    for (let p = b.bestBid; p >= 0 && out.length < n; p--) {
      if (depth[p]! === 0) continue;
      let qty = 0;
      for (let s = b.headBid[p]!; s >= 0; s = b.next[s]!) qty += b.remaining[s]!;
      out.push({ price: p, qty, count: depth[p]! });
    }
  } else {
    if (b.bestAsk < 0) return out;
    for (let p = b.bestAsk; p <= MAX_TICKS && out.length < n; p++) {
      if (depth[p]! === 0) continue;
      let qty = 0;
      for (let s = b.headAsk[p]!; s >= 0; s = b.next[s]!) qty += b.remaining[s]!;
      out.push({ price: p, qty, count: depth[p]! });
    }
  }
  return out;
}

/** Invariants: book not crossed, live-order accounting, FIFO seq order per level. */
export function checkBook(b: BookState): string | null {
  if (b.bestBid >= 0 && b.bestAsk >= 0 && b.bestBid >= b.bestAsk) return `crossed: ${b.bestBid} >= ${b.bestAsk}`;
  let liveQty = 0; let counted = 0;
  for (let slot = 0; slot < CAP; slot++) {
    if (!b.live[slot]) continue;
    counted++;
    if (b.remaining[slot]! <= 0) return 'live order with non-positive remaining';
    liveQty += b.remaining[slot]!;
    const p = b.price[slot]!;
    const list = b.side[slot] === SIDE_BUY ? b.headBid : b.headAsk;
    let found = false;
    for (let s = list[p]!; s >= 0; s = b.next[s]!) if (s === slot) { found = true; break; }
    if (!found) return 'live order missing from its level list';
    if (b.side[slot] === SIDE_BUY && b.bestBid >= 0 && p > b.bestBid) return 'bid above best';
    if (b.side[slot] === SIDE_SELL && b.bestAsk >= 0 && p < b.bestAsk) return 'ask below best';
  }
  if (counted !== liveCount(b)) return 'live accounting mismatch';
  for (let p = 0; p <= MAX_TICKS; p++) {
    for (const [head, side] of [[b.headBid, SIDE_BUY], [b.headAsk, SIDE_SELL]] as const) {
      let lastSeq = -1;
      for (let s = head[p]!; s >= 0; s = b.next[s]!) {
        if (!b.live[s]) return 'dead order in list';
        if (b.side[s] !== side) return 'wrong side in list';
        if (b.price[s] !== p) return 'wrong price in list';
        if (b.seq[s]! < lastSeq) return 'FIFO violated';
        lastSeq = b.seq[s]!;
      }
    }
  }
  let levelQty = 0;
  for (const side of [SIDE_BUY, SIDE_SELL]) {
    const depth = depthFor(b, side);
    for (let p = 0; p <= MAX_TICKS; p++) {
      if (depth[p]! === 0) continue;
      for (let s = (side === SIDE_BUY ? b.headBid : b.headAsk)[p]!; s >= 0; s = b.next[s]!) levelQty += b.remaining[s]!;
    }
  }
  if (levelQty !== liveQty) return 'quantity accounting mismatch';
  return null;
}
