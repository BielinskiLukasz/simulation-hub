import type { EventSimulation } from '../../core/types';
import { meta } from './meta';
import { circuitSim, deriveCircuitTimeline, defaultParams, type CircuitAction, type CircuitEvent, type Params, type State } from './sim';
import { compileNetlist, truthTable, verifyAdder, type Compiled, type Netlist } from './model';
import { compXY, render } from './render';
import { circuitEditorSpec } from './editor';

function mountTruth(host: HTMLElement, ctx: { input?: unknown }): { dispose(): void } {
  host.innerHTML = '';
  const net = ctx.input as Netlist | undefined;
  if (!net) { host.textContent = 'No netlist loaded.'; return { dispose: () => { host.innerHTML = ''; } }; }
  let compiled: Compiled;
  try { compiled = compileNetlist(net); } catch (err) { host.textContent = err instanceof Error ? err.message : String(err); return { dispose: () => { host.innerHTML = ''; } }; }
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3 text-[12px]';
  const verify = verifyAdder(compiled);
  const status = document.createElement('div');
  status.className = `rounded-xl border p-3 font-mono text-[11px] ${verify.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'}`;
  status.textContent = verify.ok
    ? `Verify as adder: PASS — all ${verify.checked} input combinations produce the correct 5-bit sum.`
    : `Verify as adder: not an adder (or incomplete labels) — ${verify.firstMismatch ?? 'labels A0..A3, B0..B3, Cin, S0..S3, Cout required'}.`;
  wrap.append(status);
  try {
    const table = truthTable(compiled);
    const el = document.createElement('div');
    el.className = 'overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10';
    el.innerHTML = `<table class="w-full font-mono text-[11px]"><thead><tr class="bg-slate-900/[.04] dark:bg-white/[.05]">${[...table.inputs.map((c) => c.label || `#${c.id}`), ...table.outputs.map((c) => c.label || `#${c.id}`)].map((h) => `<th class="px-2 py-1.5 text-left">${h}</th>`).join('')}</tr></thead><tbody>${table.rows.map((r) => `<tr class="border-t border-slate-100 dark:border-white/[.06]">${[...r.inputs, ...r.outputs].map((v) => `<td class="px-2 py-1">${v === 2 ? 'X' : v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    wrap.append(el);
  } catch (err) {
    const p = document.createElement('p');
    p.className = 'rounded-xl bg-rose-500/10 p-3 text-rose-600 dark:text-rose-300';
    p.textContent = err instanceof Error ? err.message : String(err);
    wrap.append(p);
  }
  host.append(wrap);
  return { dispose: () => { host.innerHTML = ''; } };
}

const sim: EventSimulation<Params, State, CircuitEvent, CircuitAction, Netlist, Compiled> = {
  ...circuitSim,
  meta,
  input: circuitSim.input ? { ...circuitSim.input, editor: circuitEditorSpec } : undefined,
  render: (state, rc, view, shared) => render(state, rc, view, shared),
  deriveTimeline: (log, now, _params, shared) => shared ? deriveCircuitTimeline(log, now, shared) : { lanes: [], segments: [], markers: [] },
  onCanvasAction: () => null,
  getActions: (state, shared) => {
    if (!shared) return [];
    return shared.net.comps
      .filter((c) => c.type === 'switch' || c.type === 'button')
      .map((c) => {
        const dense = shared.indexById.get(c.id)!;
        const v = state.out[dense]!;
        return { label: `${c.type === 'button' ? 'Press' : 'Toggle'} ${c.label || c.type} (#${c.id}) → ${v === 1 ? 0 : 1}`, action: { a: 'toggle', comp: c.id } as CircuitAction };
      });
  },
  extraTabLabel: 'Truth table',
  mountExtraTab: (host, ctx) => mountTruth(host, ctx as { input?: unknown }),
  about: {
    summary:
      'Event-driven digital logic in three values (0, 1, X) with transport delays. Every change propagates after its gate delay, so glitches, hazards, latches and ring oscillators behave like real gate-level simulation — and the whole run time-travels.',
    bullets: [
      'Open the Editor tab to place, move, wire and delete gates; Generate loads half/full adders, an SR latch, a ring oscillator and a verified 4-bit adder.',
      'SR latch starts grey (X) and resolves when S or R is driven; the ring oscillator period is exactly 6 ticks with delay-1 inverters.',
      'Waveform lanes below track switches and LEDs; click a marker/segment to seek to that event, scrub back, then toggle a switch to branch.',
      'Truth table tab enumerates switch combinations with the independent topological evaluator; “Verify as adder” checks all 512 combinations.',
      'Feedback components are outlined pink and labelled — feedback is allowed (latches need it) and detected with Tarjan SCC.',
    ],
    invariant: 'Settled event-sim outputs equal the topological evaluator on acyclic circuits (differential-tested), and the 4-bit adder passes all 512 combinations.',
  },
  concepts:
    '## Concepts\n\n**Three-valued logic.** X means “unknown yet”. AND(0, X) = 0 but AND(1, X) = X: the value is the consensus of all 0/1 completions. That is why an SR latch can start honestly unknown instead of pretending to be 0.\n\n**Transport delay.** Every scheduled change is delivered after the gate delay, so a 1-tick glitch on `A AND (NOT A)` survives and appears in the waveform. Inertial delay (stretch) would swallow such pulses.\n\n**Feedback.** Combinational evaluation needs a DAG; latches deliberately break it. The event engine handles cycles naturally, and Tarjan SCC labels the loop.\n\n**References.** Harris & Harris, *Digital Design and Computer Architecture*; IEEE 1364 background on multi-valued logic.\n\n*Teaching model: unit-ish per-gate delays, no wire delay, no analog behaviour.*',
};

// Canvas clicks toggle switches (in addition to the Actions tab / editor).
const baseActions = sim.getActions;
sim.getActions = baseActions;
sim.onCanvasAction = (_state, x, y, _ev, shared) => {
  if (!shared) return null;
  for (const comp of shared.net.comps) {
    if (comp.type !== 'switch' && comp.type !== 'button') continue;
    const p = compXY(comp);
    if (Math.abs(x - p.x) <= 34 && Math.abs(y - p.y) <= 22) return { a: 'toggle', comp: comp.id };
  }
  return null;
};

export default sim;
export { defaultParams };
