import { defineConfig } from 'vite';

export default defineConfig({
  // Root stays at repo root so static assets (data/, shared/, questions/) work
  root: '.',
  publicDir: false, // we serve everything from root, no separate public dir
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  server: {
    port: 3737,
    open: '/index.html',
  },
  test: {
    // Vitest config
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      thresholds: {
        lines: 50,
        branches: 40,
      },
    },
  },
});
