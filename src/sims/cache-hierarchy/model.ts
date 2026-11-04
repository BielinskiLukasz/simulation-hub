// ─── Cache Hierarchy · model.ts — exact caches + reference + traces ───────
// Address decomposition: offset = addr & (lineBytes−1), set = (addr >> o) &
// (sets−1), tag = addr >> (o + log2(sets)). All sizes/ways/lines are powers of two.

import type { ParamSchema, Rng, TraceResult, TraceViewContext, TraceView } from '../../core/types';
import { createRng } from '../../core/rng';
import { meta } from './meta';

export interface Params {
  pattern: string;
  matrixN: number;
  elemBytes: number;
  workingSetKB: number;
  stride: number;
  passes: number;
  accesses: number;
  traceLimit: number;
  preset: string;
  lineBytes: number;
  l1KB: number;
  l1Ways: number;
  l2KB: number;
  l2Ways: number;
  l3KB: number;
  l3Ways: number;
  policy: string;
  latL1: number;
  latL2: number;
  latL3: number;
  latMem: number;
}

export const defaultParams: Params = {
  pattern: 'matrix-row',
  matrixN: 32,
  elemBytes: 4,
  workingSetKB: 256,
  stride: 64,
  passes: 4,
  accesses: 200000,
  traceLimit: 2000,
  preset: 'tiny-teaching',
  lineBytes: 64,
  l1KB: 1,
  l1Ways: 1,
  l2KB: 4,
  l2Ways: 2,
  l3KB: 32,
  l3Ways: 4,
  policy: 'lru',
  latL1: 4,
  latL2: 12,
  latL3: 40,
  latMem: 200,
};

export const paramSchema: ParamSchema<Params> = {
  pattern: { kind: 'select', label: 'Access pattern', options: ['matrix-row', 'matrix-col', 'sequential', 'strided', 'random'], group: 'Pattern' },
  matrixN: { kind: 'number', label: 'Matrix N×N', min: 8, max: 2048, step: 1, group: 'Pattern' },
  elemBytes: { kind: 'select', label: 'Element size', options: ['1', '4', '8'], group: 'Pattern' },
  workingSetKB: { kind: 'number', label: 'Working set (KB)', min: 1, step: 1, group: 'Pattern' },
  stride: { kind: 'number', label: 'Stride (bytes)', min: 1, step: 1, group: 'Pattern' },
  passes: { kind: 'range', label: 'Passes', min: 1, max: 8, step: 1, group: 'Pattern' },
  preset: { kind: 'select', label: 'Cache preset', options: ['custom', 'tiny-teaching', 'typical-laptop'], group: 'Cache' },
  lineBytes: { kind: 'select', label: 'Line size', options: ['32', '64', '128'], group: 'Cache' },
  l1KB: { kind: 'number', label: 'L1 size (KB)', min: 1, step: 1, group: 'Cache' },
  l1Ways: { kind: 'number', label: 'L1 ways', min: 1, step: 1, group: 'Cache' },
  l2KB: { kind: 'number', label: 'L2 size (KB)', min: 1, step: 1, group: 'Cache' },
  l2Ways: { kind: 'number', label: 'L2 ways', min: 1, step: 1, group: 'Cache' },
  l3KB: { kind: 'number', label: 'L3 size (KB)', min: 1, step: 1, group: 'Cache' },
  l3Ways: { kind: 'number', label: 'L3 ways', min: 1, step: 1, group: 'Cache' },
  policy: { kind: 'select', label: 'Replacement policy', options: ['lru', 'fifo', 'random'], group: 'Cache' },
  latL1: { kind: 'number', label: 'L1 latency (cycles)', min: 1, step: 1, group: 'Timing' },
  latL2: { kind: 'number', label: 'L2 latency', min: 1, step: 1, group: 'Timing' },
  latL3: { kind: 'number', label: 'L3 latency', min: 1, step: 1, group: 'Timing' },
  latMem: { kind: 'number', label: 'Memory latency', min: 1, step: 1, group: 'Timing' },
  accesses: { kind: 'range', label: 'Accesses', min: 1000, max: 4000000, step: 1000, group: 'Run' },
  traceLimit: { kind: 'range', label: 'Trace limit', min: 100, max: 5000, step: 100, group: 'Run' },
};

export interface CacheConfig {
  sizeBytes: number;
  ways: number;
  lineBytes: number;
  policy: 'lru' | 'fifo' | 'random';
}

export interface CacheConfigs { l1: CacheConfig; l2: CacheConfig; l3: CacheConfig }

const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

export function validateConfig(c: CacheConfig): string | null {
  if (!isPow2(c.sizeBytes)) return 'cache size must be a power of two';
  if (!isPow2(c.lineBytes)) return 'line size must be a power of two';
  if (!isPow2(c.ways)) return 'ways must be a power of two';
  if (c.sizeBytes < c.lineBytes * c.ways) return 'cache too small for ways × line';
  const sets = c.sizeBytes / (c.lineBytes * c.ways);
  if (!isPow2(sets)) return 'sets must be a power of two';
  return null;
}

export function resolveConfigs(p: Params): CacheConfigs {
  if (p.preset === 'tiny-teaching') {
    return {
      l1: { sizeBytes: 256, ways: 1, lineBytes: 64, policy: p.policy as CacheConfig['policy'] },
      l2: { sizeBytes: 1024, ways: 2, lineBytes: 64, policy: p.policy as CacheConfig['policy'] },
      l3: { sizeBytes: 4096, ways: 4, lineBytes: 64, policy: p.policy as CacheConfig['policy'] },
    };
  }
  if (p.preset === 'typical-laptop') {
    return {
      l1: { sizeBytes: 32 * 1024, ways: 8, lineBytes: 64, policy: p.policy as CacheConfig['policy'] },
      l2: { sizeBytes: 256 * 1024, ways: 8, lineBytes: 64, policy: p.policy as CacheConfig['policy'] },
      l3: { sizeBytes: 8 * 1024 * 1024, ways: 16, lineBytes: 64, policy: p.policy as CacheConfig['policy'] },
    };
  }
  return {
    l1: { sizeBytes: p.l1KB * 1024, ways: p.l1Ways, lineBytes: p.lineBytes, policy: p.policy as CacheConfig['policy'] },
    l2: { sizeBytes: p.l2KB * 1024, ways: p.l2Ways, lineBytes: p.lineBytes, policy: p.policy as CacheConfig['policy'] },
    l3: { sizeBytes: p.l3KB * 1024, ways: p.l3Ways, lineBytes: p.lineBytes, policy: p.policy as CacheConfig['policy'] },
  };
}

export function decodeAddress(addr: number, c: CacheConfig): { tag: number; set: number; offset: number; sets: number } {
  const sets = c.sizeBytes / (c.lineBytes * c.ways);
  const offset = addr & (c.lineBytes - 1);
  const set = (addr >> Math.log2(c.lineBytes)) & (sets - 1);
  const tag = addr >> (Math.log2(c.lineBytes) + Math.log2(sets));
  return { tag, set, offset, sets };
}

export type AccessResult = { hit: boolean; way: number; evictedTag: number };

export class Cache {
  readonly sets: number;
  private tags: Int32Array;
  private valid: Uint8Array;
  private stamp: Uint32Array;
  private clock = 0;
  private rng: Rng;

  constructor(readonly config: CacheConfig, rng: Rng) {
    const err = validateConfig(config);
    if (err) throw new Error(`Cache: ${err}`);
    this.sets = config.sizeBytes / (config.lineBytes * config.ways);
    const lines = this.sets * config.ways;
    this.tags = new Int32Array(lines).fill(-1);
    this.valid = new Uint8Array(lines);
    this.stamp = new Uint32Array(lines);
    this.rng = rng;
  }

  access(addr: number): AccessResult {
    const { tag, set } = decodeAddress(addr, this.config);
    const base = set * this.config.ways;
    for (let w = 0; w < this.config.ways; w++) {
      const i = base + w;
      if (this.valid[i] && this.tags[i] === tag) {
        if (this.config.policy === 'lru') this.stamp[i] = ++this.clock;
        return { hit: true, way: w, evictedTag: -1 };
      }
    }
    const way = this.victim(set);
    const i = base + way;
    const evictedTag = this.valid[i] ? this.tags[i]! : -1;
    this.tags[i] = tag;
    this.valid[i] = 1;
    this.stamp[i] = ++this.clock;
    return { hit: false, way, evictedTag };
  }

  /** Install a line without counting a hit/miss (lower-level fill). */
  fill(addr: number): void {
    const { tag, set } = decodeAddress(addr, this.config);
    const base = set * this.config.ways;
    for (let w = 0; w < this.config.ways; w++) {
      if (this.valid[base + w] && this.tags[base + w] === tag) {
        if (this.config.policy === 'lru') this.stamp[base + w] = ++this.clock;
        return;
      }
    }
    const way = this.victim(set);
    this.tags[base + way] = tag;
    this.valid[base + way] = 1;
    this.stamp[base + way] = ++this.clock;
  }

  private victim(set: number): number {
    const base = set * this.config.ways;
    for (let w = 0; w < this.config.ways; w++) if (!this.valid[base + w]) return w;
    if (this.config.policy === 'random') return this.rng.int(0, this.config.ways - 1);
    let best = 0;
    for (let w = 1; w < this.config.ways; w++) if (this.stamp[base + w]! < this.stamp[base + best]!) best = w;
    return best;
  }

  snapshot(): { tags: number[]; valid: number[]; stamp: number[] } {
    return { tags: Array.from(this.tags), valid: Array.from(this.valid), stamp: Array.from(this.stamp) };
  }
}

// ── independent naive reference model (linear search, line objects) ────────

export class ReferenceCache {
  private sets: { tag: number; used: number }[][];
  private clock = 0;
  constructor(private cfg: CacheConfig) {
    const sets = cfg.sizeBytes / (cfg.lineBytes * cfg.ways);
    this.sets = Array.from({ length: sets }, () => []);
  }
  access(addr: number): boolean {
    const { tag, set } = decodeAddress(addr, this.cfg);
    const lines = this.sets[set]!;
    const hit = lines.find((l) => l.tag === tag);
    if (hit) {
      if (this.cfg.policy === 'lru') hit.used = ++this.clock;
      return true;
    }
    if (lines.length < this.cfg.ways) lines.push({ tag, used: ++this.clock });
    else {
      let victim = 0;
      for (let i = 1; i < lines.length; i++) if (lines[i]!.used < lines[victim]!.used) victim = i;
      lines[victim] = { tag, used: ++this.clock };
    }
    return false;
  }
}

// ── patterns ───────────────────────────────────────────────────────────────

export interface AddressStream {
  addresses: Uint32Array;
  matrixPos: Int32Array | null;
  matrixN: number;
}

export function generateAddresses(p: Params, rng: Rng): AddressStream {
  const limit = Math.max(1000, Math.min(4_000_000, Math.floor(p.accesses)));
  if (p.pattern === 'matrix-row' || p.pattern === 'matrix-col') {
    const n = Math.max(2, Math.min(2048, Math.floor(p.matrixN)));
    const total = Math.min(limit, n * n * Math.max(1, p.passes));
    const addrs = new Uint32Array(total);
    const pos = new Int32Array(total);
    let k = 0;
    for (let pass = 0; pass < p.passes && k < total; pass++) {
      for (let row = 0; row < n && k < total; row++) {
        for (let col = 0; col < n && k < total; col++) {
          const r = p.pattern === 'matrix-row' ? row : col;
          const c = p.pattern === 'matrix-row' ? col : row;
          addrs[k] = r * n * p.elemBytes + c * p.elemBytes;
          pos[k] = r * n + c;
          k++;
        }
      }
    }
    return { addresses: addrs.subarray(0, k), matrixPos: pos.subarray(0, k), matrixN: n };
  }
  if (p.pattern === 'strided') {
    const stride = Math.max(1, Math.floor(p.stride));
    const count = limit;
    const addrs = new Uint32Array(count);
    for (let i = 0; i < count; i++) addrs[i] = (i * stride) >>> 0;
    return { addresses: addrs, matrixPos: null, matrixN: 0 };
  }
  if (p.pattern === 'random') {
    const bytes = Math.max(p.lineBytes, p.workingSetKB * 1024);
    const lines = Math.floor(bytes / p.lineBytes);
    const addrs = new Uint32Array(limit);
    for (let i = 0; i < limit; i++) addrs[i] = rng.int(0, lines - 1) * p.lineBytes;
    return { addresses: addrs, matrixPos: null, matrixN: 0 };
  }
  // sequential
  const bytes = Math.max(p.elemBytes, p.workingSetKB * 1024);
  const count = limit;
  const addrs = new Uint32Array(count);
  const elems = Math.floor(bytes / p.elemBytes);
  for (let i = 0; i < count; i++) addrs[i] = (i % elems) * p.elemBytes;
  return { addresses: addrs, matrixPos: null, matrixN: 0 };
}

// ── hierarchy simulation & trace ───────────────────────────────────────────

export interface HitRecord {
  addr: Uint32Array;
  level: Uint8Array; // 1..4 (4 = memory)
  set1: Uint32Array;
  matrixPos: Int32Array | null;
  matrixN: number;
}

export interface CacheSummary extends Record<string, number | string | boolean> {
  pattern: string;
  accesses: number;
  l1HitRate: number;
  l2HitRate: number;
  l3HitRate: number;
  missRate: number;
  amat: number;
  l1Misses: number;
  memoryAccesses: number;
  linesL1: number;
  linesL2: number;
  linesL3: number;
}

export interface CacheData {
  record: HitRecord;
  n: number;
  sets1: number;
  ways1: number;
  cfg: CacheConfigs;
}

export function computeAmat(t1: number, t2: number, t3: number, tm: number, m1: number, m2: number, m3: number): number {
  return t1 + m1 * (t2 + m2 * (t3 + m3 * tm));
}

export function runCache(p: Params): TraceResult<CacheData> {
  const rng = createRng(12345);
  const cfg = resolveConfigs(p);
  for (const c of [cfg.l1, cfg.l2, cfg.l3]) {
    const err = validateConfig(c);
    if (err) throw new Error(`Invalid ${c === cfg.l1 ? 'L1' : c === cfg.l2 ? 'L2' : 'L3'}: ${err}`);
  }
  const stream = generateAddresses(p, rng);
  const l1 = new Cache(cfg.l1, createRng(1));
  const l2 = new Cache(cfg.l2, createRng(2));
  const l3 = new Cache(cfg.l3, createRng(3));
  const total = stream.addresses.length;
  const traceLen = Math.min(total, Math.max(100, Math.min(5000, p.traceLimit)));
  const record: HitRecord = {
    addr: new Uint32Array(traceLen),
    level: new Uint8Array(traceLen),
    set1: new Uint32Array(traceLen),
    matrixPos: stream.matrixPos ? new Int32Array(traceLen) : null,
    matrixN: stream.matrixN,
  };
  let l1Hits = 0; let l2Hits = 0; let l3Hits = 0;
  let l1Accesses = 0; let l2Accesses = 0; let l3Accesses = 0;
  for (let i = 0; i < total; i++) {
    const addr = stream.addresses[i]!;
    l1Accesses++;
    let level = 4;
    const a1 = l1.access(addr);
    if (a1.hit) { l1Hits++; level = 1; }
    else {
      l2Accesses++;
      const a2 = l2.access(addr);
      if (a2.hit) { l2Hits++; level = 2; l1.fill(addr); }
      else {
        l3Accesses++;
        const a3 = l3.access(addr);
        if (a3.hit) { l3Hits++; level = 3; }
        else level = 4;
        l2.fill(addr); l1.fill(addr);
        if (a3.hit) l3.fill(addr);
      }
    }
    if (i < traceLen) {
      record.addr[i] = addr;
      record.level[i] = level;
      record.set1[i] = decodeAddress(addr, cfg.l1).set;
      if (record.matrixPos && stream.matrixPos) record.matrixPos[i] = stream.matrixPos[i]!;
    }
  }
  const m1 = l1Accesses ? 1 - l1Hits / l1Accesses : 0;
  const m2 = l2Accesses ? 1 - l2Hits / l2Accesses : 0;
  const m3 = l3Accesses ? 1 - l3Hits / l3Accesses : 0;
  const amat = computeAmat(p.latL1, p.latL2, p.latL3, p.latMem, m1, m2, m3);
  const summary: CacheSummary = {
    pattern: p.pattern,
    accesses: total,
    l1HitRate: l1Accesses ? l1Hits / l1Accesses : 0,
    l2HitRate: l2Accesses ? l2Hits / l2Accesses : 0,
    l3HitRate: l3Accesses ? l3Hits / l3Accesses : 0,
    missRate: l1Accesses ? 1 - l1Hits / l1Accesses : 0,
    amat,
    l1Misses: l1Accesses - l1Hits,
    memoryAccesses: l1Accesses - l1Hits - l2Hits - l3Hits,
    linesL1: cfg.l1.sizeBytes / cfg.l1.lineBytes,
    linesL2: cfg.l2.sizeBytes / cfg.l2.lineBytes,
    linesL3: cfg.l3.sizeBytes / cfg.l3.lineBytes,
  };
  const cumulative = new Int32Array(traceLen + 1);
  for (let i = 0; i <= traceLen; i++) cumulative[i] = i;
  return {
    length: traceLen,
    summary,
    work: { label: 'accesses', cumulative },
    data: { record, n: stream.matrixN, sets1: cfg.l1.sizeBytes / (cfg.l1.lineBytes * cfg.l1.ways), ways1: cfg.l1.ways, cfg },
  };
}

export const cacheSim = {
  kind: 'trace' as const,
  meta,
  defaultParams,
  paramSchema,
  input: {
    initial: () => ({}),
    codec: { encode: () => '', decode: () => ({}) },
  },
  run: runCache,
  about: {
    summary: 'Exact set-associative L1/L2/L3 caches with LRU, FIFO and random replacement, driven by generated access patterns. Row-major and column-major matrix traversals expose spatial locality and conflict misses, and AMAT is computed from local miss rates.',
    bullets: [
      'The matrix demo: a flat 32×32 int matrix at 93.75% L1 hits row-major and 0% column-major on a 1 KB direct-mapped cache.',
      'LRU vs FIFO on A B A C A with two lines: LRU 2 hits, FIFO 1 hit.',
      'AMAT = t1 + m1(t2 + m2(t3 + m3·tMem)) using local miss rates.',
      'The L1 set strip shows hit/miss pressure per set; the matrix heat map colours cells by hit level.',
      'Parameters are grouped (Pattern / Cache / Timing / Run).',
    ],
    invariant: 'The optimized cache matches an independent naive reference model on random address streams (differential test).',
  },
  concepts: '## Concepts\n\n**Locality.** Row-major matrix traversal reuses cache lines; column-major jumps 128 bytes per access, so on a small direct-mapped cache every access maps to a conflicting line and the hit rate collapses. The compare tab makes this numeric.\n\n**Sets, ways, tags.** A cache is `sets × ways` lines. Address bits split into tag | set | offset. More ways (associativity) tolerate conflicts; line size trades spatial locality against over-fetch.\n\n**LRU vs FIFO.** LRU evicts the least recently used line (better for loops); FIFO evicts the oldest loaded line and can evict a hot line.\n\n**Assumption.** The matrix is a flat row-major layout (C / 1D array). Java `int[][]` is an array of row objects; column-major traversal is still bad but exact addresses differ.\n\n**References.** Bryant & O’Hallaron, *Computer Systems: A Programmer’s Perspective*; Hennessy & Patterson, *Computer Architecture*; Drepper, *What Every Programmer Should Know About Memory* (2007).',
};

export type CacheViewCtx = TraceViewContext;
export type CacheTraceView = TraceView<unknown, CacheData>;

export function mountCacheView(host: HTMLElement, ctx: TraceViewContext): TraceView<unknown, CacheData> {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'space-y-2';
  const matrixHost = document.createElement('div');
  matrixHost.className = 'overflow-hidden rounded-xl border border-slate-200 dark:border-white/10';
  const setsHost = document.createElement('div');
  setsHost.className = 'flex flex-wrap gap-px rounded-lg bg-slate-900/[.04] p-1 dark:bg-white/[.05]';
  const counters = document.createElement('div');
  counters.className = 'grid grid-cols-2 gap-1.5 font-mono text-[11px] sm:grid-cols-4';
  wrap.append(matrixHost, setsHost, counters);
  host.append(wrap);
  void ctx;

  let data: CacheData | null = null;
  let result: TraceResult<CacheData> | null = null;
  let pos = 0;

  let canvas: HTMLCanvasElement | null = null;
  let ctx2d: CanvasRenderingContext2D | null = null;
  let off: HTMLCanvasElement | null = null;

  function ensureMatrix(n: number) {
    if (!n) { matrixHost.innerHTML = '<p class="p-3 text-[12px] text-slate-400">This pattern has no matrix view — see the counters.</p>'; canvas = null; return; }
    if (!canvas || !off || off.width !== n || off.height !== n) {
      if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.imageRendering = 'pixelated';
      matrixHost.innerHTML = '';
      matrixHost.append(canvas);
      }
      off = document.createElement('canvas');
      off.width = n; off.height = n;
      ctx2d = off.getContext('2d')!;
    }
  }

  function render(p: number) {
    pos = p;
    if (!result || !data) return;
    const rec = data.record;
    if (data.n > 0) {
      ensureMatrix(data.n);
      if (canvas && off && ctx2d) {
        const img = ctx2d.createImageData(data.n, data.n);
        const out = new Uint32Array(img.data.buffer);
        for (let i = 0; i < img.width * img.height; i++) out[i] = 0xff1e293b;
        for (let i = 0; i < p; i++) {
          const cell = rec.matrixPos?.[i] ?? -1;
          if (cell < 0) continue;
          const level = rec.level[i]!;
          const rgb = level === 1 ? 0x22c55e : level === 2 ? 0x38bdf8 : level === 3 ? 0xf59e0b : 0xef4444;
          const r = rgb & 0xff; const g = (rgb >> 8) & 0xff; const b = (rgb >> 16) & 0xff;
          out[cell] = (0xff << 24) | (b << 16) | (g << 8) | r;
        }
        ctx2d.putImageData(img, 0, 0);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = matrixHost.clientWidth || data.n;
        const cssH = Math.round((cssW * data.n) / data.n);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.height = `${cssH}px`;
        const c2 = canvas.getContext('2d')!;
        c2.setTransform(dpr, 0, 0, dpr, 0, 0);
        c2.imageSmoothingEnabled = false;
        c2.drawImage(off, 0, 0, cssW, cssH);
      }
    }
    // L1 set hit/miss pressure within the prefix
    const hits = new Uint32Array(data.sets1);
    const misses = new Uint32Array(data.sets1);
    let h1 = 0; let h2 = 0; let h3 = 0; let mem = 0;
    for (let i = 0; i < p; i++) {
      const set = rec.set1[i]!;
      const level = rec.level[i]!;
      if (level === 1) hits[set]!++; else misses[set]!++;
      if (level === 1) h1++; else if (level === 2) h2++; else if (level === 3) h3++; else mem++;
    }
    setsHost.innerHTML = '';
    for (let s = 0; s < data.sets1; s++) {
      const total = hits[s]! + misses[s]!;
      const ratio = total ? hits[s]! / total : 0;
      const cell = document.createElement('span');
      cell.className = 'h-5 min-w-[12px] flex-1 rounded-sm';
      cell.title = `set ${s}: ${hits[s]} hits / ${misses[s]} misses`;
      const g = Math.round(200 * ratio);
      cell.style.background = `rgb(${Math.round(120 * (1 - ratio))}, ${120 + g / 2}, ${Math.round(200 * (1 - ratio))})`;
      setsHost.append(cell);
    }
    const s = result.summary as unknown as CacheSummary;
    const current = p > 0 ? rec.addr[Math.min(p, rec.addr.length) - 1]! : 0;
    const dec = decodeAddress(current, data.cfg.l1);
    counters.innerHTML = `
      <div class="col-span-2 rounded-lg bg-slate-900/[.04] px-2 py-1.5 font-mono text-[10.5px] dark:bg-white/[.05]">addr <b>0x${current.toString(16)}</b> → tag <b>0x${dec.tag.toString(16)}</b> · set <b>${dec.set}</b> · offset <b>0x${dec.offset.toString(16)}</b></div>
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">prefix · L1 <b>${h1}</b> · L2 <b>${h2}</b></div>
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">L3 <b>${h3}</b> · memory <b>${mem}</b></div>
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">overall L1 hit <b>${(s.l1HitRate * 100).toFixed(2)}%</b></div>
      <div class="rounded-lg bg-slate-900/[.04] px-2 py-1.5 dark:bg-white/[.05]">AMAT <b>${s.amat.toFixed(1)}</b> cycles</div>`;
  }

  return {
    setInput() { /* pattern params drive the input */ },
    setResult(res) {
      result = res;
      data = res.data;
      ensureMatrix(data.n);
      if (data.n === 0) matrixHost.innerHTML = '<p class="p-3 text-[12px] text-slate-400">No matrix for this pattern — the counters below still update.</p>';
      render(Math.min(pos, res.length));
    },
    render,
    dispose() { matrixHost.innerHTML = ''; host.innerHTML = ''; canvas = null; off = null; ctx2d = null; },
  };
}
