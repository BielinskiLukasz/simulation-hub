// ─── Order book · ladder.tsx — live book ladder panel ──────────────────────

import { useEffect, useState } from 'react';
import type { Shared, State } from './sim';
import { SIDE_BUY, SIDE_SELL, levels } from './book';

export function BookLadder({ state, shared }: { state: State; shared: Shared }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 200);
    return () => window.clearInterval(t);
  }, []);
  const bids = levels(state.book, SIDE_BUY, 8);
  const asks = levels(state.book, SIDE_SELL, 8);
  const max = Math.max(1, ...bids.map((l) => l.qty), ...asks.map((l) => l.qty));
  void shared;
  return (
    <div className="space-y-1 font-mono text-[10px]">
      <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Book ladder · top 8 levels</div>
      {asks.slice().reverse().map((l) => (
        <div key={`a${l.price}`} className="flex items-center gap-2">
          <span className="w-12 text-rose-500">{l.price}</span>
          <div className="h-3 rounded-sm bg-rose-500/25" style={{ width: `${(l.qty / max) * 70}%` }} />
          <span className="text-slate-400">{l.qty}</span>
        </div>
      ))}
      <div className="py-0.5 text-center text-[9px] font-bold text-amber-500">spread {Math.max(0, (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0))}</div>
      {bids.map((l) => (
        <div key={`b${l.price}`} className="flex items-center gap-2">
          <span className="w-12 text-emerald-500">{l.price}</span>
          <div className="h-3 rounded-sm bg-emerald-500/25" style={{ width: `${(l.qty / max) * 70}%` }} />
          <span className="text-slate-400">{l.qty}</span>
        </div>
      ))}
      <p className="pt-1 text-[9px] text-slate-400">Withdrawal timeline: market makers cancel quotes under volatility, then re-quote.</p>
    </div>
  );
}
