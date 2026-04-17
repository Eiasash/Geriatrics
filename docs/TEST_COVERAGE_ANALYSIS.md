# Test Coverage Analysis — Shlav-A-Mega (Geriatrics)

_Date: 2026-04-17_
_Scope: `tests/**`, `src/**`, `shared/**`, `shlav-a-mega.html`, `sw.js`_

## 1. What we have today

Vitest-driven suite with 11 files:

| Test file | Style | Target |
|---|---|---|
| `appLogic.test.js` | Unit (copied pure functions) | FSRS math, STOPP/ACB, sanitize, `buildMockPool`, `calcStreak`, `getEolResult`, `isExamTrap`, `isChronicFail`, `getDueQuestions`, `getTopicStats` |
| `appLogicExpanded.test.js` | Unit (copied) | Additional edge cases |
| `appIntegrity.test.js` | Static text/regex on HTML | Doctype, RTL, version sync, manifest fields |
| `dataIntegrity.test.js` | JSON schema | `questions.json`, `notes.json`, `drugs.json`, `flashcards.json`, `topics.json` |
| `expandedDataIntegrity.test.js` | JSON schema | Deeper invariants |
| `serviceWorker.test.js` | Static text/regex on `sw.js` | Cache keys, URL lists, lifecycle, background sync, push, image cache |
| `sharedFsrs.test.js` | Reads `shared/fsrs.js` via `new Function(...)` | Exports + algorithm |
| `coverageGaps.test.js` | Static text/regex on HTML | AI proxy routing, CSP, sanitize usage counts |
| `auditPhases.test.js` | Static | Phase refactor guardrails |
| `migrationWiring.test.js` | Static | Migration wiring |
| `regressionGuards.test.js` | Mixed | Content quality guards |

External-module source (`src/auth/githubAuth.js`, `src/sw-update.js`, `src/storage.js`, `shared/fsrs.js`) is **only** exercised by `sharedFsrs.test.js`. Everything else in `src/` has no direct unit tests — the app is still a monolith in `shlav-a-mega.html`, and most "coverage" is achieved by copying pure functions into test files.

## 2. The structural problem: **test-copy drift**

`appLogic.test.js` and `appLogicExpanded.test.js` re-declare FSRS constants, `sanitize`, `getSTOPPWarnings`, `getEolResult`, `calcACBTotal`, etc. **verbatim from `shlav-a-mega.html`**. If the HTML version diverges (a fix, a bug, a new STOPP rule), the test passes on the copy and the app breaks silently.

`sharedFsrs.test.js` avoids this by loading `shared/fsrs.js` via `new Function(code + "...")`. That pattern should become the norm for every pure function we care about.

## 3. Gap areas, ranked by risk

### 3.1 HIGH — Source-of-truth drift between HTML and test copies
- `sanitize`, STOPP rules, ACB totaling, `getEolResult`, `buildMockPool`, `calcStreak`, `isExamTrap`, `isChronicFail`, `getDueQuestions`, `getTopicStats` are tested only against copies.
- **Fix:** Extract these into `shared/` or `src/*` modules (as already done for `fsrs.js`) and import them in tests. Convert each existing `describe(...)` block to call the real export.
- **Payoff:** every existing assertion becomes genuine regression coverage instead of self-consistency.

### 3.2 HIGH — `sw-update.js` and `storage.js` have zero runtime tests
- `src/sw-update.js` (update banner, cache cleanup, `SKIP_WAITING` postMessage) is only syntax-checked (`node --check` in `verify`).
  - **Propose:** jsdom-driven tests with a mocked `navigator.serviceWorker.register`, `caches`, and `localStorage` to cover: banner shown once, dismiss persists via `localStorage`, `applyUpdate()` posts `SKIP_WAITING` to `reg.waiting`, old `shlav-a-*` caches deleted but current kept, no banner when `_swDismissKey` is set.
- `src/storage.js` `lsGet`/`lsSet` have no tests.
  - **Propose:** tests for: corrupt JSON triggers `removeItem`, missing key returns fallback, `??` handles stored `null`, `lsSet` swallows quota errors.

### 3.3 HIGH — `githubAuth.js` (Supabase OAuth) untested
- No assertion that `signInWithGitHub`, `signOutGitHub`, `getGitHubSession` exist on `window`, dispatch the right provider, and use the expected redirect URL.
- **Propose:** mock dynamic `import()` of `@supabase/supabase-js@2`, spy on `signInWithOAuth`, and assert provider=`github` and `redirectTo===window.location.origin`. Also assert the auto-check-session IIFE silently swallows errors.

### 3.4 HIGH — Service worker runtime behavior never runs
- `serviceWorker.test.js` does `readFileSync + .toContain`/`.toMatch` — useful for presence, useless for correctness. A typo inside an `install` handler will still ship.
- **Propose:** boot `sw.js` inside a minimal `ServiceWorkerGlobalScope` mock (e.g., `serviceworker-mock`). Assert:
  - `install` pre-caches the full `HTML_URLS ∪ JSON_DATA_URLS` set.
  - `activate` deletes old caches, keeps `IMG_CACHE`.
  - `fetch` for a `question-images` URL returns from `IMG_CACHE` and calls `trimCache` beyond `MAX_IMG_CACHE_ENTRIES`.
  - `fetch` for `navigate` falls back to `shlav-a-mega.html` on network failure.
  - `sync` event pulls `pending_sync`, posts to Supabase, deletes the IDB entry only on `res.ok`.
  - `notificationclick` focuses an existing client or opens a new window.

### 3.5 MEDIUM — Geriatrics-only data-quality regression guards are thinner than InternalMedicine
- InternalMedicine has `regressionGuards.test.js` that catches Hebrew mojibake (`ð`), reversed RTL digits (`בת06` → `60`), missing spaces (`בן58`), question-mark-wrong-side (`?heb...`), adjacent-question bleed, per-session question count locks, and canonical-JSON-vs-`data/questions.json` sync.
- Geriatrics has `dataIntegrity.test.js` but **no** mojibake scan, **no** per-tag count lock, **no** canonical drift check.
- **Propose:** port the six InternalMedicine content-quality checks to Geriatrics `tests/contentQuality.test.js`. Especially the `ð` scan — cheap and catches a real shipped class of bug.

### 3.6 MEDIUM — Quiz engine / UI logic in the HTML monolith untested
- `shlav-a-mega.html` has ~317 KB of code; pool building, smart-shuffle tiers, mock exam construction, exam-year multi-select filter, on-call mode, teach-back grading — **none** of this runs in tests.
- **Propose:** extract quiz logic into `src/quiz/engine.js` (mirroring InternalMedicine's structure) and add unit tests for:
  - `buildPool('weak')` — returns questions from bottom-10 topics with ≥3 attempts.
  - `buildPool('rescue')` — 7 per-topic weakest questions × 3 topics = 21.
  - `buildPool('hard')` — sorted ascending by `ef`; fallback to "any SR data" when empty.
  - Smart shuffle tier ordering on `filt='all'` (due → D>7 → D>4 → rest).
  - Option shuffle determinism: same `qIdx` → same order; meta-options ("כל התשובות נכונות", "A and C") pinned to end.

### 3.7 MEDIUM — AI client retry/fallback/abort logic not covered
- `coverageGaps.test.js` greps for `AI_PROXY`, `x-api-secret`, `AbortController`. It cannot detect:
  - proxy 5xx → fallback to direct API,
  - no key → `throw new Error('no_key')`,
  - abort signal canceling an in-flight `fetch`,
  - response shape `d.content?.[0]?.text` missing → does not throw.
- **Propose:** extract `callAI` into `src/ai/client.js` (matching InternalMedicine), mock `fetch`, and assert each branch.

### 3.8 MEDIUM — CSP / XSS assertions are presence-only
- `coverageGaps.test.js` checks CSP string contains `https://*.supabase.co`. It does not verify that `innerHTML` assignments actually route through `sanitize()` across all ~20 call sites.
- **Propose:** an AST-level test (via `acorn`, already a devDep) that walks every `AssignmentExpression` where the LHS is `innerHTML` and asserts the RHS tree contains a `sanitize()` call. Whitelist the few known-safe static strings.

### 3.9 LOW — No end-to-end / DOM rendering tests
- Nothing exercises `document.body.innerHTML = render()`. Broken rendering ships if a regex test happens to pass.
- **Propose:** a single jsdom smoke test: load the HTML, wait for `DOMContentLoaded`, assert main nav tabs render, answer one question, assert `G.S.qOk` increments and localStorage round-trips. Cheap and catches dozens of integration bugs.

### 3.10 LOW — Flashcards/drugs/notes content not tested for semantic correctness
- Schema checks only verify shape. No test catches, e.g., a drug flipped from `beers: true` → `beers: false`, or a note citing the removed GRS source outside the `ch` field.
- **Propose:** a small fixture of "high-risk" drugs (benzos, anticholinergics, NSAIDs on warfarin) whose `beers`/`acb` flags are locked to expected values — catches casual edits.

## 4. Suggested implementation order

1. **Extract shared pure functions** (`sanitize`, STOPP, ACB, `getEolResult`, `calcStreak`, `buildMockPool`) into `src/*` or `shared/*` modules and point existing tests at them. Zero new tests, large risk reduction. (§3.1)
2. **Port InternalMedicine's `regressionGuards.test.js`** to Geriatrics. Quick win, catches a real bug class. (§3.5)
3. **Unit tests for `sw-update.js` and `storage.js`** under jsdom. (§3.2)
4. **`githubAuth.js` mocked-fetch tests.** (§3.3)
5. **AST-level `innerHTML → sanitize()` guard.** (§3.8)
6. **Service worker runtime tests** via `serviceworker-mock`. (§3.4)
7. **Quiz engine extraction + tests.** (§3.6)
8. **Smoke E2E.** (§3.9)

Steps 1–4 are each 1–2 hours and remove the biggest drift/silent-failure risks. Steps 5–8 are larger refactors with correspondingly larger payoff.
