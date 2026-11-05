# Order Book & Market Microstructure

Price–time-priority matching engine plus heterogeneous agents. A stylized toy
market, **not** a replica of any real venue or of May 2010.

## Engine

Integer ticks (0–1023) and lots. Fixed slot pool (4096) with generation-checked
ids (`slot + gen·CAP`), per-price FIFO linked lists, best bid/ask advancing
past empty levels. Trades execute at the resting price; market remainders are
discarded; reducing quantity keeps priority, increasing or re-pricing loses it.
`cancel` is O(1); stale/recycled ids are safe no-ops.

## Agents

Noise traders, market makers (symmetric quotes, inventory skew, **withdraw
under volatility** for 600 ms), trend followers (lookback return), stop-loss
holders (fire once), and an institutional seller used by the shock action.
Cash and inventory move between exactly two parties per trade.

## Tests (12)

Engine unit tests (priority, walk-the-book, market remainder, cancel/modify,
boundaries, conservation); **differential test** vs an independent naive
reference over random operation streams (identical trade streams and top-N
snapshots); fuzz with invariants after every event; seek-back branch test;
ledger test; **mutation checks** proving the crossed-book and cash-leak
invariants actually fail when faults are injected.

## Batch

Sweep market-maker count, variants calm vs flash-crash, common random numbers.
Metrics: max drawdown, crash indicator, flash-crash indicator, min depth, mean
spread; probabilities use Wilson intervals.

## Known gaps (honest)

No queue-position optimisation, hidden liquidity, latency distribution,
self-trade prevention or real data. A full mutation-flag harness (`_bug`
parameters), circuit breaker, and ladder panel beyond the renderer are not
implemented.
