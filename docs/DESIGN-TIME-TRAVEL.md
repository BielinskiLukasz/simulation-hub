# Design: Deterministic Time-Travel Engine

**Context:** Simulation Hub Phase 3 (Signature Simulations)  
**Status:** Implemented (`core/des/engine.ts`, `core/des/player.ts`, `core/des/event-queue.ts`)

---

## 1. High-Level Model

In Simulation Hub, discrete-event simulations operate under a purely functional state-transition model:

$$\text{State}(n) = f(\text{Params}, \text{Seed}, \text{InputLog}_{0..n})$$

Time-travel does not continuously record every state frame. Instead, it combines **periodic snapshots** with **bounded replay**:

```
[Snapshot @ 0] ─── Replay ───► [Snapshot @ 200] ─── Replay ───► [Snapshot @ 400]
                                      ▲
                                 Seek to 247:
                     Restore Snap(200) + Replay 47 events
```

This guarantees:
1. **Bounded memory footprint:** Only $O(\text{Snapshots} \times |\text{State}|)$ bytes are kept in memory, dynamically thinned if memory pressure grows.
2. **Sub-millisecond scrub latency:** Seeking to any arbitrary event position $n$ requires replaying at most `snapshotEvery` events (default 200).
3. **Exact reproducibility:** Every scrub, rewind, and branch is identical down to every bit.

---

## 2. Why Integer Simulation Time?

Float time in discrete-event systems causes cumulative numerical drift and tie-breaking anomalies:
- In floating point, $t + \Delta t_1 + \Delta t_2 \ne t + \Delta t_2 + \Delta t_1$.
- Events scheduled at ostensibly the "same" time could end up with different float representations ($0.30000000000000004$ vs $0.3$).

**Design decision:** All simulation time is strictly integer units:
- **Raft:** Milliseconds ($1 \text{ ms} = 1$).
- **CPU Scheduler:** Abstract time units ($1 \text{ u} = 1$).
- **JVM GC:** Microseconds ($1 \text{ µs} = 1$).

Tie-breaking between simultaneous events is strictly deterministic using `(time, id)` order, where `id` is a monotonically increasing counter generated when pushing onto the binary min-heap.

---

## 3. The Event Queue & Lazy Cancellation

The event queue (`core/des/event-queue.ts`) is a binary min-heap ordered by `(time, id)`.

### Lazy Cancellation
When a timer or pending message is cancelled (e.g., Raft node receives a heartbeat and resets its election timer):
- The event's integer ID is marked in a `Set<number>`.
- The heap is not rearranged immediately ($O(1)$ cancel).
- When popping from the top of the heap, cancelled items are discarded ($O(\log N)$ on pop).
- `queue.size` immediately reflects live items.

### Snapshotting the Queue
`snapshot()` yields a plain JavaScript object containing:
- The raw heap array
- The cancelled ID array
- Monotonic counters (`nextId`, `live`)

Restoring takes $O(K)$ where $K$ is the heap length, completely avoiding queue rebuild overhead.

---

## 4. Input Log & Branching Semantics

Interactive user actions (e.g. killing a Raft node, healing a partition, modifying a process table) are recorded in an append-only input log:

```ts
interface Input<A> {
  atEvent: number; // Event position (head) when the action occurred
  action: A;       // Action payload
}
```

### Replay Rule
During forward execution or replay:
1. Event $i$ is popped and handled by `sim.handle(ctx, event)`.
2. Head advances to $i$.
3. Any actions with `atEvent === i` are applied in order via `sim.applyAction(ctx, action)`.

### Seeking in the Past
When the user scrubs the timeline backward from event $450$ to event $120$:
- The engine restores `Snapshot(0)`.
- It replays up to event $120$, re-applying any recorded actions with `atEvent <= 120`.
- The event log beyond $120$ is truncated.
- The user sees the cluster or CPU exactly as it was at event $120$.

### Branching History
If the user acts while at event $120$ (e.g. crashing node 2 instead of node 1):
- All recorded inputs with `atEvent > 120` are discarded.
- All snapshots beyond event $120$ are purged.
- `maxComputed` is reset to $120$.
- The action is appended at `atEvent: 120`, and execution continues into a new future.
- The UI alerts the user with a toast notification: `"Branched at event 120"`.

---

## 5. The Golden Test: Replay Equivalence

In `core/des/testing.ts`, `assertReplayEquivalence` enforces that no simulation violates the time-travel contract:

```ts
assertReplayEquivalence(sim, params, seed, {
  events: 400,
  cuts: [0, 37, 137, 399],
  actions: [{ atEvent: 150, make: () => ({ ... }) }]
});
```

For every cut point $c$:
1. A reference run executes to the end, logging all state transitions.
2. An independent player runs, pauses at cut $c$, rewinds to the beginning, and runs forward to the end.
3. The final state and the complete event log must be **deep-equal** to the reference run.

If a developer introduces a hidden global, reads `Date.now()`, uses an unseeded `Math.random()`, or stores state in a non-clonable object, `assertReplayEquivalence` fails immediately.

---

## 6. Plain Data Invariant (`assertPlainData`)

`structuredClone` silently converts class instances to plain objects, losing methods and prototypes.

Every Phase 3 simulation runs `assertPlainData(state)` in its test suite:
- Recursive walk over the entire state tree.
- Verifies that all values are primitives, plain objects, standard arrays, or typed arrays.
- Fails loudly if a function, symbol, prototype, or DOM element is detected.

---

## 7. Tradeoffs & Future Work (Phase 4 / Phase 6)

1. **Large Typed Arrays in State:**  
   In the JVM GC visualizer, cloning typed arrays (`4096` cells) takes $< 0.1 \text{ ms}$. For large-scale grids (e.g. $100{,}000$ cells in future simulations), copy-on-write page chunks will be preferable to full clones.
2. **Action Script Sharing:**  
   Short interactive sessions ($< 1{,}800$ characters) serialize into URL query parameters (`?actions=[...]`). For longer sessions, users export a `.json` reproduction trace that includes initial seed, parameters, input log, and full event transcript.
