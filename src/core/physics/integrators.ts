// ─── core/physics/integrators.ts — zero-allocation steppers ────────────────
// Step functions use only IEEE-exact operations (+ - * / and Math.sqrt via
// the supplied acceleration), so trajectories are cross-engine reproducible.

export type Accel = (x: Float64Array, v: Float64Array, a: Float64Array) => void;
export type IntegratorId = 'euler' | 'semi-implicit' | 'verlet' | 'rk4';

export class Stepper {
  evals = 0;
  private a: Float64Array;
  private aNew: Float64Array;
  private xTmp: Float64Array;
  private vTmp: Float64Array;
  private x2: Float64Array;
  private v2: Float64Array;
  private a2: Float64Array;
  private valid = false;

  constructor(private dof: number, private accel: Accel) {
    this.a = new Float64Array(dof);
    this.aNew = new Float64Array(dof);
    this.xTmp = new Float64Array(dof);
    this.vTmp = new Float64Array(dof);
    this.x2 = new Float64Array(dof);
    this.v2 = new Float64Array(dof);
    this.a2 = new Float64Array(dof);
  }

  invalidate(): void { this.valid = false; }

  private evalAccel(x: Float64Array, v: Float64Array, out: Float64Array): void {
    this.evals++;
    this.accel(x, v, out);
  }

  step(id: IntegratorId, x: Float64Array, v: Float64Array, dt: number): void {
    if (id === 'euler') this.euler(x, v, dt);
    else if (id === 'semi-implicit') this.semiImplicit(x, v, dt);
    else if (id === 'verlet') this.verlet(x, v, dt);
    else this.rk4(x, v, dt);
  }

  private euler(x: Float64Array, v: Float64Array, dt: number): void {
    this.evalAccel(x, v, this.a);
    this.vTmp.set(v);
    for (let i = 0; i < this.dof; i++) x[i] = x[i]! + this.vTmp[i]! * dt;
    for (let i = 0; i < this.dof; i++) v[i] = v[i]! + this.a[i]! * dt;
    this.valid = false;
  }

  private semiImplicit(x: Float64Array, v: Float64Array, dt: number): void {
    this.evalAccel(x, v, this.a);
    for (let i = 0; i < this.dof; i++) v[i] = v[i]! + this.a[i]! * dt;
    for (let i = 0; i < this.dof; i++) x[i] = x[i]! + v[i]! * dt;
    this.valid = false;
  }

  private verlet(x: Float64Array, v: Float64Array, dt: number): void {
    if (!this.valid) {
      this.evalAccel(x, v, this.a);
      this.valid = true;
    }
    const halfDt2 = 0.5 * dt * dt;
    for (let i = 0; i < this.dof; i++) x[i] = x[i]! + v[i]! * dt + this.a[i]! * halfDt2;
    this.evalAccel(x, v, this.aNew);
    for (let i = 0; i < this.dof; i++) v[i] = v[i]! + 0.5 * (this.a[i]! + this.aNew[i]!) * dt;
    this.a.set(this.aNew);
  }

  private rk4(x: Float64Array, v: Float64Array, dt: number): void {
    const n = this.dof;
    // k1
    this.evalAccel(x, v, this.a);
    // stage 2 state in xTmp/vTmp, accel in a2; reuse aNew as k-storage is unsafe,
    // so accumulate weighted sums into x2/v2 as we go.
    this.x2.set(x); this.v2.set(v); // will become increment accumulators below
    // increments: dx1 = v, dv1 = a
    // Build stage states sequentially, storing stage derivatives in a/a2 swaps.
    const dx = this.xTmp; // reuse as derivative scratch (positions derivative = velocity stage)
    // Stage 2
    for (let i = 0; i < n; i++) { this.xTmp[i] = x[i]! + 0.5 * dt * v[i]!; this.vTmp[i] = v[i]! + 0.5 * dt * this.a[i]!; }
    this.evalAccel(this.xTmp, this.vTmp, this.a2);
    // Accumulate: result = x + dt/6*(v + 2*v_s2 + 2*v_s3 + v_s4); velocities similarly.
    // Save stage velocities/accels by folding into x2/v2 with weights.
    for (let i = 0; i < n; i++) {
      this.x2[i] = v[i]! + 2 * this.vTmp[i]!;
      this.v2[i] = this.a[i]! + 2 * this.a2[i]!;
    }
    // Stage 3 (stage velocity = vTmp from stage 2 derivative input)
    // Recompute stage-3 state: x + dt/2 * v_s2, v + dt/2 * a_s2
    const stageVx = new Float64Array(0); void stageVx; // no allocation in step: use aNew as scratch velocity holder
    for (let i = 0; i < n; i++) { this.aNew[i] = this.vTmp[i]!; }
    for (let i = 0; i < n; i++) { this.xTmp[i] = x[i]! + 0.5 * dt * this.aNew[i]!; this.vTmp[i] = v[i]! + 0.5 * dt * this.a2[i]!; }
    this.evalAccel(this.xTmp, this.vTmp, this.a2);
    for (let i = 0; i < n; i++) {
      this.x2[i] = this.x2[i]! + 2 * this.vTmp[i]!;
      this.v2[i] = this.v2[i]! + 2 * this.a2[i]!;
    }
    // Stage 4
    for (let i = 0; i < n; i++) { this.aNew[i] = this.vTmp[i]!; }
    for (let i = 0; i < n; i++) { this.xTmp[i] = x[i]! + dt * this.aNew[i]!; this.vTmp[i] = v[i]! + dt * this.a2[i]!; }
    this.evalAccel(this.xTmp, this.vTmp, this.a2);
    for (let i = 0; i < n; i++) {
      x[i] = x[i]! + (dt / 6) * (this.x2[i]! + this.vTmp[i]!);
      v[i] = v[i]! + (dt / 6) * (this.v2[i]! + this.a2[i]!);
    }
    void dx;
    this.valid = false;
  }
}
