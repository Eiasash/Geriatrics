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
