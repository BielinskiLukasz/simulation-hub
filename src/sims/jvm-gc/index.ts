import type { EventSimulation, Invariant } from '../../core/types';
import { meta } from './meta';
import { deriveTimeline, gcSim, type GcEvent, type Params, type State } from './logic';
import { checkHeap } from './heap';
import { render } from './render';
import { mountCompare } from './compare';

const heapInvariant: Invariant<State> = {
  id: 'heap-safety',
  label: 'Heap safety (accounting + owner consistency)',
  check: (s) => checkHeap(s.heap),
};

const sim: EventSimulation<Params, State, GcEvent, never> = {
  ...gcSim,
  meta,
  invariants: [heapInvariant],
  defaultHiddenCategories: [],
  render: (state, rc, view) => render(state, rc, view),
  deriveTimeline: (log, now, _params) => {
    void _params;
    return deriveTimeline(log, now, lastState ?? emptyState());
  },
  extraTabLabel: 'Compare collectors',
  mountExtraTab: (host, ctx) => mountCompare(host, ctx),
  about: {
    summary:
      'An educational model of JVM garbage collection — not a JVM emulator. Objects are allocated on a 64×N cell heap with seeded lifetimes and a reference forest; collectors pause the mutator (stop-the-world) and do real marking, copying, sweeping and compaction over that heap, with pauses priced by a documented cost model.',
    bullets: [
      'Mark-sweep shows stop-the-world cost growing with the live set, plus true fragmentation: allocation can fail with plenty of free cells but no contiguous run. Flip on Compact and watch the holes vanish at pause cost.',
      'Generational exploits the weak generational hypothesis: most objects die young, so minor GCs copy only young survivors; the old→young references (raise “Cross-gen references”) keep young objects alive through dead old parents — real nepotism, visible in the grid.',
      'Leaky workload: leaked objects are never dropped, full GCs go back-to-back, and the run ends in OutOfMemoryError. That ending is a designed outcome, not a crash.',
      'The Compare tab runs both collectors headlessly on the same seed/workload and tabulates throughput and pause percentiles.',
      'Every cost constant lives in constants.ts, tuned for legibility (full GC ≈ 50–150 ms), not measured from a real JVM.',
    ],
    invariant: 'Heap safety holds after every collection: no reachable object is ever freed, and used + free cells always equals the heap size (oracle-tested).',
  },
  concepts:
    '## Concepts\n\n**This is a model, not a JVM.** The heap is a cell grid, objects are contiguous cell runs, and pause times come from a cost formula in `constants.ts`. The behaviours — fragmentation, nepotism, promotion, leak-driven OOM — are faithful; the milliseconds are illustrative.\n\n**The generational bet.** Most objects die young, so scanning only the young generation is cheap and frequent; the few survivors are promoted. The bet fails for caches (long-lived by design) — try `cache-heavy` and watch full GCs return.\n\n**Remembered sets.** A minor GC must find young objects referenced from old ones without scanning the whole old gen; real JVMs use card tables for this. Here the parent forest makes those edges explicit (and nepotism possible).\n\n**References.** Jones, Hosking & Moss, *The Garbage Collection Handbook*; Detlefs et al., *Garbage-First Garbage Collection* (ISMM 2004); OpenJDK GC tuning guides.\n\n*Educational model only — not a faithful JVM implementation.*',
};

let lastState: State | null = null;
const baseRender = sim.render;
sim.render = (state, rc, view) => {
  lastState = state;
  baseRender(state, rc, view);
};

function emptyState(): State {
  return gcSim.init(gcSim.defaultParams, { rng: undefined as never, shared: undefined as never, schedule: () => 0 });
}

export default sim;
