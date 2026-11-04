# Time-Travel Debugger Studio

An interactive time-travel studio and visual state machine inspector built on
Simulation Hub's discrete-event engine (`core/des/`).

## Capabilities

- **Integer Simulation Time:** Discrete events scheduled in integer milliseconds ($t \in \mathbb{N}$).
- **Periodic Snapshotting:** Full state checkpoints captured every $N$ events (default 50) with sub-millisecond seek latency guaranteed by bounded replay.
- **Timeline Branching:** Scrub backward to any point in history, inject a fault or transaction, and fork into a divergent alternate timeline.
- **Invariant Checking:** Continuous evaluation of monotonic revisions, cross-replica value matching, and bounded lag after every event.
- **100% Deterministic Replay:** Replaying any session with its input log produces bit-identical states across machines.

## Controls & Actions

- **Scrubber Bar:** Drag or scrub across all executed events.
- **Keyboard Shortcuts:** `Space` (play/pause), `.` (step forward), `,` (step backward), `Home` (start), `End` (furthest computed), `L` (log tab), `R` (reset).
- **Actions:** SET registers ($X, Y, Z$), crash nodes, recover nodes, partition network, heal partition, corrupt in-flight packets.
- **Checkpoints Tab:** Deep-dive into memory snapshot sizes and branching lineage.
