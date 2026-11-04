// ─── core/physics/quadtree.ts — flat-array Barnes–Hut quadtree ─────────────
// Children are created after parents, so aggregates accumulate by iterating
// nodes in reverse creation order. Depth-capped leaves aggregate coincident
// bodies instead of subdividing forever.

export class QuadTree {
  interactions = 0;
  nodeCount = 0;
  private maxNodes: number;
  private cx: Float64Array;
  private cy: Float64Array;
  private half: Float64Array;
  private mass: Float64Array;
  private comX: Float64Array; // weighted sum until build() normalizes
  private comY: Float64Array;
  private child: Int32Array;
  private body: Int32Array;
  private count: Int32Array;
  private stack: Int32Array;

  private packedX: Float64Array;
  private packedY: Float64Array;
  constructor(maxBodies: number, private maxDepth = 40) {
    this.maxNodes = Math.max(64, maxBodies * 4 + 64);
    this.cx = new Float64Array(this.maxNodes);
    this.cy = new Float64Array(this.maxNodes);
    this.half = new Float64Array(this.maxNodes);
    this.mass = new Float64Array(this.maxNodes);
    this.comX = new Float64Array(this.maxNodes);
    this.comY = new Float64Array(this.maxNodes);
    this.child = new Int32Array(this.maxNodes * 4);
    this.body = new Int32Array(this.maxNodes);
    this.count = new Int32Array(this.maxNodes);
    this.stack = new Int32Array(this.maxNodes);
    this.packedX = new Float64Array(maxBodies);
    this.packedY = new Float64Array(maxBodies);
  }

  /** Build from interleaved [x0,y0,x1,y1,...] positions (body-indexed). */
  buildInterleaved(pos: Float64Array, mass: Float64Array, idx: Int32Array, count: number): void {
    for (let k = 0; k < count; k++) { const i = idx[k]!; this.packedX[i] = pos[i * 2]!; this.packedY[i] = pos[i * 2 + 1]!; }
    this.build(this.packedX, this.packedY, mass, idx, count);
  }

  private newNode(cx: number, cy: number, half: number): number {
    const id = this.nodeCount++;
    this.cx[id] = cx; this.cy[id] = cy; this.half[id] = half;
    this.mass[id] = 0; this.comX[id] = 0; this.comY[id] = 0;
    this.body[id] = -1; this.count[id] = 0;
    for (let q = 0; q < 4; q++) this.child[id * 4 + q] = -1;
    return id;
  }

  build(x: Float64Array, y: Float64Array, mass: Float64Array, idx: Int32Array, count: number): void {
    this.nodeCount = 0;
    this.child.fill(-1);
    this.interactions = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = 0; k < count; k++) {
      const i = idx[k]!;
      minX = Math.min(minX, x[i]!); maxX = Math.max(maxX, x[i]!);
      minY = Math.min(minY, y[i]!); maxY = Math.max(maxY, y[i]!);
    }
    if (count === 0) { this.newNode(0, 0, 1); return; }
    const half = Math.max((maxX - minX) / 2, (maxY - minY) / 2, 1e-9);
    this.newNode((minX + maxX) / 2, (minY + maxY) / 2, half);
    for (let k = 0; k < count; k++) this.insert(idx[k]!, x, y, mass);
    // aggregates in reverse creation order
    for (let node = this.nodeCount - 1; node >= 0; node--) {
      if (this.child[node * 4] !== -1) {
        let m = 0, sx = 0, sy = 0;
        for (let q = 0; q < 4; q++) {
          const c = this.child[node * 4 + q]!;
          if (c < 0) continue;
          m += this.mass[c]!;
          sx += this.comX[c]!;
          sy += this.comY[c]!;
        }
        this.mass[node] = m; this.comX[node] = sx; this.comY[node] = sy;
      } else if (this.body[node]! >= 0) {
        const b = this.body[node]!;
        this.mass[node] = mass[b]!;
        this.comX[node] = mass[b]! * x[b]!;
        this.comY[node] = mass[b]! * y[b]!;
      }
      // capped aggregate leaves already hold mass + weighted sums
    }
  }

  private quadrant(node: number, px: number, py: number): number {
    return (px >= this.cx[node]! ? 1 : 0) + (py >= this.cy[node]! ? 2 : 0);
  }

  private ensureChildren(node: number): void {
    if (this.child[node * 4] !== -1) return;
    const h = this.half[node]! / 2;
    for (let q = 0; q < 4; q++) {
      const dx = (q & 1) ? h : -h;
      const dy = (q & 2) ? h : -h;
      this.child[node * 4 + q] = this.newNode(this.cx[node]! + dx, this.cy[node]! + dy, h);
    }
  }

  private insert(bodyIdx: number, x: Float64Array, y: Float64Array, mass: Float64Array): void {
    let node = 0;
    let depth = 0;
    for (;;) {
      if (this.child[node * 4] !== -1) {
        node = this.child[node * 4 + this.quadrant(node, x[bodyIdx]!, y[bodyIdx]!)]!;
        depth++;
        continue;
      }
      if (this.body[node] === -1 && this.count[node] === 0) {
        this.body[node] = bodyIdx;
        this.count[node] = 1;
        return;
      }
      if (depth >= this.maxDepth || this.nodeCount + 4 >= this.maxNodes) {
        // aggregate into this leaf
        const m = mass[bodyIdx]!;
        this.mass[node] = this.mass[node]! + m;
        this.comX[node] = this.comX[node]! + m * x[bodyIdx]!;
        this.comY[node] = this.comY[node]! + m * y[bodyIdx]!;
        this.count[node] = this.count[node]! + 1;
        this.body[node] = -2;
        return;
      }
      const existing = this.body[node]!;
      this.ensureChildren(node);
      this.body[node] = -1;
      this.count[node] = 0;
      if (existing >= 0) {
        const child = this.child[node * 4 + this.quadrant(node, x[existing]!, y[existing]!)]!;
        this.body[child] = existing;
        this.count[child] = 1;
      }
      node = this.child[node * 4 + this.quadrant(node, x[bodyIdx]!, y[bodyIdx]!)]!;
      depth++;
    }
  }

  rootMass(): number { return this.mass[0] ?? 0; }
  rootCom(): { x: number; y: number } {
    const m = this.mass[0]!;
    return m > 0 ? { x: this.comX[0]! / m, y: this.comY[0]! / m } : { x: 0, y: 0 };
  }

  accel(px: number, py: number, selfIdx: number, theta: number, eps2: number, G: number, out: Float64Array): void {
    out[0] = 0; out[1] = 0;
    if (this.nodeCount === 0) return;
    let sp = 0;
    this.stack[sp++] = 0;
    const theta2 = theta * theta;
    while (sp > 0) {
      const node = this.stack[--sp]!;
      const m = this.mass[node]!;
      if (m === 0) continue;
      const mx = this.comX[node]! / m;
      const my = this.comY[node]! / m;
      const dx = mx - px;
      const dy = my - py;
      const d2 = dx * dx + dy * dy + eps2;
      const isLeaf = this.child[node * 4] === -1;
      if (isLeaf) {
        if (this.body[node] === selfIdx) continue;
        const inv = 1 / Math.sqrt(d2);
        const s = G * m * inv * inv * inv;
        out[0] = out[0]! + dx * s;
        out[1] = out[1]! + dy * s;
        this.interactions++;
        continue;
      }
      const inside = Math.abs(px - this.cx[node]!) <= this.half[node]! && Math.abs(py - this.cy[node]!) <= this.half[node]!;
      const size2 = (2 * this.half[node]!) * (2 * this.half[node]!);
      if (!inside && size2 < theta2 * d2) {
        const inv = 1 / Math.sqrt(d2);
        const s = G * m * inv * inv * inv;
        out[0] = out[0]! + dx * s;
        out[1] = out[1]! + dy * s;
        this.interactions++;
        continue;
      }
      for (let q = 0; q < 4; q++) {
        const c = this.child[node * 4 + q]!;
        if (c >= 0 && sp < this.stack.length) this.stack[sp++] = c;
      }
    }
  }

  potential(px: number, py: number, selfIdx: number, theta: number, eps2: number, G: number): number {
    let pot = 0;
    if (this.nodeCount === 0) return 0;
    let sp = 0;
    this.stack[sp++] = 0;
    const theta2 = theta * theta;
    while (sp > 0) {
      const node = this.stack[--sp]!;
      const m = this.mass[node]!;
      if (m === 0) continue;
      const mx = this.comX[node]! / m;
      const my = this.comY[node]! / m;
      const dx = mx - px;
      const dy = my - py;
      const d2raw = dx * dx + dy * dy;
      const isLeaf = this.child[node * 4] === -1;
      const inside = Math.abs(px - this.cx[node]!) <= this.half[node]! && Math.abs(py - this.cy[node]!) <= this.half[node]!;
      const size2 = (2 * this.half[node]!) * (2 * this.half[node]!);
      if (isLeaf || (!inside && size2 < theta2 * (d2raw + eps2))) {
        if (isLeaf && this.body[node] === selfIdx) continue;
        pot -= G * m / Math.sqrt(d2raw + eps2);
        continue;
      }
      for (let q = 0; q < 4; q++) {
        const c = this.child[node * 4 + q]!;
        if (c >= 0 && sp < this.stack.length) this.stack[sp++] = c;
      }
    }
    return pot;
  }

  nearest(px: number, py: number, x: Float64Array, y: Float64Array, idx: Int32Array, count: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < count; k++) {
      const i = idx[k]!;
      const dx = x[i]! - px;
      const dy = y[i]! - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
}
