# Audit-8 — R1.5 mechanism-capture pre-registered gate (long-duration probe + first-failure diff) — NO-RUN, ZERO-DOLLAR

Append-only; do not retro-edit (`feedback_spec_provenance_append_only`). Lane: single (Claude Code, post 5-19 retirement; `claude/audit8-g5-r15-mechanism-capture`, cut from `origin/main` post-#241 squash). Trinity: **untouched** — docs + bot scripts + tests only, **no bump** (mirrors #235/#241: instrument/findings precursors do not bump trinity).

**Parent / trigger.** PR #241 (R1 findings-only RESULT) disk-evidence falsified R1.0/R1.0b's mechanism hypotheses (DOM drift + extractor regression) — neither has a bisect surface, neither matches the observed bifurcation. The G5 gate's R1 route is exhausted at the *mechanism-identification* step; R1.2's fix-and-pass GREEN criterion cannot be reached without first knowing what to fix. R1.5 authors the **mechanism-capture procedure** that R1 needed but didn't have.

This is not a re-derivation of the G5 representativeness verdict (`STOP-JOIN-INTEGRITY`, frozen at #238). The verdict still routes through R1→R2→R3; R1.5 is a *sub-phase of R1*, gated behind this PR, before R1.2's fix.

## Why R1.5 is NOT a "second G5 gate"

The G5 doc warns single-gate-only on representativeness. R1.5 is **not** a representativeness re-gate. It is the *mechanism-capture session* the original R1.1 implicitly assumed would be a `git bisect` — disk evidence proved bisect is structurally unavailable, so R1.5 substitutes the procedure that *can* identify the mechanism. The G5 representativeness gate is closed and untouched. No verdict re-routes through R1.5.

---

## READ THIS FIRST — what this gate authorizes and forbids

- It pre-registers the **long-duration RED probe**, the **first-failure capture surface**, the **diff-vs-Phase-1-control protocol**, and the **mechanism-class branch matrix** (named before evidence, not selected post-hoc).
- It does **NOT** authorize a fix. R1.5 RESULT (appended-only by the next session) names the mechanism and routes to a follow-on R1.6 fix gate.
- It does **NOT** authorize widening the R3 $20 cap (per G5 doc R3 — inherits unchanged).
- It does **NOT** authorize analyzer changes. The analyzer's temporal-blindness (it counted, didn't time-bin — the very bug that hid the bifurcation in #238 RESULT) is a separate AUDIT-9 prerequisite for R3, **not** R1.5.

---

## STEP 0 — distrust contract (no-run; results)

- **0.1 State (verified — Claude Code to re-verify at session start).** `git fetch --all`; `origin/main` HEAD = post-#241 squash. `docs/AUDIT8_G5_REPAIR_GATE.md` present on main; R1 RESULT section appended via #241. No prior `claude/audit8-g5-r15-*` branch; no `docs/AUDIT8_R1_5*` doc. Solo session; branch + PR; **no self-merge** (audit-evidence path; R1.5 is `docs/AUDIT*` + `scripts/audit8/**` + `tests/audit8*`).

- **0.2 Disk-verified RESULT facts (ground truth — from #241 R1 disk evidence, cite as RESULT-derived).**
  - Audit-8 run `chaos-reports/v4-long/audit8_20260518T191705Z/` exhibits **bifurcation**, not steady-state failure:
    - **Phase 1** (19:17→22:30, 3h14m): 0 `pre-pick-skip`, 2-3 `ok`/min.
    - **Transition** (~22:31, 1m40s gap, zero `pageerror`/`console:error`/HTTP-error footprint).
    - **Phase 2** (22:31→03:17, 4h46m): 13-14 `pre-pick-skip`/min, 0 `ok`.
  - Aggregate `3800/4309 ≈ 88%` from #238 RESULT is **time-averaged** over both phases. Phase-1 ≈ 0%, Phase-2 ≈ 95%.
  - Audit-7 (4h, 569 ok) stayed in Phase-1 the entire run — never crossed the transition.
  - Bisect window `dac09e2..4a66ed8` contains **zero** `shlav-a-mega.html` commits and zero `extractQuestion` changes. The structural absence of a bisect surface refutes both R1.0's DOM-drift hypothesis (H1) and the implicit extractor-regression alternative.

- **0.3 The unverified HYPOTHESIS-CLASS (must be proved by R1.5 capture, not assumed).** The Phase-2 onset is **duration-gated** (audit-7 4h stayed flat; audit-8 8h crossed at 3.2h) and **silent** (no error footprint at transition). Candidate mechanism classes are pre-registered in the branch matrix below; R1.5 captures evidence to select among them. R1.5 does **not** assume which class wins.

- **0.4 Frozen-analyzer state.** `scripts/analyze_pick_representativeness.mjs` remains frozen at `edfa433` (per G5 doc § 0.4). R1.5 does **not** touch the analyzer. Temporal-bin awareness is **AUDIT-9 prerequisite for R3**, separately gated, out of R1.5 scope.

---

## HYPOTHESIS-CLASS MATRIX (pre-registered before R1.5 captures evidence)

R1.5 RESULT must name **one** of these as the named mechanism (or surface a fifth, novel class with the disk evidence to back it). Selection is by capture diff, not by inference.

- **Class A — Browser process leak.** Chromium accumulates heap / GC pressure over 3+ hours. DOM operations slow, `extractQuestion` queries time-out silently or return null. **Capture signal:** process memory at Phase-2 onset ≫ Phase-1 baseline; GC frequency rising.
- **Class B — Page-state accumulation.** The PWA's own JS heap grows (SR queue, render buffer, IndexedDB cursor leaks, event-listener accumulation). DOM queries find inconsistent state. **Capture signal:** `performance.memory` heap ratio at Phase-2 onset > N× Phase-1; DOM node count drift.
- **Class C — Connection / proxy state.** Toranot proxy session expires, CDN edge rotates, keep-alive drops to a server that 5xx-silently. The bot's extractor calls page-rendered DOM, NOT the proxy directly — but the practice surface might be re-fetching exam data and getting partial content. **Capture signal:** `chrome://net-internals` connection state at onset; HAR diff between Phase 1 + Phase 2; Toranot response headers (rate-limit, set-cookie expiry).
- **Class D — Persistent bot-profile state.** Chromium user-data-dir or IndexedDB accumulates per-question state that triggers a degraded code path after N entries. **Capture signal:** IndexedDB + localStorage + Service Worker registration snapshot at onset; compare to Phase-1.
- **Class E (open) — Novel mechanism.** If none of A–D match the capture, R1.5 RESULT names the actual mechanism with disk evidence. Pre-registered so a fifth class is not post-hoc reframing.

---

## THE LOCKED CAPTURE PROCEDURE (binding)

### R1.5.0 Long-duration RED probe — `scripts/audit8/r15LongProbe.mjs` (new file)

Continuous run, minimum **6 hours** (covers audit-7's 4h flat + a 2h margin past the 3.2h transition window). Per-minute telemetry:

- Timestamp
- `pre-pick-skip` count (cumulative + delta-from-prev-minute)
- `ok` count (cumulative + delta)
- Last `extractQuestion` outcome (success / null / no-options)
- `performance.memory` snapshot (`usedJSHeapSize`, `totalJSHeapSize`, `jsHeapSizeLimit`)
- DOM node count (`document.querySelectorAll('*').length`)
- Active service workers (`navigator.serviceWorker.getRegistrations().length`)

Output: `chaos-reports/v4-long/audit8r15_<ts>/timeline.jsonl` (one record per minute).

**RED criterion:** the probe reproduces Phase-2 onset (≥10 consecutive minutes of `pre-pick-skip > 5/min` after ≥1h of `ok > 1/min`). If 6h elapses with no Phase-2 crossing, extend to 10h. If 10h elapses with no crossing, R1.5 surfaces RED-NOT-REPRODUCED to user (the bifurcation may be load-dependent on factors not present in the controlled re-run; this is a discrete bail condition, not a fix-in-place).

### R1.5.1 First-failure capture trigger

The probe carries a **trigger predicate**: the first minute where `pre-pick-skip > 0` AND the previous minute had `ok > 0`. At that minute boundary, the probe halts the bot loop (does not close the page) and captures:

- **DOM:** `document.documentElement.outerHTML` → `firstfail-dom.html`
- **Console log buffer:** all `console.log/info/warn/error` from page start → `firstfail-console.jsonl`
- **`performance.memory` snapshot** → `firstfail-perf.json`
- **Active network requests:** `chrome.debugger` / CDP `Network.getResponseBody` for last 20 requests → `firstfail-net.jsonl`
- **HAR export:** Playwright `page.context().tracing.export()` for the last 5 minutes → `firstfail-trace.zip`
- **Toranot proxy state:** if last request was to `toranot.netlify.app/api/claude`, capture response headers (`set-cookie`, `x-ratelimit-*`, `cf-cache-status`) → `firstfail-toranot.json`. If no recent proxy call, log absence.
- **Persistent state:** evaluate in page → `{ idb: Object.fromEntries(await Promise.all(allStores.map(...))), ls: {...localStorage}, sw: registrations.map(r=>({...})) }` → `firstfail-persist.json`
- **Screenshot:** `firstfail-screenshot.png`

### R1.5.2 Phase-1 control capture (taken BEFORE the first-failure trigger fires)

At minute **30** of the probe (deep in Phase 1, well before the transition window), capture the **same 7 artifacts** with prefix `phase1control-`. Provides the diff baseline.

### R1.5.3 Mechanism diff + class selection

Once R1.5.1 fires and the control is in hand, the session author runs:
- `diff firstfail-dom.html phase1control-dom.html` — DOM-state drift?
- `jq '.usedJSHeapSize' phase1control-perf.json` vs `firstfail-perf.json` — heap accumulation?
- `diff firstfail-persist.json phase1control-persist.json` — persistent state drift?
- Manual review of console + network traces

**One** of Classes A–E is named per the matrix. Selection criterion: which class's "capture signal" is present in the diff. If multiple, the dominant one is named with the others listed as confounders.

### R1.5.4 R1.5 RESULT — append-only to *this* doc

R1.5 RESULT section captures:
- The captured artifacts' on-disk paths
- The named mechanism class (A/B/C/D/E)
- The diff evidence supporting the selection
- The follow-on R1.6 fix-gate scope sketch (single paragraph; not a fix-spec)

No trinity bump. No fix written. R1.6 is its own session.

---

## PRE-REGISTERED PREDICTIONS + OVERTURN CONDITIONS (`feedback_prewritten_predictions`)

Locked before R1.5 data is captured:

- **Prediction (lean — not assumed):** Class A (browser process leak) is the most likely mechanism, given the duration-gated onset (memory accumulation is monotonic in wall-clock) and the silent transition (GC pause / OOM doesn't fire `console:error`).
- **Refutation:** if `performance.memory` deltas at first-failure are within 2× of Phase-1 baseline, Class A is **refuted** → Class B/C/D selected by other signals.
- **Prediction:** the captured DOM at first-failure is structurally identical to Phase-1 (DOM count within 10%, same query-selectors resolve). If true, the extractor's NULL output is not a DOM-state issue → strengthens Class A or C.
- **Refutation:** if the DOM at first-failure has substantively different structure (modal injected, route changed, content removed), it's a page-state issue → Class B selected.
- **Prediction:** even with mechanism named, R1.6's fix scope is bot-side (process restart, page reload, profile reset), NOT shlav-a-mega.html. The aggregate-disclosure trap from the original R1 (88% steady-state assumption from a bimodal distribution) confirms the production app is not the surface.
- **Refutation:** if Class B's diff names a specific PWA leak (event-listener accumulation, IDB cursor leak), R1.6's fix MIGHT need a shlav-a-mega.html commit — separately re-scoped at R1.6 time, NOT bundled into R1.5 RESULT.

---

## SCOPE

Mechanism capture for the Phase-2 extraction failure **only**. Ships **no fix**. Flips **no `q.c`**. Changes **no `broken`**. Touches **no analyzer**. Touches **no Toranot file**. R2 (`t`-aware join) remains gated behind R1.6 (the fix gate that R1.5 routes to). R3 remains gated behind R2. The $20 cap stays untouched.

## OUT OF SCOPE (handed off untouched)

- R1.6 fix gate — separate session, gated behind R1.5 RESULT
- R2 `t`-aware analyzer change — G5 doc § R2 still binding
- R3 paid bounded run — G5 doc § R3 still binding; $20 cap NOT widened
- **AUDIT-9 prerequisite for R3 — temporal-bin analyzer change.** The #238 RESULT's `3800/4309 ≈ 88%` aggregate hid the bifurcation. R3's analyzer must temporal-bin (e.g., per-15-min buckets) to surface re-occurrence of the bifurcation class. Authored as its own pre-registered gate before R3 fires. Out of R1.5 scope.
- Any `q.c` / `broken` / distractor edit
- B4 content adjudication

## SHIP

Tracked, docs + scripts + tests only, append-only audit-5/6/7/8-style: **this gate doc** (committed this session) + R1.5 RESULT section appended append-only by the capture session. **No trinity bump.** Branch `claude/audit8-g5-r15-mechanism-capture` → PR to `main`. **NO self-merge** (audit-evidence path → fresh-eye review → Eias merges).

This PR is **gate-only**: the R1.5 capture run is its own subsequent session, gated behind this PR landing on main. R1.5.0–R1.5.3 procedure ships as `scripts/audit8/r15LongProbe.mjs` + supporting libs in *this* PR; the **run** of it (and the RESULT append) is the next session.

<!-- R1.5 RESULT section appended append-only below by the capture session. -->

---

## §R1.5.1.1 — debounce calibration (appended 2026-05-24, post first R1.5 capture-run)

**Append-only correction to §R1.5.1.** Per `feedback_spec_provenance_append_only`, the §R1.5.1 trigger predicate as originally bound — "the first minute where `pre-pick-skip > 0` AND the previous minute had `ok > 0`" — is NOT retro-edited. This section calibrates the predicate after the first R1.5 capture run produced a false-positive capture, and BINDS the new shape forward.

### What the 2026-05-24 run showed

R1.5 run `chaos-reports/v4-long/audit8r15_20260524T022036Z/` (361 timeline minutes, terminated by `maxHours` after the bifurcation reproduced):

- `firstfail-*` artifacts captured at **min 49** on a single-skip Phase-1 blip (`d_skip` 2→3 over one minute, `d_ok=12`, `outcome=ok`). At capture time the run was indistinguishable from Phase-1: `cumulativeOk=646`, `cumulativePrePickSkip=3`. The next 200+ minutes continued in Phase-1 with `ok` climbing 12–14/min.
- The actual Phase-1 → Phase-2 lock-in happened at **min 287** (partial transition: `d_skip=6`, `d_ok=7`, `outcome=no-quiz`) and locked in fully from **min 288** (`d_ok=0`, `outcome=no-quiz`, sustained ≥73 minutes through end of run).
- Because the `firstFailCaptured` budget was already consumed at min 49, the actual lock-in moment was NOT captured as a snap. The `phase1control-*` baseline at min 30 is valid; the firstfail capture is not.
- The §R1.5.0 RED-criterion (`detectRedCrossing`) is unaffected — it correctly detected the crossing in this run because its predicate uses a `>5` skip-rate threshold over a 10-minute streak, which the single 1-skip blip does not satisfy.

The full timeline shows **7** independent Phase-1 blip minutes in 287 Phase-1 minutes (min 1, 11, 49, 63, 78, 160, 188) — each is exactly 1 minute wide with `d_skip=1`, `d_ok≥12`, `outcome=ok`. The bifurcation signature (sustained `d_ok=0 AND outcome='no-quiz'`) is qualitatively distinct from any of these blips.

### Bound forward (replaces §R1.5.1 trigger predicate)

The first-failure trigger predicate is now a **3-minute streak debounce on the Phase-2 lock-in signature** rather than a single-event prev/curr crossing. Fires at the minute `t` where:

1. For each of `t-2`, `t-1`, `t` (the last `firstFailStreakMinutes=3` records): `deltaOk === 0` AND `lastExtractOutcome === 'no-quiz'`.
2. AND somewhere in the timeline before `t-2`, at least one record has `deltaOk > 0` (Phase-1 anchor — preserves the cold-start-failure exclusion the original predicate enforced with `prev.deltaOk > 0`).

Capture set per §R1.5.1 (DOM, console, perf, network, HAR, Toranot, persistent state, screenshot) is unchanged.

**N=3 justification (calibration anchor: 2026-05-24 run).** Longest observed Phase-1 blip width = 1 minute (n=7/7 blips). N=2 is mathematically sufficient for separation; N=3 adds 1 minute of defense-in-depth against unseen 2-minute Phase-1 anomalies for ~negligible capture-timing cost (Phase-2 sustains ≥73 min — captures at min 290 still see broken state). N≥5 would risk missing the transition's transient state; N=3 is the inflection point between safety and capture-timing.

**Asymmetry vs RED-CROSSING (§R1.5.0) is deliberate, not a bug.** RED uses thresholded streaks on counters (`deltaOk > redOkMinThreshold` for `redOkWindowMinutes` minutes followed by `deltaPrePickSkip > redSkipMinThreshold` for `redSkipStreakMinutes` minutes). firstFail uses the conjunction `deltaOk === 0 AND outcome === 'no-quiz'` for `firstFailStreakMinutes` minutes. The two predicates capture different states: RED is a *crossing detector* over the whole run (used to drive bail decisions); firstFail is a *lock-in moment selector* (used to fire a one-shot capture). RED has to be lenient enough to detect partial transitions in the aggregate; firstFail has to be strict enough to refuse Phase-1 blips. Don't force symmetry.

### Env knob

`R15_PROBE_FIRSTFAIL_STREAK_MINUTES` (default 3; minimum 1; identical clamp shape to existing knobs). Knob-tunable so future calibration runs can sweep N without code churn — but **default N is bound here and tracks `DEFAULT_CONFIG.firstFailStreakMinutes`**, pinned by `tests/audit8r15LongProbe.test.js` "matches the gate doc defaults".

### Test contract (replaces existing `shouldTriggerFirstFailure` cases)

`tests/audit8r15LongProbe.test.js` pins:

1. History under N → false.
2. Single-minute Phase-1 blip (today min-49 class) → false.
3. Two-minute Phase-2 streak under N=3 → false.
4. Three-minute Phase-2 streak after Phase-1 anchor → true.
5. Cold-start three-minute Phase-2 streak (no Phase-1 anchor) → false.
6. Phase-1 minute interrupts the streak tail → false.
7. Malformed inputs (null history, missing N, type errors) → false.
8. Replay-pin against the 2026-05-24 slimmed fixture (`tests/fixtures/r15-2026-05-24-timeline-slim.jsonl`) — never fires at min 1/11/49/63/78/160/188 (all 7 blips); fires first at min 290.

The replay-pin's fixture is a slimmed JSONL (~8KB) covering ±2-minute windows around each of the 7 blip minutes plus the bifurcation window 280–295, extracted from `chaos-reports/v4-long/audit8r15_20260524T022036Z/timeline.jsonl`. It captures the qualitative shape of the calibration anchor without committing the full 140KB timeline.

### Scope of this addendum

This §R1.5.1.1 calibration ships **with the predicate fix** in the same PR (atomic gate-doc-vs-code contract — test #8 enforces). The R1.5 capture run that motivated it (the min-49 false-positive run) remains valid evidence at `chaos-reports/v4-long/audit8r15_20260524T022036Z/`; the bad firstfail capture in that bundle stays as historical evidence of the bug this addendum closes. The next R1.5 run (whenever the host has a 6–10h headless window) consumes this debounce and aims to capture the actual lock-in at the new fire-point.

The R1.6 fix gate (named-mechanism → fix scope) is unaffected by this addendum. R1.5 still ships no fix. Trinity untouched.

---

## §R1.5.2-REV1 — Capture-set augmentation for class-discrimination (appended 2026-05-24, post PR #276)

**Append-only correction to §R1.5.2.** Per `feedback_spec_provenance_append_only`, the §R1.5.2 capture set as originally bound — 7 artifact files at `firstfail-*` and `phase1control-*` — is NOT retro-edited. This section augments the capture set after web-Claude fresh-eye review of AUDIT-9 (PR #275 review) identified three of the five R1.5 hypothesis classes as having insufficient discriminators in the existing set, and binds the new shape forward.

### What the §R1.5 hypothesis-class matrix required vs what was captured

R1.5 hypothesis classes (`docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md:47-51`) and the original capture set's coverage of each:

- **Class A — Browser process leak.** Covered by `phase1control-perf.json` / `firstfail-perf.json` (`performance.memory`). ✓
- **Class B — PWA page-state accumulation** (heap / event listener / IDB cursor / render buffer). Partially covered by `dom.html` (post-hoc diff possible). No structured signal on listener growth or cumulative DOM mutation count.
- **Class C — Connection / proxy state** (Toranot session, CDN edge rotation, SW cache swap). Partially covered by `net.jsonl` (last-20 requests) and `toranot.json` (last proxy call). No SW controller `scriptURL` snapshot, no Cache API entries listing.
- **Class D — Persistent bot-profile state** (IDB / localStorage / SW registrations). Covered by `persist.json`. ✓
- **Class E — Novel mechanism.** Open by design; no specific discriminator required.

Classes B and C were therefore under-discriminated; an R1.5 RESULT that named Class B or Class C as the selected mechanism would lean on `dom.html` post-hoc diffs alone, which is weaker than the structured signals available for Classes A and D.

### Bound forward — capture set extended to 11 artifact files

The capture set per §R1.5.2 (with the §R1.5.1.1 trigger debounce) is augmented to include **four new artifact files** at each capture prefix (`phase1control-`, `firstfail-`, plus the new `phase1late-` per the §R1.5.2-REV2 below):

- `${prefix}-mutation.json` — cumulative MutationObserver count since just after initial nav. Class B discriminator (PWA structural drift / listener accumulation).
- `${prefix}-cache-keys.json` — Cache API entries per cache. Class C discriminator (CDN edge rotation, SW cache swap).
- `${prefix}-controller.json` — active SW `scriptURL` + state. Class C discriminator (SW update taking control mid-run).
- `${prefix}-extract-probe.json` — `extractQuestion` called 5× back-to-back at capture time, with `hashStem(normStem(stem))` on each result. Class B verification (loop-healthy / page-broken). `extractQuestion` verified read-only at `scripts/chaos-doctor-bot-v4.mjs:239-265` — no quiz-position advance.

The original 7 artifact files are unchanged: `dom.html`, `console.jsonl`, `perf.json`, `net.jsonl`, `toranot.json`, `persist.json`, `screenshot.png` (plus `trace.zip` from Playwright tracing). Total per-capture artifact count: **12** (11 JSON/HTML/PNG + 1 trace.zip).

## §R1.5.2-REV2 — phase1late capture (companion REV, appended 2026-05-24, post PR #276)

The capture set fires at **three** timing points per run, not two:

1. `phase1control-*` at minute `phase1ControlMinute` (default 30) — deep Phase-1 baseline. Unchanged from §R1.5.2.
2. `phase1late-*` at minute `phase1LateMinute` (default 200) — **NEW** mid-run baseline. Bridges the 260-min observation gap that the 2026-05-24 run exposed (control at min 30, firstfail at ~min 290, nothing between). Diff `phase1control↔phase1late` surfaces gradual drift (Classes A / B); diff `phase1late↔firstfail` surfaces what changed AT the transition (Classes B / C / D).
3. `firstfail-*` at the §R1.5.1.1 debounce predicate fire-point — Phase-2 lock-in. Unchanged from §R1.5.1.1.

**Caveat.** If R1.5-RE-RUN's Phase-2 onset arrives earlier than min 200, the `phase1late-*` capture lands in early Phase-2 instead of late Phase-1 — still informative (a "Phase-2 settled" capture, distinct from the lock-in moment), just labelled `phase1late-*` regardless of regime. The §R1.5.3 diff procedure is robust to this case: `phase1late↔firstfail` of two Phase-2 captures is a *Phase-2-evolution* diff, useful for distinguishing class A "ongoing leak" from class B "frozen state."

### Env knobs

- `R15_PROBE_PHASE1_LATE_MIN` (default 200; minimum 1; identical clamp shape to existing knobs).

The other env knobs at §R1.5.2 are unchanged. Defaults are pinned by `tests/audit8r15LongProbe.test.js` "matches the gate doc defaults" — the assertion gains `expect(DEFAULT_CONFIG.phase1LateMinute).toBe(200)`.

### Test contract additions

`tests/audit8r15LongProbe.test.js` gains a new describe block for `shouldCapturePhase1Late` (5 cases — fires-at-200, refuses-before, refuses-after, single-shot, non-integer-rejection). Mirrors `shouldCaptureControl`'s shape per §R1.5.2.

The §R1.5.1.1 replay-pin (`tests/fixtures/r15-2026-05-24-timeline-slim.jsonl`) is unchanged. The fixture does not yet pin the new artifact-file emission contract; the implementation PR (#276) verifies it at run-time only.

### Scope of this addendum

This §R1.5.2-REV1 + §R1.5.2-REV2 are the **doc-side counterpart to PR #276** (atomic gate-doc-vs-code contract). PR #276 shipped the implementation; this REV pair binds the spec forward.

The §R1.5.3 mechanism diff procedure is **augmented** (more discriminators available) but not redefined. Class selection still proceeds by "which class's capture signal is present in the diff", with the four new files providing structured signals for classes B and C that the original set under-covered.

R1.6 fix gate (named-mechanism → fix scope) is unaffected. R1.5 still ships no fix. Trinity untouched.

---

## §R1.5.2-REV3 — Mutation-channel HALT (appended 2026-05-24 evening, post REV1/REV2 smoke)

The 2026-05-24 evening smoke pair for the PR #276 RE-RUN — fired BEFORE the overnight long-probe — proved one of the four new mechanism channels (`mutation`) is structurally dead in the as-merged probe. **The overnight RE-RUN is suspended.** The other three channels (`cache-keys`, `controller`, `extract-probe`) verified non-null with real signal.

This REV is the gate-doc surface of the finding. No code change is proposed here (R1.x discipline: gate edits ship before code edits, in their own PR). Class-discrimination authority in §R1.5.3 is reduced from 4-dimensional to 3-dimensional **until this REV is closed by a follow-up code PR** that either (a) proves the mutation channel produces non-null leaves at default `phase1ControlMinute=30`, or (b) repairs `installMutationCounter` so the snapshot reads the installed globals.

### Smoke evidence (both runs against live `https://eiasash.github.io/Geriatrics/`, v10.64.130)

Both runs used `R15_PROBE_HEADLESS=0 R15_PROBE_MIN_HOURS=0.1 R15_PROBE_MAX_HOURS=0.15` against current `main` (`3a55f16`, contains PR #274 debounce + PR #276 captures + PR #275 audit-9 gate). Outcome `RED-NOT-REPRODUCED` in both — expected for a 9-min window; the smoke is plumbing-validation, not Phase-2 reproduction.

Smoke A — `R15_PROBE_PHASE1_CONTROL_MIN=2`, label `smoke-postr276`, started 2026-05-24T21:55:19Z, `cumulativeOk=119`, `cumulativePrePickSkip=0`, `controlCaptured=true`. `phase1control-mutation.json` content: `{ "count": null, "installedAt": null }`.

Smoke B — `R15_PROBE_PHASE1_CONTROL_MIN=5`, label `smoke-postr276-min5`, started 2026-05-24T22:07:05Z, `cumulativeOk=118`, `cumulativePrePickSkip=1`, `controlCaptured=true`. `phase1control-mutation.json` content: `{ "count": null, "installedAt": null }`. **Identical null shape at min 5 — not a min-2 startup race.**

Smoke B `timeline.jsonl` shows `mutationCount: { "count": null, "installedAt": null }` at **every minute** from `minuteIndex=0` onward, including the very first per-minute snapshot at 2026-05-24T22:07:11Z (~5 s after `page.goto` returned). The install therefore either never ran successfully OR ran in a JS context whose `window` is not the one `snapshotMutationCount(page)` reads.

For reference, the three channels that DID land non-null in Smoke B:
- `phase1control-cache-keys.json`: `{ "shlav-a-v10.64.130": { "entryCount": 38 }, "shlav-img-v1": { "entryCount": 0 } }` — real cache topology, two named caches with sane sizes.
- `phase1control-controller.json`: `{ "scriptURL": "https://eiasash.github.io/Geriatrics/sw.js", "state": "activated" }` — SW activated as expected.
- `phase1control-extract-probe.json`: 5 attempts, all `ok=true`, all with identical `stemHash="2117983509"` + `optionsCount=4` (stable read on the same Q within ~900 ms). Confirms PR #276 stem-extract probe is sound.

Both artifact bundles remain on the runner disk under (gitignored) `chaos-reports/v4-long/audit8r15_2026-05-24T21-55-19-658Z/` and `chaos-reports/v4-long/audit8r15_2026-05-24T22-07-05-870Z/`. Re-grounding from clone alone is therefore not possible — this REV inlines the load-bearing contents above per `feedback_audit_logs_cross_claude_visibility`.

### Suspected failure modes (NOT picked — for R1.6 to investigate)

`scripts/audit8/r15LongProbe.mjs:196-211` `installMutationCounter` runs once via `await page.evaluate(() => { ... }).catch(() => {})` immediately after the initial `page.goto(..., waitUntil: 'domcontentloaded')` (lines 482-490). The `.catch(() => {})` swallows any failure silently — the install can fail invisibly. `snapshotMutationCount` (lines 142-149) reads `window.__r15MutationCount` / `window.__r15MutationCounterInstalledAt` and returns `null` for either when the global is `undefined`.

Three candidate root causes, none ruled in by this REV:

1. **Install context dies on first SPA hydration/navigation.** The page is a SPA with a SW that activates and may swap or reload context. `domcontentloaded` fires before any of that settles. If hydration replaces document.documentElement or the SW reloads the page, the MutationObserver attaches to a soon-to-be-stale root AND/OR the `window.__r15MutationCount` global lives on a doomed `window`. The fact that `installedAt` is also null is the strong tell — it rules out "install ran, observer fires, but counter never increments"; if the install line had executed, `installedAt` would be a number forever (it's a `Date.now()` literal, never overwritten).
2. **`page.evaluate` execution-context mismatch.** Playwright `page.evaluate` runs in the main world by default; both install and snapshot use the same API, so both should see the same `window`. Possible exception: if the page is iframed or wrapped at an early point and the auto-discovered main frame shifts after install. Smoke B shows null from `minuteIndex=0` (~5 s in) so the shift, if any, would have to happen sub-5-s.
3. **`MutationObserver` install threw inside the `try`.** The `try { … } catch (_) { /* tolerate */ }` swallows constructor errors. Possible in older or sandboxed Chromiums; the runner here is Playwright chromium-1217 on Windows, so this is the least likely of the three.

The discriminator: surface the swallowed errors and the install-time `document.documentElement` identity. Both are one-line additions to `installMutationCounter` — but **those are code changes, out-of-scope for this REV**. R1.6 will pick them up.

### What the §R1.5.3 mechanism diff procedure can do without the mutation channel

Of the four §R1.5.2-REV1 capture channels:

- ✅ **`cache-keys`** discriminates Class C (cache topology drift — new cache name, lost entries, eviction patterns).
- ✅ **`controller`** discriminates Class C (SW controller replacement, scriptURL drift, state changes).
- ✅ **`extract-probe`** discriminates Class A (per-attempt extract reliability — stem identity, options count, attempt-level race between extract and DOM rebuild).
- ❌ **`mutation`** — would have discriminated Class B (frozen DOM during Phase-2 vs ongoing mutation during Phase-1 — the lock-in signature). The dead channel **does not block** §R1.5.3 from reaching a verdict on Classes A and C, but it removes the cleanest direct signal for Class B. Class B can still be inferred indirectly from `domNodeCount` deltas in `timeline.jsonl` (already collected per-minute) plus per-attempt `extractProbe` patterns at firstfail vs phase1control, but the inference is weaker.

§R1.5.4 RESULT, when it eventually lands, must explicitly note Class-B determination is **inferred from auxiliary signals**, not directly observed, unless this REV is first closed by a fix.

### Bound forward (replaces "fire overnight" expectation from the morning brief)

1. **Overnight R1.5 RE-RUN is suspended.** `R15_PROBE_LABEL=overnight-postr276-20260524` was NOT fired. The morning brief's §R1.5.4 RESULT-append step is deferred until a re-fired overnight produces a non-degenerate capture set.
2. **R1.6 follow-up PR (separate, gated on Eias sign-off)** will either:
   - (a) Add ephemeral instrumentation: surface the swallowed errors from `installMutationCounter`'s `.catch`, log `document.documentElement.tagName` + identity at install time AND at first snapshot, and re-run a smoke. If null persists with errors surfaced → triage by error. If null persists with no errors → execution-context mismatch is likeliest, escalate.
   - (b) Or: harden `installMutationCounter` to re-install on every snapshot if the global is missing (idempotent guard already exists for the success case; extend it to recover from a wiped install). This is the cheaper fix but obscures the root cause.
3. **§R1.5.4 RESULT remains §R1.5.4 RESULT.** This REV does NOT pre-empt or rewrite it. It binds the precondition: §R1.5.4 cannot ship until either (1) the mutation channel produces signal at default `phase1ControlMinute=30` (overnight defaults — not the smoke override), or (2) §R1.5.4 documents the 3-of-4 limitation explicitly with a class-B-by-inference caveat.

### Scope of this addendum

This REV is the gate-doc precondition for a follow-up code PR. Per R1.x discipline, no code change ships in this PR — only the spec binding. Eias sign-off required to merge per workspace CLAUDE.md "(b) per-PR gate docs that explicitly carry a 'NO self-merge' clause" — this REV inherits the clause from §R1.5. **NO self-merge.** Trinity untouched. R1.5 still ships no fix; R1.6 fix gate unaffected; named-mechanism → fix scope authority unchanged.

---

## §R1.5.4 R1.5 RESULT — bifurcation RED-REPRODUCED; cadence confirmed; mechanism partially adjudicated (Class A refuted, Class C leading-by-inference) (2026-06-06)

Append-only. Takes **REV3 option (2)**: ships documenting the 3-of-4 channel
limitation explicitly (the mutation channel was dead in the eligible run), plus
a second limitation this run surfaced (the forensic first-failure bundle
captured a Phase-1 blip, not the sustained lock-in). The cadence result — which
satisfies AUDIT-9's §HYPOTHESES-1 overturn-check (the cadence sub-prerequisite,
**not** §A6, which is the separate R2-re-freeze sequencing gate) — is the primary
deliverable here; full mechanism class-naming is **provisional**, deferred to a
fresh 4/4-channel re-run. **This RESULT does not close R1.5's mechanism naming
and does not unblock R1.6/R2** (see Conclusion).

**This RESULT carries the §R1.5 NO-self-merge clause.** It is merged under an
explicit captain-mode merge-authority grant from the gate author (Eias,
2026-06-06 "run audit 9 … you have merge authority"), with Codex cross-model
review + a fresh-eye filesystem-grounded pass substituting for the human-merge
gate (independence preserved; see workspace CLAUDE.md "independence comes from
cross-model review, not human-vs-AI gates").

### Captured run

- **Run:** `R15_PROBE_LABEL=win-overnight-cc-20260524`, headless, `minHours=6`,
  `phase1ControlMinute=30` (the **default** — not a smoke override), against
  live `https://eiasash.github.io/Geriatrics/` (then v10.64.130).
- **Window:** started `2026-05-23T23:20:37Z`, finished `2026-05-24T05:20:42Z`
  (`durationMs=21605480`, ≈ 6 h 00 m, 361 per-minute snapshots).
- **Outcome: `RED-REPRODUCED`.** `cumulativeOk=3794`, `cumulativePrePickSkip=1102`.
  `redCrossingAt.atMinuteIndex=296`, `skipWindow=[287,297]`.
- **Artifacts.** Full forensic bundle (gitignored — `chaos-reports/` in
  `.gitignore`): `chaos-reports/v4-long/audit8r15_20260524T022036Z/` on the
  `Geriatrics-wt-r15probe` worktree (`summary.json`, `timeline.jsonl`,
  `phase1control-*`, `firstfail-*`, two `*-trace.zip`). Per
  `feedback_audit_logs_cross_claude_visibility`, the load-bearing per-minute
  series is committed in clone-visible form at
  **`docs/audit8_r15_overnight_20260524_timeline_slim.jsonl`** (361 rows:
  `m, dOk, dSkip, cumOk, ext, dom, heapMB`); all numbers below are re-derivable
  from it.

### Cadence (primary deliverable — AUDIT-9 §A6 / §HYPOTHESES-1 prerequisite)

The captured timeline shows the **sharp Phase-1 → Phase-2 bifurcation** §0.2
predicts, not a gradual/oscillating shape:

| Phase | minutes | ok/min | pre-pick-skip/min | extract outcome |
|---|---|---|---|---|
| Phase 1 | 0–287 (288 min) | **13.17** | 0.05 | `ok` |
| Transition | min 287 → 288 | — | — | last `ok` min 287; sustained `0 ok` from min 288 |
| Phase 2 | 288–360 (73 min) | **0.00** | **14.92** | **100 % `no-quiz`** (73/73) |

- **Transition width = 1 minute** (min 287 last `ok`; min 288 onward sustained
  zero `ok`). **< 5 min** ⇒ the AUDIT-9 §"PRE-REGISTERED PREDICTIONS"
  refutation ("Phase-2 onset width > 5 min") is **NOT triggered**. AUDIT-9's
  5-min bucket width and K=2 criterion remain valid.
- Per-minute deltas at the transition (from the slim timeline): `min286 dOk=14`,
  `min287 dOk=7/dSkip=6` (the single mixed minute), `min288 dOk=0/dSkip=15`,
  and flat `0/15` thereafter to min 360. Phase-2 `dropCtx` = 100 % `no-quiz`,
  matching §0.2's "100 % `pre-pick-no-question`."
- **AUDIT-9 5-min run-start-aligned bucket preview** (sanity, not a verdict):
  73 buckets; anchor `B[57]` (ok=34) → `B[58]`=0, `B[59]`=0 ⇒ K=2 fires at
  **onset bucket b=58** (min 290–295), a **single** onset. The criterion the
  AUDIT-9 implementation will encode reproduces on real captured data.
- Onset at min 287 (≈ 80 % of a 6 h run) vs audit-8's min 194/480 (≈ 40 %):
  both **duration-gated, intermittent** (≥ 3.2 h prior). Later-onset-this-run
  is within the "intermittent" prior, not a refutation (the named refutation is
  *earlier* onset < 20 %).

**Conclusion (cadence):** the §0.2 sharp-transition shape is **confirmed across
this independent R1.5 run**. AUDIT-9 §HYPOTHESES-1's overturn condition is **not
met** → this satisfies the **cadence sub-prerequisite only** of AUDIT-9. It does
**NOT** make AUDIT-9 ready and does **NOT** unblock R1.6 or R2: AUDIT-9 §A6
sequences behind **R2**, which the R1.5 SCOPE (line 127) gates behind **R1.6**
(the fix gate this RESULT routes to). The chain **R1.6 → R2 → AUDIT-9** is
untouched here. This is an **interim cadence-capture**, not the mechanism-naming
close of R1.5.

### Mechanism (secondary; provisional — two stacked limitations)

Pre-registered **lean was Class A** (browser process leak). The data **refutes
it**, per the gate's own pre-registered refutations (`feedback_prewritten_predictions`
— recorded, not rewritten):

- **Class A — REFUTED** (refutation §117: heap delta within 2× of Phase-1
  baseline). Phase-1 baseline `min30 = 37.3 MB`; deep Phase-2 `min360 = 44.7 MB`
  ⇒ **ratio 1.20×**, well within 2×. Heap *drops* across the transition
  (`min287 50.4 MB → min288 44.7 MB`) — the opposite of a monotonic
  accumulation / OOM signature.
- **Class B — not supported** (refutation §119 not triggered): `domNodeCount` is
  flat across the transition (`~253`, within 10 % of Phase-1's 223–265). No
  DOM-growth / listener-accumulation signature in the scalar series.
- **Class C — leading by inference** (prediction §118: stable DOM + A refuted →
  C). 100 % `no-quiz` extract with a **persistent ~253-node shell** is
  consistent with the practice surface failing to deliver new question content
  while the page shell survives — a connection / content-delivery (Class C)
  pattern. This is an **inference from scalar timeline signals**, NOT a direct
  capture-diff.

**Limitation 1 (REV3 — 3-of-4 channels).** The mutation channel (the direct
Class-B discriminator) was the older forensic-capture style in this run, not the
4-channel `cache-keys`/`controller`/`extract-probe`/`mutation` set. Class-B is
therefore excluded **by auxiliary inference (flat DOM/heap)**, not by the direct
mutation signal §R1.5.3 designed for it.

**Limitation 2 (forensic capture targeted a blip, not the lock-in).** The
`firstfail-*` forensic bundle fired at **min 49** — a single-minute Phase-1 blip
(both `phase1control` (min 30) and `firstfail` (min 49) `dom.html` contain 8
`button.qo` and ≈ 749–753 KB: the quiz was fully present at min 49). The **real**
sustained lock-in (min 287+) was **not** forensically captured (debounce #273/#274
exists precisely to stop blip-miscapture; this overnight run's `firstFailCaptured`
still latched the min-49 transient). The min-287 lock-in is therefore witnessed
**only by the scalar timeline**, not by a DOM/console/network forensic snapshot.

**Net mechanism verdict:** **Class A refuted; Class C leading; Class B/D not
positively supported — class-naming PROVISIONAL.** A clean class selection
requires a fresh run that (a) uses the post-#280 4/4-channel `installMutationCounter`
(landed `cabc62e`), and (b) debounce-captures the forensic bundle at the
**sustained** lock-in, not a Phase-1 blip. That re-run is R1.5-continuation /
R1.6 territory. (AUDIT-9 itself is mechanism-agnostic and consumes only the
confirmed cadence — but AUDIT-9 remains blocked by R1.6 + R2 regardless of the
mechanism class; the provisional naming is not what gates it.)

### R1.6 fix-gate scope sketch (one paragraph, not a fix-spec)

Consistent with prediction §120 (fix is bot-side, not `shlav-a-mega.html`): if
the fresh 4/4 run confirms Class C, R1.6's fix is a **bot-side resilience patch**
— a consecutive-`no-quiz` (null-stemHash) skip counter + `page.reload()` in
`runWorker`, the exact patch the R1 RESULT enumerated as Option B and the gate
deliberately did **not** fold into R1's close. (The bot's structural inability to
recover from Phase-2, R1 RESULT "the bot bug," is the same gap.) Whether that
patch is scored as R1.6's GREEN or rolled into R3's run-config is R1.6's call;
this RESULT only routes to it. No `shlav-a-mega.html` change is implicated by the
current evidence (the page shell and answer-key DOM are intact throughout).

### Provenance

Append-only under the gate's `<!-- R1.5 RESULT … -->` marker region; REV1/REV2/
REV3 above are **not edited**. Trinity untouched. No fix shipped. The pre-registered
Class-A lean is preserved verbatim above and recorded here as refuted — not
retro-softened.
