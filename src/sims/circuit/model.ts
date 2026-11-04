// ─── Circuit · model.ts — 3-valued logic, netlists, compiler, evaluator ────
// Values: 0, 1, 2 (= X). Transport delays are integer ticks >= 1.

import { stronglyConnectedComponents } from '../../core/graph/scc';
import { ByteReader, ByteWriter, base64UrlToBytes } from '../../core/codec';

export type GateType = 'and' | 'or' | 'not' | 'nand' | 'nor' | 'xor' | 'xnor' | 'buf' | 'switch' | 'button' | 'clock' | 'led' | 'const0' | 'const1';
export const GATE_TYPES: GateType[] = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buf', 'switch', 'button', 'clock', 'led', 'const0', 'const1'];
export const X = 2;

export interface Component {
  id: number;
  type: GateType;
  x: number;
  y: number;
  inputs: number;
  delay: number;
  label: string;
  period?: number;
  duty?: number;
  init?: 0 | 1;
}
export interface Wire { id: number; from: number; to: number; pin: number }
export interface Netlist { comps: Component[]; wires: Wire[]; nextId: number }

export function evalGate(type: GateType, ins: ArrayLike<number>): number {
  const vals = Array.from({ length: ins.length }, (_, i) => ins[i] ?? X);
  switch (type) {
    case 'const0': return 0;
    case 'const1': return 1;
    case 'led': case 'buf': return vals[0] ?? X;
    case 'not': return vals[0] === X ? X : vals[0] === 0 ? 1 : 0;
    case 'and': case 'nand': {
      const r = vals.includes(0) ? 0 : vals.includes(X) ? X : 1;
      return type === 'nand' ? (r === X ? X : r === 0 ? 1 : 0) : r;
    }
    case 'or': case 'nor': {
      const r = vals.includes(1) ? 1 : vals.includes(X) ? X : 0;
      return type === 'nor' ? (r === X ? X : r === 0 ? 1 : 0) : r;
    }
    case 'xor': case 'xnor': {
      if (vals.includes(X)) return X;
      const parity = vals.reduce((a, v) => a ^ v, 0);
      return type === 'xor' ? parity : parity ^ 1;
    }
    default: return X;
  }
}

export function validateNetlist(net: Netlist): string | null {
  if (net.comps.length > 2000) return 'too many components (max 2000)';
  if (net.wires.length > 6000) return 'too many wires (max 6000)';
  const ids = new Set<number>();
  for (const c of net.comps) {
    if (ids.has(c.id)) return `duplicate component id ${c.id}`;
    ids.add(c.id);
    if (!GATE_TYPES.includes(c.type)) return `unknown gate type ${c.type}`;
    if (c.delay < 1 || !Number.isFinite(c.delay)) return `component ${c.id} delay must be >= 1`;
    if (c.inputs < 0 || c.inputs > 8) return `component ${c.id} has invalid input count`;
  }
  const driven = new Set<string>();
  for (const w of net.wires) {
    const sink = net.comps.find((c) => c.id === w.to);
    if (!sink) return `wire ${w.id} targets missing component ${w.to}`;
    if (!ids.has(w.from)) return `wire ${w.id} from missing component ${w.from}`;
    if (w.pin < 0 || w.pin >= sink.inputs) return `wire ${w.id} pin ${w.pin} out of range for ${sink.label || sink.id}`;
    const key = `${w.to}:${w.pin}`;
    if (driven.has(key)) return `input pin ${key} has two drivers`;
    driven.add(key);
  }
  return null;
}

export interface Compiled {
  net: Netlist;
  n: number;
  ids: Int32Array;
  indexById: Map<number, number>;
  types: GateType[];
  delay: Int32Array;
  inputs: Int32Array;
  pinOffset: Int32Array;
  pinDriver: Int32Array; // per pin: driver dense index or -1
  fanoutOffset: Int32Array;
  fanoutPins: Int32Array; // global pin indices
  feedback: Set<number>;
  sccs: number[][];
}

export function compileNetlist(net: Netlist): Compiled {
  const err = validateNetlist(net);
  if (err) throw new Error(`Invalid netlist: ${err}`);
  const n = net.comps.length;
  const ids = Int32Array.from(net.comps.map((c) => c.id));
  const indexById = new Map(net.comps.map((c, i) => [c.id, i]));
  const pinOffset = new Int32Array(n + 1);
  net.comps.forEach((c, i) => { pinOffset[i + 1] = pinOffset[i]! + c.inputs; });
  const totalPins = pinOffset[n]!;
  const pinDriver = new Int32Array(totalPins).fill(-1);
  const fanoutCounts = new Int32Array(n);
  for (const w of net.wires) {
    const sink = indexById.get(w.to)!;
    const driver = indexById.get(w.from)!;
    pinDriver[pinOffset[sink]! + w.pin] = driver;
    fanoutCounts[driver]!++;
  }
  const fanoutOffset = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) fanoutOffset[i + 1] = fanoutOffset[i]! + fanoutCounts[i]!;
  const fanoutPins = new Int32Array(net.wires.length);
  const cursor = Int32Array.from(fanoutOffset.subarray(0, n));
  for (const w of net.wires) {
    const sink = indexById.get(w.to)!;
    const driver = indexById.get(w.from)!;
    fanoutPins[cursor[driver]!++] = pinOffset[sink]! + w.pin;
  }
  const edges: number[][] = Array.from({ length: n }, () => []);
  for (const w of net.wires) {
    const from = indexById.get(w.from)!;
    const to = indexById.get(w.to)!;
    if (!edges[from]!.includes(to)) edges[from]!.push(to);
  }
  const sccs = stronglyConnectedComponents(n, edges);
  const feedback = new Set<number>();
  for (const comp of sccs) {
    if (comp.length > 1) comp.forEach((i) => feedback.add(i));
    else if (edges[comp[0]!]!.includes(comp[0]!)) feedback.add(comp[0]!);
  }
  return {
    net, n, ids, indexById,
    types: net.comps.map((c) => c.type),
    delay: Int32Array.from(net.comps.map((c) => Math.max(1, Math.round(c.delay)))),
    inputs: Int32Array.from(net.comps.map((c) => c.inputs)),
    pinOffset, pinDriver, fanoutOffset, fanoutPins, feedback, sccs,
  };
}

export function pinValues(compiled: Compiled, dense: number, out: ArrayLike<number>, inVal?: ArrayLike<number>): number[] {
  const start = compiled.pinOffset[dense]!;
  const count = compiled.inputs[dense]!;
  const vals: number[] = [];
  for (let p = 0; p < count; p++) {
    if (inVal) vals.push(inVal[start + p] ?? X);
    else {
      const driver = compiled.pinDriver[start + p]!;
      vals.push(driver >= 0 ? out[driver]! : X);
    }
  }
  return vals;
}

export function evaluateCombinational(compiled: Compiled, inputValues: ArrayLike<number>): Uint8Array {
  const n = compiled.n;
  const out = new Uint8Array(n).fill(X);
  const indegree = new Int32Array(n);
  const edges: number[][] = Array.from({ length: n }, () => []);
  for (let sink = 0; sink < n; sink++) {
    const drivers = new Set<number>();
    for (let p = 0; p < compiled.inputs[sink]!; p++) {
      const d = compiled.pinDriver[compiled.pinOffset[sink]! + p]!;
      if (d >= 0) drivers.add(d);
    }
    indegree[sink] = drivers.size;
    for (const d of drivers) edges[d]!.push(sink);
  }
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indegree[i] === 0) queue.push(i);
  let processed = 0;
  while (queue.length) {
    const c = queue.shift()!;
    processed++;
    const type = compiled.types[c]!;
    if (type === 'switch' || type === 'button' || type === 'clock') out[c] = inputValues[c] ?? compiled.net.comps[c]!.init ?? 0;
    else if (type === 'const0') out[c] = 0;
    else if (type === 'const1') out[c] = 1;
    else out[c] = evalGate(type, pinValues(compiled, c, out));
    for (const next of edges[c]!) { indegree[next] = indegree[next]! - 1; if (indegree[next] === 0) queue.push(next); }
  }
  if (processed < n) {
    const cyclic = compiled.net.comps.filter((_, i) => indegree[i]! > 0).map((c) => c.label || `#${c.id}`);
    throw new Error(`Combinational evaluation requires an acyclic circuit; cycle involves: ${cyclic.join(', ')}`);
  }
  return out;
}

// ── codec ───────────────────────────────────────────────────────────────────

const TYPE_CODE = new Map(GATE_TYPES.map((t, i) => [t, i]));

export function encodeNetlist(net: Netlist): string {
  const err = validateNetlist(net);
  if (err) throw new Error(err);
  const w = new ByteWriter();
  w.byte(1).varint(net.comps.length);
  for (const c of net.comps) {
    w.varint(c.id).byte(TYPE_CODE.get(c.type)!).zigzag(c.x).zigzag(c.y).byte(c.inputs).varint(Math.max(1, Math.round(c.delay))).utf8(c.label).varint(c.period ?? 0).byte(c.duty ?? 255).byte(c.init === undefined ? 255 : c.init);
  }
  w.varint(net.wires.length);
  for (const wire of net.wires) w.varint(wire.id).varint(wire.from).varint(wire.to).byte(wire.pin);
  w.varint(net.nextId);
  return w.encode();
}

export function decodeNetlist(s: string): Netlist | null {
  try {
    if (!s || s.length > 120000) return null;
    const bytes = base64UrlToBytes(s);
    if (!bytes) return null;
    const r = new ByteReader(bytes);
    if (r.byte() !== 1) return null;
    const count = r.varint();
    if (count === null || count > 2000) return null;
    const comps: Component[] = [];
    for (let i = 0; i < count; i++) {
      const id = r.varint(); const tc = r.byte(); const x = r.zigzag(); const y = r.zigzag();
      const inputs = r.byte(); const delay = r.varint(); const label = r.utf8(); const period = r.varint(); const duty = r.byte(); const init = r.byte();
      if (id === null || tc === null || x === null || y === null || inputs === null || delay === null || label === null || period === null || duty === null || init === null) return null;
      const type = GATE_TYPES[tc];
      if (!type) return null;
      comps.push({ id, type, x, y, inputs, delay, label, period: period || undefined, duty: duty === 255 ? undefined : duty, init: init === 255 ? undefined : (init as 0 | 1) });
    }
    const wireCount = r.varint();
    if (wireCount === null || wireCount > 6000) return null;
    const wires: Wire[] = [];
    for (let i = 0; i < wireCount; i++) {
      const id = r.varint(); const from = r.varint(); const to = r.varint(); const pin = r.byte();
      if (id === null || from === null || to === null || pin === null) return null;
      wires.push({ id, from, to, pin });
    }
    const nextId = r.varint();
    if (nextId === null || r.left !== 0) return null;
    const net = { comps, wires, nextId };
    return validateNetlist(net) ? null : net;
  } catch { return null; }
}

export function exportNetlistJson(net: Netlist): string { return JSON.stringify(net, null, 2); }
export function importNetlistJson(text: string): Netlist | null {
  try {
    const parsed = JSON.parse(text) as Netlist;
    if (!parsed || !Array.isArray(parsed.comps) || !Array.isArray(parsed.wires)) return null;
    return validateNetlist(parsed) ? null : parsed;
  } catch { return null; }
}

// ── patches ─────────────────────────────────────────────────────────────────

export type NetOp =
  | { op: 'addComponent'; comp: Component }
  | { op: 'moveComponents'; ids: number[]; dx: number; dy: number }
  | { op: 'deleteSelection'; ids: number[] }
  | { op: 'addWire'; wire: Wire }
  | { op: 'removeWire'; id: number }
  | { op: 'setProps'; id: number; props: Partial<Component> };

export interface NetPatch { before: Netlist; after: Netlist }
const clone = (net: Netlist): Netlist => structuredClone(net);

export function applyOp(net: Netlist, op: NetOp): { net: Netlist; patch: NetPatch } {
  const before = clone(net);
  const next = clone(net);
  switch (op.op) {
    case 'addComponent': next.comps.push(structuredClone(op.comp)); next.nextId = Math.max(next.nextId, op.comp.id + 1); break;
    case 'moveComponents': for (const c of next.comps) if (op.ids.includes(c.id)) { c.x += op.dx; c.y += op.dy; } break;
    case 'deleteSelection': next.comps = next.comps.filter((c) => !op.ids.includes(c.id)); next.wires = next.wires.filter((w) => !op.ids.includes(w.from) && !op.ids.includes(w.to)); break;
    case 'addWire': next.wires = next.wires.filter((w) => !(w.to === op.wire.to && w.pin === op.wire.pin)); next.wires.push(structuredClone(op.wire)); next.nextId = Math.max(next.nextId, op.wire.id + 1); break;
    case 'removeWire': next.wires = next.wires.filter((w) => w.id !== op.id); break;
    case 'setProps': { const c = next.comps.find((x) => x.id === op.id); if (c) Object.assign(c, op.props); break; }
  }
  const err = validateNetlist(next);
  if (err) throw new Error(err);
  return { net: next, patch: { before, after: clone(next) } };
}

export function applyNetPatch(net: Netlist, patch: NetPatch, direction: 'undo' | 'redo'): Netlist {
  void net;
  return clone(direction === 'undo' ? patch.before : patch.after);
}

// ── examples ────────────────────────────────────────────────────────────────

class Builder {
  comps: Component[] = [];
  wires: Wire[] = [];
  private next = 1;
  place(type: GateType, x: number, y: number, label = '', extra: Partial<Component> = {}): number {
    const inputs = type === 'not' || type === 'buf' || type === 'led' ? 1 : type === 'switch' || type === 'button' || type === 'clock' || type === 'const0' || type === 'const1' ? 0 : 2;
    const id = this.next++;
    this.comps.push({ id, type, x, y, inputs, delay: 1, label, ...extra });
    return id;
  }
  connect(from: number, to: number, pin = 0): void { this.wires.push({ id: this.next++, from, to, pin }); }
  build(): Netlist { return { comps: this.comps, wires: this.wires, nextId: this.next }; }
}

export function halfAdder(): Netlist {
  const b = new Builder();
  const A = b.place('switch', 0, 2, 'A');
  const B = b.place('switch', 0, 5, 'B');
  const xor = b.place('xor', 3, 2, 'XOR');
  const and = b.place('and', 3, 5, 'AND');
  const S = b.place('led', 6, 2, 'S');
  const C = b.place('led', 6, 5, 'C');
  b.connect(A, xor, 0); b.connect(B, xor, 1); b.connect(A, and, 0); b.connect(B, and, 1);
  b.connect(xor, S); b.connect(and, C);
  return b.build();
}

export function fullAdder(): Netlist {
  const b = new Builder();
  const A = b.place('switch', 0, 1, 'A');
  const B = b.place('switch', 0, 4, 'B');
  const Cin = b.place('switch', 0, 7, 'Cin');
  const x1 = b.place('xor', 3, 1, 'XOR1');
  const a1 = b.place('and', 3, 4, 'AND1');
  const x2 = b.place('xor', 6, 2, 'XOR2');
  const a2 = b.place('and', 6, 5, 'AND2');
  const or = b.place('or', 9, 4, 'OR');
  const S = b.place('led', 12, 2, 'S');
  const Cout = b.place('led', 12, 5, 'Cout');
  b.connect(A, x1, 0); b.connect(B, x1, 1); b.connect(A, a1, 0); b.connect(B, a1, 1);
  b.connect(x1, x2, 0); b.connect(Cin, x2, 1); b.connect(x1, a2, 0); b.connect(Cin, a2, 1);
  b.connect(a1, or, 0); b.connect(a2, or, 1); b.connect(x2, S); b.connect(or, Cout);
  return b.build();
}

export function srLatch(): Netlist {
  const b = new Builder();
  const S = b.place('switch', 0, 1, 'S');
  const R = b.place('switch', 0, 6, 'R');
  const norQ = b.place('nor', 4, 2, 'NOR-Q');
  const norQb = b.place('nor', 4, 5, 'NOR-Qb');
  const Q = b.place('led', 8, 2, 'Q');
  const Qb = b.place('led', 8, 5, 'Qb');
  b.connect(R, norQ, 0); b.connect(norQb, norQ, 1);
  b.connect(S, norQb, 0); b.connect(norQ, norQb, 1);
  b.connect(norQ, Q); b.connect(norQb, Qb);
  return b.build();
}

export function ringOscillator(): Netlist {
  const b = new Builder();
  const n1 = b.place('not', 1, 3, 'N1', { init: 0 });
  const n2 = b.place('not', 4, 3, 'N2');
  const n3 = b.place('not', 7, 3, 'N3');
  const led = b.place('led', 10, 3, 'OUT');
  b.connect(n1, n2); b.connect(n2, n3); b.connect(n3, n1); b.connect(n3, led);
  return b.build();
}

export function adder4(): Netlist {
  const b = new Builder();
  const A: number[] = []; const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    A.push(b.place('switch', 0, i * 3, `A${i}`));
    B.push(b.place('switch', 0, 12 + i * 3, `B${i}`));
  }
  let carry = b.place('switch', 0, 25, 'Cin');
  for (let bit = 0; bit < 4; bit++) {
    const x = bit * 4 + 3;
    const y = bit * 3;
    const x1 = b.place('xor', x, y, `XOR${bit}a`);
    const a1 = b.place('and', x, y + 8, `AND${bit}a`);
    const x2 = b.place('xor', x + 2, y + 2, `XOR${bit}b`);
    const a2 = b.place('and', x + 2, y + 10, `AND${bit}b`);
    const or = b.place('or', x + 4, y + 6, `OR${bit}`);
    const S = b.place('led', x + 6, y + 2, `S${bit}`);
    b.connect(A[bit]!, x1, 0); b.connect(B[bit]!, x1, 1);
    b.connect(A[bit]!, a1, 0); b.connect(B[bit]!, a1, 1);
    b.connect(x1, x2, 0); b.connect(carry, x2, 1);
    b.connect(x1, a2, 0); b.connect(carry, a2, 1);
    b.connect(a1, or, 0); b.connect(a2, or, 1);
    b.connect(x2, S);
    if (bit === 3) {
      const Cout = b.place('led', x + 6, y + 6, 'Cout');
      b.connect(or, Cout);
    }
    carry = or;
  }
  return b.build();
}

export const EXAMPLES: Record<string, () => Netlist> = {
  'half-adder': halfAdder,
  'full-adder': fullAdder,
  'sr-latch': srLatch,
  'ring-oscillator': ringOscillator,
  'adder-4bit': adder4,
};

// ── truth table / adder verification ───────────────────────────────────────

export function truthTable(compiled: Compiled): { inputs: Component[]; outputs: Component[]; rows: { inputs: number[]; outputs: number[] }[] } {
  const inputs = compiled.net.comps.filter((c) => c.type === 'switch' || c.type === 'button');
  const outputs = compiled.net.comps.filter((c) => c.type === 'led');
  if (inputs.length > 10) throw new Error('Truth table supports at most 10 switch/button inputs');
  const rows: { inputs: number[]; outputs: number[] }[] = [];
  for (let mask = 0; mask < (1 << inputs.length); mask++) {
    const values = new Uint8Array(compiled.n);
    inputs.forEach((c, i) => { values[compiled.indexById.get(c.id)!] = (mask >> i) & 1; });
    const out = evaluateCombinational(compiled, values);
    rows.push({
      inputs: inputs.map((_, i) => (mask >> i) & 1),
      outputs: outputs.map((c) => out[compiled.indexById.get(c.id)!]!),
    });
  }
  return { inputs, outputs, rows };
}

export function verifyAdder(compiled: Compiled): { ok: boolean; checked: number; firstMismatch?: string } {
  const byLabel = new Map(compiled.net.comps.map((c) => [c.label, c]));
  const need = ['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'Cin', 'S0', 'S1', 'S2', 'S3', 'Cout'];
  for (const label of need) if (!byLabel.has(label)) return { ok: false, checked: 0, firstMismatch: `missing labelled component ${label}` };
  const dense = (label: string): number => compiled.indexById.get(byLabel.get(label)!.id)!;
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let cin = 0; cin < 2; cin++) {
    const values = new Uint8Array(compiled.n);
    for (let i = 0; i < 4; i++) { values[dense(`A${i}`)!] = (a >> i) & 1; values[dense(`B${i}`)!] = (b >> i) & 1; }
    values[dense('Cin')!] = cin;
    const out = evaluateCombinational(compiled, values);
    let sum = 0;
    for (let i = 0; i < 4; i++) sum |= out[dense(`S${i}`)]! << i;
    sum |= out[dense('Cout')]! << 4;
    const expected = a + b + cin;
    if (sum !== expected) return { ok: false, checked: a * 32 + b * 2 + cin, firstMismatch: `${a}+${b}+${cin}: got ${sum}, expected ${expected}` };
  }
  return { ok: true, checked: 512 };
}
