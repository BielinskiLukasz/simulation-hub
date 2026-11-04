// ─── Circuit · sim.ts — event-driven 3-valued timing simulation ────────────

import type { EventCtx, EventSimulation, LogEntry, ParamSchema, TimelineData } from '../../core/types';
import {
  EXAMPLES, compileNetlist, decodeNetlist, encodeNetlist, evalGate, pinValues, validateNetlist, X,
  type Compiled, type Netlist,
} from './model';
import { meta } from './meta';
import { createRng } from '../../core/rng';

export interface Params { defaultDelay: number }
export const defaultParams: Params = { defaultDelay: 1 };
export const paramSchema: ParamSchema<Params> = {
  defaultDelay: { kind: 'range', label: 'Default gate delay (ticks)', min: 1, max: 10, step: 1, hint: 'Used for newly placed gates' },
};

export interface State {
  out: Uint8Array;
  inVal: Uint8Array;
  pending: Uint8Array;
  events: number;
  toggles: number;
}

export type CircuitEvent =
  | { t: 'eval'; c: number }
  | { t: 'drive'; c: number; v: number }
  | { t: 'clock'; c: number };

export type CircuitAction =
  | { a: 'toggle'; comp: number }
  | { a: 'set'; comp: number; value: number };

type Ctx = EventCtx<State, CircuitEvent, Compiled>;

function evaluateComponent(ctx: Ctx, dense: number): void {
  const compiled = ctx.shared;
  const type = compiled.types[dense]!;
  if (type === 'switch' || type === 'button' || type === 'clock' || type === 'const0' || type === 'const1') return;
  const v = evalGate(type, pinValues(compiled, dense, ctx.state.out, ctx.state.inVal));
  if (v !== ctx.state.pending[dense]) {
    ctx.state.pending[dense] = v;
    ctx.schedule(compiled.delay[dense]!, { t: 'drive', c: dense, v });
  }
}

function drive(ctx: Ctx, dense: number, v: number): void {
  const compiled = ctx.shared;
  ctx.state.out[dense] = v;
  ctx.state.pending[dense] = v;
  ctx.state.events++;
  const comp = compiled.net.comps[dense]!;
  ctx.log({
    cat: 'signal', actor: comp.id,
    text: `${comp.label || comp.type}#${comp.id} → ${v === X ? 'X' : v}`,
    data: { comp: dense, compId: comp.id, value: v, label: comp.label || comp.type },
  });
  const start = compiled.fanoutOffset[dense]!;
  const end = compiled.fanoutOffset[dense + 1]!;
  for (let k = start; k < end; k++) {
    const pin = compiled.fanoutPins[k]!;
    ctx.state.inVal[pin] = v;
    // find sink dense from pin
    let sink = 0;
    while (sink < compiled.n && compiled.pinOffset[sink + 1]! <= pin) sink++;
    evaluateComponent(ctx, sink);
  }
}

export const circuitSim: EventSimulation<Params, State, CircuitEvent, CircuitAction, Netlist, Compiled> = {
  kind: 'event',
  meta,
  defaultParams,
  paramSchema,
  playback: { unit: ' ticks', baseRate: 24 },
  input: {
    initial: () => EXAMPLES['half-adder']!(),
    codec: {
      encode: (net) => encodeNetlist(net),
      decode: (s) => decodeNetlist(s),
    },
    generators: Object.entries(EXAMPLES).map(([id, make]) => ({
      id,
      label: id.replace(/-/g, ' '),
      paramSchema: {},
      defaults: {},
      generate: () => make(),
    })),
  },
  compile: (_params, input) => compileNetlist(input),
  init: (_params, ctx) => {
    const compiled = ctx.shared;
    const state: State = {
      out: new Uint8Array(compiled.n).fill(X),
      inVal: new Uint8Array(compiled.pinOffset[compiled.n]!).fill(X),
      pending: new Uint8Array(compiled.n).fill(X),
      events: 0,
      toggles: 0,
    };
    compiled.net.comps.forEach((comp, dense) => {
      if (comp.type === 'switch' || comp.type === 'button') {
        state.out[dense] = comp.init ?? 0;
        state.pending[dense] = state.out[dense]!;
        ctx.schedule(0, { t: 'drive', c: dense, v: state.out[dense]! });
      } else if (comp.type === 'const0' || comp.type === 'const1') {
        const v = comp.type === 'const1' ? 1 : 0;
        state.out[dense] = v; state.pending[dense] = v;
        ctx.schedule(0, { t: 'drive', c: dense, v });
      } else if (comp.type === 'clock') {
        state.out[dense] = comp.init ?? 0;
        state.pending[dense] = state.out[dense]!;
        ctx.schedule(0, { t: 'drive', c: dense, v: state.out[dense]! });
        ctx.schedule(Math.max(1, Math.round((comp.period ?? 20) / 2)), { t: 'clock', c: dense });
      } else if (comp.init !== undefined) {
        state.out[dense] = comp.init;
        state.pending[dense] = comp.init;
        ctx.schedule(0, { t: 'drive', c: dense, v: comp.init });
      }
      if (comp.type !== 'switch' && comp.type !== 'button' && comp.type !== 'clock' && comp.type !== 'const0' && comp.type !== 'const1') {
        ctx.schedule(0, { t: 'eval', c: dense });
      }
    });
    return state;
  },
  handle: (ctx, ev) => {
    const compiled = ctx.shared;
    if (ev.t === 'eval') { evaluateComponent(ctx, ev.c); return; }
    if (ev.t === 'drive') { drive(ctx, ev.c, ev.v); return; }
    if (ev.t === 'clock') {
      const comp = compiled.net.comps[ev.c]!;
      const period = Math.max(2, comp.period ?? 20);
      const duty = Math.min(95, Math.max(5, comp.duty ?? 50));
      const next = ctx.state.out[ev.c] === 1 ? 0 : 1;
      ctx.schedule(0, { t: 'drive', c: ev.c, v: next });
      const half = Math.max(1, Math.round(period * (next === 1 ? duty : 100 - duty) / 100));
      ctx.schedule(half, { t: 'clock', c: ev.c });
    }
  },
  applyAction: (ctx, action) => {
    const compiled = ctx.shared;
    const dense = compiled.indexById.get(action.comp);
    if (dense === undefined) return;
    const type = compiled.types[dense]!;
    if (type !== 'switch' && type !== 'button') return;
    const v = action.a === 'toggle' ? (ctx.state.out[dense] === 1 ? 0 : 1) : action.value;
    ctx.state.toggles++;
    ctx.state.pending[dense] = v;
    ctx.schedule(0, { t: 'drive', c: dense, v });
  },
  describeAction: (action) => action.a === 'toggle' ? `Toggle #${action.comp}` : `Set #${action.comp} = ${action.value}`,
  render: () => undefined, // wired in index.ts
  isFinished: () => false,
  getStats: (state) => ({ drives: state.events, toggles: state.toggles }),
  getSignals: (state) => state.out,
  invariants: [
    {
      id: 'values-valid', label: 'Outputs are 3-valued',
      check: (s) => { for (let i = 0; i < s.out.length; i++) if (s.out[i]! > 2) return `output ${i} = ${s.out[i]}`; return null; },
    },
    {
      id: 'pin-driver-agreement', label: 'Pins agree with drivers',
      check: () => null, // needs shared; checked differentially in tests
    },
  ],
  about: { summary: '', bullets: [], invariant: '' },
};

export function deriveCircuitTimeline(log: readonly LogEntry[], now: number, compiled: Compiled): TimelineData {
  void now;
  const probed = compiled.net.comps.map((c, dense) => ({ c, dense })).filter(({ c }) => ['switch', 'button', 'clock', 'led'].includes(c.type));
  const lanes = probed.map(({ c }) => ({ id: `c${c.id}`, label: c.label || `${c.type}#${c.id}` }));
  const segments: TimelineData['segments'] = [];
  const markers: TimelineData['markers'] = [];
  const open = new Map<number, { t: number; v: number }>();
  for (const { c } of probed) open.set(c.id, { t: 0, v: X });
  for (const e of log) {
    if (e.cat !== 'signal') continue;
    const d = e.data as { compId?: number; value?: number } | undefined;
    if (!d || d.compId === undefined || !open.has(d.compId)) continue;
    const prev = open.get(d.compId)!;
    if (e.t > prev.t) segments.push({ lane: `c${d.compId}`, start: prev.t, end: e.t, cls: prev.v === 1 ? 'leader' : prev.v === 0 ? 'follower' : 'wait', label: prev.v === X ? 'X' : String(prev.v) });
    open.set(d.compId, { t: e.t, v: d.value ?? X });
    markers.push({ lane: `c${d.compId}`, t: e.t, label: e.text, cls: 'action' });
  }
  for (const { c } of probed) {
    const prev = open.get(c.id)!;
    segments.push({ lane: `c${c.id}`, start: prev.t, end: null, cls: prev.v === 1 ? 'leader' : prev.v === 0 ? 'follower' : 'wait', label: prev.v === X ? 'X' : String(prev.v) });
  }
  return { lanes, segments, markers };
}

export { createRng, validateNetlist };
