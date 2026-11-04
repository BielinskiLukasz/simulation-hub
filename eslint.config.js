// ESLint flat config — including the rules that ENFORCE the architecture:
// core/ and every sim's logic.ts are pure: no DOM globals, no Math.random,
// no Date.now. Randomness comes from the seeded Rng; time from the runner.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    // The UI shell is the type-erased boundary: it renders ANY registered
    // sim from its schema at runtime, so `any` is deliberate there.
    // core/ and logic.ts (below) get no such allowance.
    files: ['src/ui/**/*.{ts,tsx}', 'src/App.tsx', 'src/main.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['src/core/**/*.ts', 'src/sims/**/logic.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'document', message: 'core/logic must not touch the DOM.' },
        { name: 'window', message: 'core/logic must not touch the DOM.' },
        { name: 'requestAnimationFrame', message: 'Timing belongs to the Runner (ui drives tick()).' },
        { name: 'localStorage', message: 'Persistence belongs in ui/.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng instead.' },
        { object: 'Date', property: 'now', message: 'Simulation logic must not read the wall clock.' },
      ],
    },
  },
);
