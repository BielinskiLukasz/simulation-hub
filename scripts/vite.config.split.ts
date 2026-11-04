import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Verification build only — NOT the deployed config.
 *
 * The real `vite.config.ts` uses vite-plugin-singlefile, which inlines every
 * dynamic import into one HTML file and therefore hides the code splitting the
 * architecture depends on. This config drops that one plugin so the Phase 2
 * exit criterion ("hub chunk didn't grow; chart code only lands in batch-sim
 * chunks; each sim is its own chunk") can actually be measured:
 *
 *   npx vite build --config scripts/vite.config.split.ts
 */
export default defineConfig({
  root: path.resolve(import.meta.dirname, '..'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
  build: {
    outDir: 'dist-split',
    rollupOptions: {
      output: {
        // stable, readable names so the chunk table in the README stays honest
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
