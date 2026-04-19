# Test Coverage Analysis — Geriatrics

_Generated 2026-04-19. Scope: `src/**`, `shared/**`, `sw.js`, `shlav-a-mega.html`, `data/**`, `scripts/**` against `tests/*.test.js` (21 specs). Runner: Vitest, global thresholds `lines:50 / branches:40` in `vitest.config.js`._

## 1. What is covered well

| Area | Test file(s) | Notes |
| --- | --- | --- |
| FSRS-4.5 math | `sharedFsrs.test.js`, `flashcardFsrs.test.js` | `fsrsR`, `fsrsInterval`, `fsrsUpdate`, chronic-fail. |
| Tag migration | `tagMigration.test.js`, `migrationWiring.test.js` | SR schema bumps; wiring into boot. |
| XSS on AI output | `aiAutopsyXss.test.js` | Autopsy sink. |
| Data integrity | `dataIntegrity.test.js`, `expandedDataIntegrity.test.js`, `contentQuality.test.js`, `coverageGaps.test.js` | Schema of questions/notes/drugs JSON; topic orphans. |
| Audit phases | `auditPhases.test.js` | Exam audit script invariants. |
| Polypharmacy rules | `polypharmacyRules.test.js` | Beers / STOPP-style interactions in drug data. |
| Regulatory tags | `regulatoryTags.test.js` | Israeli-MOH / Clalit / Maccabi tag vocabulary. |
| Time signals | `timeSignals.test.js` | Date-string shape in SR data. |
| Chapter linking | `chapterLinking.test.js`, `topicRefCoverage.test.js` | Harrison/Hazzard refs resolve. |
| App-boot regressions | `appIntegrity.test.js`, `regressionGuards.test.js`, `appLogic*.test.js` | Guards historical bugs loading `shlav-a-mega.html`. |
| Service worker | `serviceWorker.test.js` | Registration + version shape. |
| Sync indicator | `syncIndicator.test.js` | Cloud-backup badge state machine. |

## 2. Structural gap: the monolith

Unlike the sibling InternalMedicine repo (where logic lives in `src/quiz/engine.js`, `src/sr/spaced-repetition.js`, `src/features/cloud.js`), Geriatrics keeps **the entire quiz engine, state layer, SR scheduler, and UI renderer inside `shlav-a-mega.html` (~358 KB)**. The `src/` directory only contains:

- `src/storage.js` (~30 LOC) — localStorage helpers.
- `src/sw-update.js` (~100 LOC) — service-worker update prompt.
- `src/auth/githubAuth.js` (~80 LOC) — GitHub OAuth device flow.
- `shared/fsrs.js` (~100 LOC) — FSRS math (also vendored into InternalMedicine).

Everything else is executed by `appLogic*.test.js` loading `shlav-a-mega.html` into jsdom and poking globals. That makes tests:
- **Slow and coarse**: any logic change triggers jsdom boot.
- **Hard to isolate**: you cannot unit-test `buildPool`, `srScore`, `renderQuiz`, `cloudBackup` — they are not exported.
- **Regression-only**: guards against specific known bugs, not forward-looking invariants.

Most of the remaining proposals depend on extracting logic from the HTML. Track that work here so tests can be added alongside.

## 3. Largest untested surfaces

Because logic is inside `shlav-a-mega.html`, the gaps are framed by feature area rather than file:

| Feature area | Where the code lives today | What isn't covered |
| --- | --- | --- |
| Quiz pool builder | inline `buildPool()` in HTML | Tier ordering for `filt='all'`; `traps`/`rescue`/`weak`/`hard`/`slow`/`years` branches. |
| Mock exam | inline `buildMockExamPool()` | Topic-frequency weighting, per-topic result accounting, end-of-exam modal. |
| `srScore` wrapper | inline | Corrupted SR state, clock skew, migration from SM-2 extremes. |
| Rescue drill | inline `buildRescuePool()` | Weakest-topic selection with <3 answers, tie-breaking. |
| Cloud backup / restore | inline | 409 conflict upsert path; restore-payload whitelist (the sibling repo has `filterRestorePayload` + a dedicated test — missing here). |
| Leaderboard submit | inline | Thin-data gate; accuracy/readiness never decreasing on retry. |
| AI explain / autopsy | inline | Prompt-injection via Hebrew user input; `_exCache` persistence; offline fallback. |
| Pomodoro / Sudden-Death / NBS / voice | inline | State machines, leaderboard sort/trim. |
| Feedback submission | inline | Answer-report hash determinism (stem hash in the sibling repo). |
| `src/auth/githubAuth.js` | `src/` | Device-flow polling, token refresh, logout clears local state. |
| `src/sw-update.js` | `src/` | SKIP_WAITING message, clients reload exactly once per version. |
| `src/storage.js` | `src/` | Quota-exceeded recovery, corrupt-JSON recovery. |
| `sw.js` activate handler | root | Old-cache deletion on version bump. |

## 4. Proposed areas to strengthen (ranked by impact)

### 4.1 Extract + test quiz engine — **highest impact**
Pull `buildPool`, `buildMockExamPool`, `srScore`, `getDueQuestions`, `getWeakTopics`, `buildRescuePool`, `isExamTrap`, `getStudyStreak` from `shlav-a-mega.html` into `src/quiz/` and `src/sr/`, mirroring the InternalMedicine layout. Port the sibling repo's tests (`srScore.test.js`, `optShuffle.test.js`, `cloudRestore.test.js`, `leaderboardGuard.test.js`) since the two apps share the same engine.

### 4.2 Cloud restore whitelist
InternalMedicine has `filterRestorePayload()` + a proto-pollution test. The equivalent code in `shlav-a-mega.html` should be extracted and hardened the same way. A malicious backup blob can currently inject arbitrary keys into state.

### 4.3 FSRS boundary & migration edge cases
Even with FSRS math covered by `sharedFsrs.test.js`, the **wrapper** that calls it (`srScore` inline in HTML) is not. Add tests once extracted:
- Corrupted `s` (missing `ts`, negative `ef`, `fsrsS=NaN`).
- `lastReview` in the future (clock skew).
- `fsrsMigrateFromSM2` for extreme inputs.
- `getStudyStreak` across DST.
- `isExamTrap` when `wc` totals exceed `tot` (should not crash).

### 4.4 Auth flow (`src/auth/githubAuth.js`)
- Device-code polling: timeout, user denial, slow_down response.
- Expired access token → silent sign-out, `G.S.user` cleared.
- Anonymous fallback preserves local state on sign-in/out.

### 4.5 Service-worker upgrade contract
- On `activate`: old caches deleted; in-flight fetches not dropped.
- `src/sw-update.js` posts `SKIP_WAITING` exactly once; client reloads exactly once per version.
- `check-version-sync.py` (pre-commit) agrees with `manifest.json` + `sw.js` version strings.

### 4.6 UI rendering snapshots / XSS
Current XSS test targets AI autopsy output. Extend to cover:
- Question stem rendering with Hebrew + RTL payloads.
- Drug-card rendering (Beers/STOPP interaction strings) — currently only the data is validated, not the rendered HTML.
- Exam-result modal: no unescaped topic names.

### 4.7 Data-validation scripts
`scripts/` contains audit tools (`jun22_audit`, `sept24_audit`, `harrison-hebrew-baseline`, `check-innerhtml*`, etc.) executed by `npm run verify`. Most have no unit tests of their own. At least:
- `check-innerhtml-pieces.py` false-positive/negative fixtures.
- `harrison-hebrew-baseline.cjs` detects a real Hebrew regression.
- `merge-questions.cjs` dedup key stability when stems are re-ordered.

### 4.8 Storage resilience (`src/storage.js`)
- Quota exceeded → graceful degradation, user-visible warning.
- Corrupt JSON → reset to defaults, prior state archived to `pnimit_backup_{ts}` (if intended).
- Cross-tab write conflict → last-writer-wins with a `storage` event listener.

### 4.9 Beyond unit tests

- **Smoke/E2E**: one Playwright test that loads `shlav-a-mega.html`, answers a question, triggers a cloud restore, asserts no console errors. Protects against CSP / asset / path regressions.
- **Cross-app parity**: `shared/fsrs.js` is vendored into both Geriatrics and InternalMedicine. Add a parity test (byte-identical exports or behavioural equivalence) to prevent drift.
- **Hebrew/RTL fixtures**: reuse the `hebrew-medical-glossary` skill's vocabulary for sanitization + view-snapshot fuzzing.

## 5. Coverage configuration

`vitest.config.js` currently sets global `lines:50 / branches:40`. With most logic in an HTML monolith, global coverage is a coarse signal:

1. Once logic is extracted (§4.1), add per-file thresholds for `src/quiz/engine.js`, `src/sr/spaced-repetition.js`, `src/features/cloud.js`, `src/core/state.js` at `lines:85 / branches:75`.
2. Keep HTML-driven regression tests running in jsdom, but stop counting them toward line coverage (they inflate numbers without exercising branches).
3. Add a CI step that diffs `tests/*` vs the sibling InternalMedicine repo and flags tests that exist there but not here (both apps share an engine — coverage should be symmetric).

## 6. Quick-win list (in priority order)

1. Extract `srScore` + `filterRestorePayload` to `src/` and port the sibling repo's tests.
2. Add a cross-app parity test for `shared/fsrs.js`.
3. Service-worker activate/SKIP_WAITING test.
4. `githubAuth` device-flow tests with mocked fetch.
5. Playwright smoke test booting `shlav-a-mega.html`.
6. Audit-script fixture tests (`check-innerhtml-pieces`, `harrison-hebrew-baseline`).
7. Per-module coverage thresholds once logic is extracted.
