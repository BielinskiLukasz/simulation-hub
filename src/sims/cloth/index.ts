import type { CompareSpec, Diagnostics, RealtimeSimulation } from '../../core/types';
import { meta } from './meta';
import { applyParams, defaultParams, diagnosticsExtras, init, onPointer, paramSchema, step, type Params, type State } from './logic';
import { render } from './render';

const compare: CompareSpec<Record<string, unknown>> = {
  modes: [
    { id: 'iterations', label: 'Iterations 1 vs 20 (stiffness)', paneKeys: ['iterations'], bDefaults: { iterations: 20 }, note: 'Same cloth, same seed: watch strain and sag separate.' },
    { id: 'integrator-substeps', label: 'Substeps 1 vs 4', paneKeys: ['substeps'], bDefaults: { substeps: 4 }, note: 'More substeps, smaller h, stabler constraints.' },
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
  getStats: (s) => ({ particles: s.n, constraints: s.nc, torn: s.torn, strain: `${(s.maxStrain * 100).toFixed(1)}%` }),
  camera: {
    initial: () => ({ cx: 400, cy: 300, zoom: 1 }),
    fit: () => ({ x: 0, y: 0, w: 800, h: 600 }),
    minZoom: 0.4,
    maxZoom: 5,
    usesRightClick: true,
  },
  diagnostics: {
    sample: (s): Diagnostics => ({
      time: s.tick / 60,
      extras: diagnosticsExtras(s),
    }),
    everySteps: () => 5,
  },
  compare: compare as CompareSpec<Record<string, unknown>>,
  about: {
    summary:
      'Position-based soft bodies: Verlet particles joined by distance constraints solved with alternating Gauss–Seidel sweeps. Iterations are stiffness you can see — at 1 sweep the cloth sags and stretches; at 20+ it settles.',
    bullets: [
      'Drag a particle to grab and throw it. Alt/right-drag cuts constraints; Shift+click toggles a pin. Space+drag pans, wheel zooms.',
      'Wind is deterministic integer-hash value noise (no trig in the step), so the same seed + input replays exactly.',
      'Compare mode: iterations 1 vs 20 side by side in lockstep — same grab, mirrored to both panes.',
      'Tearing removes constraints stretched beyond tearRatio × rest length; strain colouring shows where the load is.',
      'Rope mode is a pinned chain (pendulum test); blob mode is a spoked ring that holds its shape on the ground.',
    ],
    invariant: 'Pinned particles never move, positions stay finite across the stability sweep, and more iterations monotonically reduce max strain on a hanging cloth.',
  },
  concepts:
    '## Concepts\n\n**Position-based dynamics.** Instead of forces, PBD moves particles, then projects constraints (distance, pins, collisions) back to feasibility. Verlet integration gives velocity implicitly from positions, which is why grabbing “throws” on release.\n\n**Iterations vs substeps.** More sweeps per step stiffen constraints; more substeps shrink h and improve stability. They are not interchangeable — the compare mode exists to feel the difference.\n\n**References.** Jakobsen, *Advanced Character Physics* (GDC 2001); Müller et al., *Position Based Dynamics* (2007); Macklin et al., *Small Steps in Physics Simulation* (SCA 2019).\n\n*Model notes: no self-collision, no pressure force for blobs, ground is a flat plane.*',
};

export default sim;
