# AGENTS.md — Cloud development notes

## Cursor Cloud specific instructions

### Product

Single-file PWA (`shlav-a-mega.html`) for Israeli geriatrics board exam prep. No production build step — static files + lazy-loaded `data/*.json`. See `CLAUDE.md` for full architecture.

### Required local services

| Service | Purpose | Command |
|---------|---------|---------|
| Static HTTP server | Serve the PWA + JSON data | `python3 -m http.server 3737` |
| Node.js + npm | Tests and verify gate | `npm ci` then `npm test` / `npm run verify` |

**Optional (not needed for core dev):** Supabase cloud sync, Toranot AI proxy, Playwright (chaos bots only).

### Standard commands

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Dev server | `python3 -m http.server 3737` → open `http://localhost:3737/shlav-a-mega.html` |
| Alt dev server (Vite HMR) | `npm run dev` (same port 3737) |
| Tests only | `npm test` |
| Pre-push gate (lint + tests) | `npm run verify` |

There is no ESLint/Prettier. `npm run verify` is the static-analysis + test gate (7 checks: Node syntax, 5× Python audits, Harrison baseline, Vitest).

### System dependencies

- **Node.js** 18+ (CI uses 20; cloud VM has 22)
- **Python 3** — stdlib only, no venv or `requirements.txt`
- **Playwright Chromium** — only if running `npm run chaos` or `scripts/chaos-doctor-bot-v4.mjs`; install with `npx playwright install --with-deps chromium`

### Dev server gotchas

1. **Help overlay on first load** — `showHelp()` auto-opens `#help-overlay` at z-index 9999. Dismiss with Escape before clicking quiz options (chaos bots do this automatically).
2. **Data load is async** — wait for console message `Data loaded: N questions, 46 notes` before interacting with the quiz.
3. **tmux for long-running server** — start the HTTP server in a tmux session so it survives across shell commands:
   ```bash
   tmux -f /exec-daemon/tmux.portal.conf new-session -d -s geri-dev-server -c /workspace -- bash -l
   tmux -f /exec-daemon/tmux.portal.conf send-keys -t geri-dev-server:0.0 'python3 -m http.server 3737' C-m
   ```
4. **Version trinity** — `package.json` `version`, `APP_VERSION` in `shlav-a-mega.html`, and `CACHE` in `sw.js` must stay aligned on every release.

### Hello-world smoke test

1. Open `http://localhost:3737/shlav-a-mega.html`
2. Dismiss help overlay (Escape)
3. Click a quiz answer option (`button.qo`)
4. Click "בדיקה" (check answer) — expect green border on correct option + explanation
