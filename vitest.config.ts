import { defineConfig } from 'vitest/config';

// Core + logic tests must not need a DOM — node environment on purpose.
// (Not wired into vite.config.ts so the app build stays untouched.)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
