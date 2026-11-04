import type { EventSimulation } from '../../core/types';
import { meta } from './meta';
import { deriveTimeline, schedulerSim, type Params, type SchedEvent, type State } from './logic';
import { render } from './render';
import { mountCompare } from './compare';

const sim: EventSimulation<Params, State, SchedEvent, never> = {
  ...schedulerSim,
  meta,
  render: (state, rc, view) => render(state, rc, view),
  deriveTimeline: (log, now, params) => {
    void params;
    // deriveTimeline needs live state; the shell passes log+now only, so the
    // sim keeps a weak handle set by render (called every frame before).
    return deriveTimeline(log, now, lastState ?? emptyState());
  },
  extraTabLabel: 'Compare',
  mountExtraTab: (host, ctx) => mountCompare(host, ctx),
  about: {
    summary:
      'Classic CPU scheduling as a discrete-event simulation: arrivals, dispatches, quantum expiries and context switches are events on an integer timeline, so every number can be checked by hand. Scrub the timeline back to any dispatch and watch the ready queue as it was at that moment.',
    bullets: [
      'Textbook anchors: the convoy preset gives FCFS avg wait 17, SJF 3, RR(q=4) ≈ 5.67 — the tests assert exactly those numbers.',
      'Edit the workload in the process-table editor (arrival:burst:priority); it writes back into the URL, so a workload is a shareable link.',
      'The Compare tab runs FCFS/SJF/RR/priority/SRTF headlessly on the same workload with aligned Gantt charts.',
      'Conventions are part of the model: lower priority number wins, same-time arrivals beat the preempted process into the queue, context-switch cost only when switching to a different process.',
    ],
    invariant: 'Every process’s CPU slices sum exactly to its burst, and slices never overlap (property-tested on seeded random workloads).',
  },
  concepts:
    '## Concepts\n\n**Why SJF is optimal (and unusable).** Shortest-job-first minimises average waiting for a fixed set of jobs, but real systems cannot know future burst lengths — they estimate them (exponential averaging of past bursts), which is what MLFQ approximates without any estimates at all.\n\n**The convoy effect.** One long job ahead of many short ones (FCFS) destroys average waiting: 24+3+3 gives avg wait 17 vs 3 for SJF. It is the simplest demonstration that scheduling policy, not CPU speed, often dominates latency.\n\n**Round robin and quantum choice.** Too small a quantum and context switches eat the CPU (raise the switch cost slider and watch utilisation fall); too large and RR degenerates into FCFS.\n\n**References.** Arpaci-Dusseau, *Operating Systems: Three Easy Pieces* (scheduling chapters, free online); Silberschatz et al., *Operating System Concepts*.\n\n*Educational model: single CPU, integer time, no I/O bursts or multi-level feedback (MLFQ is a noted stretch goal).*',
};

// The event shell derives the timeline from the log alone; scheduler lanes
// need per-process state, so render() (always called before the timeline
// refresh in the shell) keeps the latest state here.
let lastState: State | null = null;
const baseRender = sim.render;
sim.render = (state, rc, view) => {
  lastState = state;
  baseRender(state, rc, view);
};

function emptyState(): State {
  return { procs: [], ready: [], running: -1, switchingTo: -1, epoch: 0, runStart: 0, lastPid: -1, dispatchPending: false, slices: [], switches: 0, params: schedulerSim.defaultParams };
}

export default sim;
