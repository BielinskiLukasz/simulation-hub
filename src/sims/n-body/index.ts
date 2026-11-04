import type { CompareSpec, RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import { applyParams, bounds, centerOfMass, defaultParams, diagnostics, init, onPointer, paramSchema, step, type Params, type State } from './logic';
import { render } from './render';

const compare: CompareSpec<Record<string, unknown>> = {
  modes: [
    { id: 'integrator', label: 'Verlet vs Euler (energy drift)', paneKeys: ['integrator'], bDefaults: { integrator: 'euler' }, note: 'Same dt and seed: watch ΔE/E₀ separate.' },
    { id: 'method', label: 'Direct vs Barnes–Hut (momentum drift)', paneKeys: ['forceMethod', 'theta'], bDefaults: { forceMethod: 'barnes-hut', theta: 0.7 }, note: 'Tree approximations break Newton’s third law.' },
    { id: 'dt', label: 'dt ×1 vs ×3 (step-size error)', paneKeys: ['dt'], bDefaults: { dt: 0.03 }, note: 'Larger steps, larger error.' },
  ],
};

const sim: RealtimeSimulation<Params, State> = {
  kind: 'realtime',
  meta,
  defaultParams,
  paramSchema,
  init,
  step: (s, dt) => step(s, dt),
  render,
  applyParams,
  onPointer,
  getStats: (s) => ({ bodies: s.n, time: s.simTime.toFixed(2), evals: s.stepper.evals, src: s.nSrc }),
  camera: {
    initial: (s) => {
      const r = bounds(s);
      return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, zoom: Math.min(800 / r.w, 600 / r.h) };
    },
    fit: (s) => bounds(s),
    follow: (s) => centerOfMass(s),
    minZoom: 0.02,
    maxZoom: 40,
    usesRightClick: true,
  },
  diagnostics: {
    sample: diagnostics,
    everySteps: (s) => (s.nSrc > 2000 ? 20 : s.nSrc > 500 ? 5 : 1),
  },
  compare: compare as CompareSpec<Record<string, unknown>>,
  about: {
    summary:
      'Gravitational N-body in Float64 with four selectable integrators. The same initial conditions can stay bounded for centuries (Verlet), spiral outward (explicit Euler), or drift slowly (RK4) — the diagnostics panel makes the difference numeric.',
    bullets: [
      'Drag on empty space to launch a new body; right-click deletes the nearest body. Wheel zooms, Space+drag pans, F fits, follow tracks the centre of mass.',
      'Barnes–Hut groups distant bodies into centre-of-mass nodes. It is O(n log n) but breaks Newton’s third law, so total momentum drifts — compare Direct vs Barnes–Hut to see it.',
      'Softening replaces 1/r² with a Plummer kernel; the potential uses the matching softened form so energy remains meaningful.',
      'Figure-8 uses the Chenciner–Montgomery equal-mass periodic solution; solar-system uses AU/year units with G = 4π².',
      'Only + − × ÷ and √ appear in force/integrator steps, keeping trajectories reproducible across JS engines.',
    ],
    invariant: 'Direct + Verlet/semi-implicit conserves momentum and angular momentum to rounding; explicit Euler visibly drifts.',
  },
  concepts:
    '## Concepts\n\n**Symplectic vs non-symplectic.** Semi-implicit Euler and velocity Verlet are symplectic: their energy error is bounded and oscillates instead of accumulating secularly. Explicit Euler adds energy every step; RK4 is accurate per step but not symplectic, so its energy drifts slowly over long horizons.\n\n**Barnes–Hut.** A quadtree replaces a distant cluster by its total mass at its centre of mass when size/distance < θ. Momentum is not exactly conserved because the approximation is not pairwise symmetric.\n\n**Softening.** Plummer softening ε caps the force at close range and must be paired with the softened potential −Gm/√(r²+ε²), otherwise “energy drift” is just inconsistent bookkeeping.\n\n**References.** Barnes & Hut (Nature, 1986); Hairer, Lubich & Wanner, *Geometric Numerical Integration*; Chenciner & Montgomery (Annals of Mathematics, 2000).\n\n*Educational model: 2D, single-threaded, no collisions or relativity.*',
};

export default sim;
