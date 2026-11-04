# CPU Scheduler

Classic single-CPU scheduling as a discrete-event simulation (integer time):
arrivals, dispatches, quantum expiries, and context switches are events, so
every reported number can be verified by hand.

## Conventions (they change the numbers)

- Lower priority number = higher priority; ties by arrival, then pid.
- RR: processes arriving at the instant of a preemption enqueue **before**
  the preempted process (dispatch is deferred to a zero-delay event so all
  same-time arrivals are visible to `pickNext` — this is what makes t=0 SJF
  textbook-correct).
- Context-switch cost only when dispatching a **different** process.
- Dispatch policy is pure (`algorithms.ts`: `pickNext`, `shouldPreempt`,
  `computeMetrics`); the engine glue is in `logic.ts`.

## Textbook anchors (asserted in tests, context-switch = 0)

| Case | Algorithm | Avg wait |
|---|---|---|
| Convoy 24/3/3 @0 | FCFS | 17 |
| Convoy | SJF | 3 |
| Convoy | RR q=4 | 17/3 ≈ 5.67 |
| Textbook 8/4/9/5 | SJF | 7.75 |
| Textbook | SRTF | 6.5 |

Plus priority preemptive-vs-not, context-switch accounting, workload
encode/parse round-trip, slice-sum/no-overlap properties, SRTF optimality
on seeded workloads, plain-data state, and replay equivalence.

The **Compare tab** runs all five algorithms headlessly on the same
workload with a shared-axis Gantt per algorithm. MLFQ is a documented
stretch goal, not implemented.
