import { defineConfig } from "vite";

// Geri is a single-file PWA — `shlav-a-mega.html` is THE app, no bundler,
// no framework, no build step (per CLAUDE.md). This config exists only to:
//   1. Provide `npm run dev` — a Vite dev server with HMR for CSS edits
//   2. Unify vitest config (was vitest.config.js, now consolidated here)
// There is intentionally NO `build` field. Production deploy is still
// `git push origin main` → GitHub Pages, no bundling step.
export default defineConfig({
  publicDir: false,
  server: {
    port: 3737,
    open: "/shlav-a-mega.html",
  },
  // Vitest reads this `test` block from vite.config.js when no explicit
  // vitest.config.* is present. Migrated from the old vitest.config.js
  // (deleted) to keep config single-source.
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 50,
        branches: 40,
      },
    },
  },
});
