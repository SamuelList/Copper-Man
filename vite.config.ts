/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const alias = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Relative base so the build can be hosted from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@core': alias('./src/core'),
      '@game': alias('./src/game'),
      '@state': alias('./src/state'),
      '@ui': alias('./src/ui'),
    },
  },
  build: {
    // Phaser is large; keep it in its own long-cacheable chunk.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }],
        },
      },
    },
  },
  test: {
    globals: true,
    // Core/state tests run in node; UI tests opt into jsdom with a docblock.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
