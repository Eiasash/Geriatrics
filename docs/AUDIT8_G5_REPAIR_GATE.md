# Audit-8 — G5 REPAIR pre-registered gate (extraction-yield + `t`-join) — NO-RUN, ZERO-DOLLAR

Written **before** any repair code, any RED probe, any fresh run. Append-only;
do not retro-edit (`feedback_spec_provenance_append_only`). Lane: terminal,
solo (`claude/term-audit8-g5-gate`, cut from `origin/main` `4a66ed8`).
Trinity: **untouched** — docs-only this session, no bump (mirrors audit-5/6/7
+ #233/#235/#236/#238: a pre-registration that ships no product code does
not bump the version trinity).

**Parent / trigger.** AUDIT-8 RESULT (#238, `4a66ed8`, on
`docs/AUDIT8_PRE_REGISTERED_GATE.md`) returned the mechanical verdict
`STOP-JOIN-INTEGRITY`. The on-main gate's G5 route for that outcome is:
*"repair the join/instrument … as its own separately-gated session, then a
fresh bounded run."* **This document is that session's pre-registration.**
It authors the repair gate **only**. It does **not** run the RED probe, the
fix, or the paid bounded run — those are the R-phase sessions, gated behind
this doc landing on `main`.

## Why a new doc is NOT a "single-doc" violation (pre-empting the fresh-eye flag)

The AUDIT-8 gate warns "Single doc — no second gate doc." That warning is
scoped to **not authoring a second AUDIT-8 *representativeness* gate** (a
rival G1–G5). It does not forbid the **separately-gated repair session** the
same gate's G5 *mandates* ("each its own session/gate"). This is that
mandated session; it is a distinct workstream (repair, not
re-adjudication), with its own pre/post predicates. The AUDIT-8
representativeness gate is **closed and untouched**; nothing here re-opens,
re-derives, or re-routes it.

---

## READ THIS FIRST — what this gate does and does NOT authorize

- It pre-registers the **repair method, the locked phase order, and each
  phase's pre/post predicates** — no-run, deterministic, from the
  disk-verified RESULT + static source.
- It explicitly separates **disk-verified RESULT facts** (analyzer output on
  the real 8 h ledger — ground truth) from **hypotheses the repair session
  MUST prove against disk** (the D1–D4 no-run-overclaim lesson, applied to
  this author proactively).
- It does **NOT** authorize the fresh bounded run (R3). The **$20 cap is
  NOT widened**; G1/G2 config is inherited UNCHANGED. R3 is a separate
  explicit go, mirroring the AUDIT-8 gate → bounded-run separation.

---

## STEP 0 — distrust contract (no-run; results)

- **0.1 State (verified).** `origin/main` HEAD `4a66ed8` (#238 RESULT
  squash-merged; AUDIT-8 closed). No prior `claude/term-*` G5/repair branch;
  no `docs/AUDIT8_G5*`/`*REPAIR*` doc (armed scan, real negative — evidence,
  not silence). Only non-`main` origin branch is the stale unrelated
  `claude/web-rm-stale-supabase-migrations` (#234). Solo terminal lane;
  branch + PR; **no self-merge** (audit-evidence path). ✅

- **0.2 Disk-verified RESULT facts (ground truth — the frozen analyzer ran
  once on the real 8 h ledger; cite as RESULT-derived, NOT no-run claims).**
  - Run: full 8 h clean, $7.91, 1731 calls, 0 failures (G1 $20 cap not
    reached).
  - **Defect A — extraction-yield.** Universe: 3800 `pre-pick-skip`
    (G4.1-excluded DOM/extract failures) vs **509** reaching the pick step
    (30 `ai-parse-error/pick` DROPPED + 479 RETAINED judged). Extraction
    reached-pick fraction ≈ 509 / (509+3800) ≈ **11.8 %**.
  - **Defect B — D3 `t`-join.** Covariate `t` determinate-join
    **474/509 = 0.93124 < 0.99** invariant. `joinFailDrop=0`,
    `joinFailRetain=0` ⇒ the 35-cell shortfall is `t`-discordant
    byte-identical-stem dup-group cells (dup-discordance), **not** unjoined
    rows. All other covariates ≥ 0.996.
  - Mechanical verdict `STOP-JOIN-INTEGRITY` (analyzer `:269`); G2
    under-powered independently (`N_drop=30 < 80`).

- **0.3 The unverified HYPOTHESIS (must be proved by R1's RED probe, not
  assumed).** The extraction failure is *live-DOM / practice-surface drift*
  in the Geri monolith (selectors / practice-mode entry / modal
  interception — cf. CLAUDE.md "Known Traps": `showHelp` overlay, async
  `render()` defer), **not** a dataset fact, **not** a pure bot-extractor
  bug. This gate pre-registers that R1 **tests** this; it does **not**
  assume the fix is "DOM drift" (`feedback_distrust_brief_frame_not_just_facts`:
  the costly error rides in the unstated premise about what the fix IS).

- **0.4 Frozen-analyzer state (verified, static source @ `4a66ed8`).**
  `scripts/analyze_pick_representativeness.mjs` is frozen as of #236
  (`edfa433`): `JOIN_DETERMINATE_MIN = 0.99` at **`:38`**; verdict branches
  `STOP-JOIN-INTEGRITY` `:269`, `BIASED` `:271`, `REPRESENTATIVE` `:275`.
  `git log -- scripts/analyze_pick_representativeness.mjs` = only `edfa433`.
  **Pre-registered (load-bearing):** R2 changes join logic ⇒ the analyzer is
  **no longer frozen**. Any analyzer change is pre-registered in R2 below
  with its own pre/post predicate; the change re-freezes the analyzer at the
  R2 commit.

---

## HYPOTHESES the repair session MUST verify against disk (do NOT treat as fact)

Proactive D1–D4 defense — the fresh-eye filesystem-grounded reviewer should
check each of these is still flagged hypothesis, not silently promoted:

1. Extraction failure = live-DOM/practice-surface drift (0.3). **Test:** R1
   RED probe; the static-fixture control (predictions §) can refute it.
2. "Something regressed between audit-7 (4 h) and audit-8 (8 h)" — inferred
   from the G2 `~110–130` projection vs the run's `30` (~4× under). The
   `110–130` is the **AUDIT-8 gate's own no-run projection** (gate L178),
   itself never empirically confirmed; treat the 4× as a **bisect signal**,
   not a measured regression magnitude.
3. The 35 `t`-discordant cells are recoverable to a determinate `t` via a
   `t`-aware join. **Unverified** — the repair session must read the real
   `data/questions.json` 157 byte-identical-stem dup-groups and establish
   whether the DOM-served `t` is recoverable at all, or whether the honest
   fix is to re-derive the determinate denominator (not "recover" it).
4. Restoring extraction yield suffices to clear G2 `N_drop ≥ 80`. Modelled,
   not measured — see R1 GREEN criterion (outcome-locked, rate-not-locked).

---

## THE LOCKED REPAIR (binding; the order does not get reshaped)

Order is **R1 → R2 → R3**, locked. Rationale (surfaced, Working Rule 1):
`N_drop` is *downstream* of extraction yield — a `t`-join fix first would
merely move the STOP from join-integrity to under-power, burning a fresh
8 h/$ run to learn nothing new. Extraction is the critical path.

### R1 — Extraction-yield: RED probe FIRST, root-cause SECOND, fix THIRD

- **R1.0 RED probe (before any fix).** Build a probe that **deterministically
  reproduces** the extraction failure — `extractQuestion` → `null` / `<2`
  options at a rate consistent with the run's ≈ 88 % (3800 / 4309). It must
  **enact the real failure mode** (the actual extractor against the actual
  practice surface / a captured live-DOM fixture), **not a proxy**
  (`feedback_guard_tdd_against_real_failure_mode`). Pre/post:
  **RED** = reproduces pre-fix; **GREEN** = post-fix failure resolved to the
  R1.2 criterion. No fix is written until the probe is RED.
- **R1.1 Root-cause before fix.** Identify the mechanism: probe + `git
  bisect` of `shlav-a-mega.html` across the audit-7→audit-8 window (bisect
  signal: hypothesis 2). The root cause must be **identified and named**,
  not guessed, before R1.2.
- **R1.2 Fix + GREEN criterion (outcome-locked NOW; input-rates measured by
  the probe, NOT fabricated here).** The LOCKED pass criterion is an
  **outcome**: a post-fix short measured probe must **project** the locked
  8 h / $20 config to **`N_drop ≥ 80` ∧ `N_retain ≥ 200`** (G2), using the
  pre-registered projection method *projected-drops = (measured reached-pick
  rate over an 8 h budget) × (drop-fraction-among-reached)*, where **both
  input rates are measured empirically by the probe**. The reached-pick and
  drop fractions are **deliberately NOT locked to a number here** — fixing
  an extraction-rate target from the unverified 11.8 %/5.9 % model would be
  exactly the no-run quantitative overclaim D1–D4 caught. Lock the gate
  (projected `N_drop ≥ 80`), not the rate. Post-gate: full `npm run verify`
  green; trinity untouched (bot/scripts fix = no bump, mirrors #235); the
  GUARD `tests/chaosBotV4PickDropInvariant.test.js` stays green (the
  `disagrees` gate/compute is NOT touched); a new test pins the extractor
  fix against the reproduced failure.

### R2 — `t`-aware dup-group join (ONLY after R1 lands test-pinned on `main`)

- **R2.0 This UN-FREEZES the analyzer — pre-registered here (the load-bearing
  item).** Candidate change: a `t`-aware dup-group join in
  `scripts/analyze_pick_representativeness.mjs`'s per-covariate
  determinate-join path (the logic feeding `joinViolations`, `:195`).
  Pre-registered constraints:
  - `JOIN_DETERMINATE_MIN` (`:38`) **stays `0.99`**. It is **NOT** relaxed
    to make the verdict pass. Relaxing the invariant to clear the STOP would
    be criterion-swap-by-silence — **named aloud and forbidden**
    (`feedback_pre_commit_diagnostic_gates`).
  - The verdict-branch logic (`:269`+) is **not** loosened. STOP-JOIN-INTEGRITY
    remains the routed outcome unless the join is *genuinely* determinate
    ≥ 0.99 for `t` after the refinement.
  - Pre/post predicate: the existing synthetic
    `tests/audit8AnalyzeRepresentativeness.test.js` STOP-JOIN-INTEGRITY
    fixture **either still passes OR is consciously, pre-registeredly
    updated with the rationale documented in the R2 PR** (never silently
    changed) **plus** a NEW synthetic fixture pinning the `t`-aware behavior
    on dup-discordant `t` cells. RED-proof the new test against the old
    join logic.
  - The R2 commit **re-freezes** the analyzer; `git log --
    analyze_pick_representativeness.mjs` must read exactly `edfa433` + the
    single R2 commit.
- **R2.0-REV1 — branch-symmetry amendment (pre-merge review, 2026-05-19).**
  Web fresh-eye **Finding 1** + terminal-lane **independent disk
  re-verification**. *Original R2.0 (above) preserved verbatim — not
  retro-edited (`feedback_spec_provenance_append_only`); this is a pre-merge
  revision that supersedes only R2.0's predicate ORDER and single-candidate
  framing, kept in-doc so the squash-merge cannot erase the pre-revision
  text.* Re-verified on disk this session (`data/questions.json` @
  `1a393f4`, 3743 Qs): **all 157 byte-identical-stem dup-groups are
  `t`-discordant (157/157, 0 concordant)**; `t` values are exam
  *provenances* (`2022-Jun-Basic` vs `2022-Jun-Subspec`, `Hazzard-suppl`
  vs `2025-Jun-Basic`) — each correct for its instance. The gate join is
  keyed on the full-stem hash (`AUDIT8_PRE_REGISTERED_GATE.md` L423-424);
  byte-identical stems collide on that key, so `t`-provenance is
  information-theoretically absent from it. R2.0's `t`-aware join therefore
  **cannot, while stem-hash-keyed, honestly recover `t`**, and the disk
  evidence makes the honest outcome the *likely* one. To forbid a
  documented lean toward the branch that makes 474/509 rise
  (criterion-swap-by-frame), R2 is pre-registered **branch-symmetric**:
  - **(a) FIRST ordered predicate — recoverability determination (gates
    everything else; evaluated BEFORE any analyzer edit).** From
    `data/questions.json`, establish whether a DOM-served dup-group
    question's `t` is recoverable from what the instrument actually
    records. If `t` is recoverable only via the served question's corpus
    *index* and the instrument does not capture that index, **branch B1 is
    CLOSED** — no join refinement can honestly raise the `t`
    determinate-rate.
  - **(b) Two equal-weight branches — neither is the default; R2's disk
    result selects.** **B1** = the original R2.0 `t`-aware join, eligible
    **only if (a) proves `t` recoverable** from instrument-captured data.
    **B2** = determinate-denominator re-derivation (promoted from
    Hypotheses #3 footnote to a co-equal pre-registered branch): exclude
    dup-discordant cells from the determinate denominator *by definition*
    rather than "recover" them. **All original R2.0 constraints
    (`JOIN_DETERMINATE_MIN` stays `0.99`, verdict logic not loosened,
    RED-proofed new fixture, re-freeze) apply to whichever branch is
    taken — never to weaken the gate.**
  - **(c) Finding 2 — real-data validation surface follows the branch.**
    B2 (analyzer-side re-derivation) → the preserved audit-8 8 h ledger is
    re-analyzable under the modified analyzer = free real-data proof
    **before** R3's $20. B1 (instrument-side index recording) → the old
    ledger lacks the index ⇒ R3 is the only real-data check. R3's
    "STEP-0.2-equivalent re-pass" precondition **must name which surface
    applies once R2 selects the branch**, since it decides whether the
    $20 buys the first or the second validation.
  - **(d) B2-honesty pin — REV1.1 (web re-glance Finding 3, 2026-05-19).**
    B2's "exclude dup-discordant cells from the determinate denominator" is
    *itself* the upstream redefinition Finding 1 named: read literally it
    shrinks `t.attempted` 509→474, so `t` = 474/474 = 1.0 ≥ 0.99,
    `joinViolations` (`:195`) drops `t`, STOP-JOIN-INTEGRITY (`:269`) no
    longer routes — **`:38`=`0.99` and the verdict logic both literally
    untouched**. That is criterion-swap-by-silence via denominator-shrink,
    in the *likely* branch (since (a) probably closes B1). B2 is honest
    **only if**: (i) the excluded dup-discordant cell count is reported
    beside the `t` rate; (ii) the `t` covariate result is explicitly scoped
    to the determinable subset, with the non-determinable fraction
    surfaced; (iii) a denominator redefinition may **not, by itself,
    convert STOP-JOIN-INTEGRITY into a pass** — a materially large
    structurally-non-determinable `t` fraction is itself a reportable
    limitation, **not** a cleared gate (B2's analogue of B1's CLOSED).
  > EDIT 2026-05-19 (REV1.1): clause (c)'s "the preserved audit-8 8 h
  > ledger" / "the old ledger" — original text retained verbatim;
  > correction: read as "the audit-8 8 h ledger *if still on disk*".
  > Ledger preservation is asserted by the #238 RESULT, NOT verified this
  > session; (c)'s free-real-data-proof for B2 is contingent on the ledger
  > being present at R2 time.
- **R2.0-REV2 — Cross-pointer to AUDIT-9 §A6 re-freeze chain (post-merge review, 2026-05-24).**
  Web fresh-eye review of AUDIT-9 noted that R2.0's "single R2 commit" pin
  (above) reads as absolute when read in isolation. AUDIT-9 §A6
  (`docs/AUDIT9_PRE_REGISTERED_GATE.md` §A6 sequencing block) redefines the
  rule as "scoped to R2's own session," with AUDIT-9's implementation
  commit then re-re-freezing to `edfa433 + R2 + AUDIT-9`. Both docs are
  honest about this; this cross-pointer closes the dual-doc state for a
  reviewer who only opens this gate. *Original R2.0 and R2.0-REV1 above
  preserved verbatim — not retro-edited
  (`feedback_spec_provenance_append_only`).*

  Effective re-freeze chain (post-AUDIT-9 implementation):

  ```
  git log --oneline -- scripts/analyze_pick_representativeness.mjs
    → edfa433  (R1: frozen analyzer, #236)
    → <R2 commit>  (R2: t-aware join / branch B1 closed, per R2.0 + R2.0-REV1)
    → <AUDIT-9 impl commit>  (temporal-bin instrumentation, per AUDIT9 §A6)
  ```

  Any subsequent change to `scripts/analyze_pick_representativeness.mjs`
  requires its own pre-registered gate (sibling to AUDIT-9 §A6's pattern).
  Cumulative-only; no rewrites.
- **R2.1 `normStem`/index strengthening — scoped to the proven mechanism
  only.** The join also has the documented bilingual/bidi exposure (#236
  step-4 caveat). Strengthen `normStem`/the index **only** if R2.0's
  disk-read of the 157 dup-groups proves it is the mechanism; no speculative
  hardening (`feedback_verify_mechanism_claims_not_assert`).

### R3 — Fresh bounded run (SEPARATE explicit go — NOT this gate, NOT R1/R2)

Gated behind R1 **and** R2 landed test-pinned on `main` **and** a
STEP-0.2-equivalent re-pass on the (now re-frozen) instrument+analyzer.
Config = AUDIT-8 **G1/G2 inherited UNCHANGED**: `CHAOS_COST_CAP_USD=20`
(**NOT widened**), 8 h, 1 worker, `claude-sonnet-4-6`, proxy,
`CHAOS_REPORT_RATE=0.0`, fresh isolated `chaos-reports/v4-long/audit8g5_<ts>/`.
Then run the re-frozen analyzer; the verdict is its **mechanical output**
(the histogram does not reshape it). RESULT appended append-only to *this*
doc by the R3 session.

---

## PRE-REGISTERED PREDICTIONS + OVERTURN CONDITIONS (`feedback_prewritten_predictions`)

Locked before R1 data is seen:

- **Prediction:** R1's RED probe reproduces the ≈ 88 % extraction failure
  against the live practice surface; root cause is a monolith-side
  DOM/practice-entry change in the audit-7→audit-8 window.
- **Refutation control (pre-registered):** run the SAME extractor against a
  **static captured-DOM fixture** from a pre-regression commit. If it
  **also** fails at ≈ 88 %, the live-DOM-drift hypothesis (0.3 / H1) is
  **REFUTED** → the defect is a bot-extractor regression, not DOM drift →
  R1.2's fix target shifts to the extractor, and the bisect is of the
  bot/`scripts/lib`, not `shlav-a-mega.html`. This branch is pre-registered
  so taking it is not post-hoc.
- **Prediction:** even at restored yield, `t`-dup-discordance persists
  (it is a dataset-structure fact, not a yield artifact) → R2 is still
  required after R1. If a restored-yield probe shows `t` determinate ≥ 0.99
  **without** R2, R2 is reduced to a confirmatory no-op (pre-registered,
  unlikely).

---

## SCOPE

Repair of the pick channel's extraction yield + the `t`-join determinacy
**only**. Ships **no representativeness verdict**. Flips **no `q.c`**.
Changes **no `broken`**. Touches **no Toranot file**. Horizon **item 2**
(Geri judge `max_tokens`) stays **BLOCKED** until R3 routes a verdict. The
audit-7 truncation route is out of reach and not re-litigated. The AUDIT-8
representativeness gate is closed and untouched.

## OUT OF SCOPE (handed off untouched)

- The paid bounded run (R3) — separate explicit go; **$20 cap NOT widened**.
- Any analyzer change beyond R2's pre-registered `t`-aware join + scoped
  `normStem`.
- Relaxing `JOIN_DETERMINATE_MIN` or any verdict threshold (forbidden).
- B4 content adjudication; `q.c`/`broken`/distractor work.

## SHIP

Tracked, **docs-only**, append-only audit-5/6/7-style: **this gate doc**
(committed this session) + per-phase RESULT/closure sections appended
append-only by the R1 / R2 / R3 sessions. **No trinity bump.** Branch
`claude/term-audit8-g5-gate` → PR to `main`. **Do NOT self-merge**:
`docs/AUDIT*` is an audit-evidence path → **web-lane fresh-eye
filesystem-grounded review** (clone, read the **real** `data/questions.json`
+ the 157 byte-identical-stem dup-groups + the frozen analyzer source;
verify every corpus claim and the §"Hypotheses" separation against disk) →
**Eias merges** (human merge authority). This PR opening is the web lane's
un-hold trigger.

<!-- R1/R2/R3 RESULT sections appended append-only below by their sessions. -->

---

## R1 RESULT — findings-only; the steady-state frame is contradicted by disk (2026-05-20)

Session: terminal, solo, `claude/audit8-g5-r1-extraction` cut from `origin/main`
HEAD `655953b`. Trinity: **untouched** — scripts + docs only. **No fix in this
PR.** This RESULT is appended append-only per
`feedback_spec_provenance_append_only`; it does not retro-edit R1's
pre-registered procedure, it documents what executing that procedure on disk
returned.

### STEP 0 — distrust contract (verified)

- `origin/main` HEAD = `655953b` (`docs(claude): single-lane operating model
  (#240)`). Branch cut clean; no collision with any other `claude/audit8-g5-r1-*`
  branch (none exist). No concurrent lane (the per-repo CLAUDE.md "single lane
  from 2026-05-19" applies).
- Anchors verified on disk: `extractQuestion` at
  `scripts/chaos-doctor-bot-v4.mjs:231`, `ensureOnPracticeQuiz` at `:817`;
  `showHelp` at `shlav-a-mega.html:8217`, `closeTopModal` at `:8285`.
- Vitest baseline isolated to the chaos-bot pin trio
  (`chaosBotV4PickDropInvariant.test.js`, `chaosBotV4ModalDismiss.test.js`,
  `chaosBotV4PickIdentityInstrument.test.js`) — **21/21 passed** before and
  after the minimal `export` keyword added to `extractQuestion` and
  `ensureOnPracticeQuiz` (needed so the probe can import the real extractor
  per R1.0's "no proxy" rule). The chaosBotV4ModalDismiss regex-grep tests
  still match (the `async function` prefix is preserved).

### R1.0 — RED probe (built; ran; did NOT reproduce)

- Probe shipped at `scripts/audit8/r1RedProbe.mjs`. Uses the **real**
  `extractQuestion` + `ensureOnPracticeQuiz` from
  `scripts/chaos-doctor-bot-v4.mjs` (import-from-source, not re-implementation
  — kickoff §1.0's "no proxy" constraint). Configurable URL + N; default
  100 attempts × ~2.5s pacing; advances between attempts via
  `[aria-label="Next question"]` (pick + check + next), zero Claude API
  calls. Forensic-mode classifier records `no-heb` / `stem-throw` /
  `short-stem` / `no-qo` / `empty-options` / `modal-blocked` / `other` and
  captures the first N forensic snapshots.
- Run against current `main` (live URL
  `https://eiasash.github.io/Geriatrics/`) at **N=100**:
  - `total` = 100, `extractedOk` = 100, `extractionFailures` = 0,
    `failureRate` = 0.000, `RED` = false.
  - All `perMode` counters zero. `ensureOnQuizFailures` = 0.
- **RED criterion (failure ≥ 0.85) NOT met.** Kickoff §6 bail #1 reads:
  "RED probe does NOT reproduce against current main → regression already
  silently fixed downstream; document and surface, do not fabricate a fix."
  The "silently fixed" frame, however, is contradicted by §R1.1 below: there
  is no commit to credit, because there is no commit that could have caused
  a regression in the bisect window. The bail's *action* is correct
  (document and surface); its *narrative* needs the bifurcation correction
  below.

### R1.0b — refutation control: structurally moot on disk

The pre-registered refutation control is a static-fixture comparison against
a pre-regression commit. On disk:

- `git log --oneline dac09e2..4a66ed8 -- shlav-a-mega.html` is **empty**
  (zero commits to the monolith in the audit-7→audit-8 window).
- `git log --oneline dac09e2..main -- shlav-a-mega.html` is **also empty**
  (no monolith changes through current `main`).
- `git log --oneline dac09e2..4a66ed8 -- scripts/chaos-doctor-bot-v4.mjs
  scripts/lib/` has exactly **two** commits: `cc85f91` (#235 PRE-STEP
  stemHash instrument) and `edfa433` (#236 frozen analyzer tooling).
- Neither of those commits touches `extractQuestion`. `extractQuestion`'s
  full git history (`git log --all -S "extractQuestion"`) is a single
  commit `f0ac470` (the Geri-native v4 port, well before audit-7).

A static-fixture comparison would compare byte-identical HTML on both sides
and byte-identical extractor logic. The control collapses to a no-op: H1
(live-DOM drift in the window) and the implicit alternative
(bot-extractor regression in the window) are **both** structurally
unavailable as causes — neither codebase changed.

### R1.1 — bisect: no candidate commit exists in the pre-registered window

Bisect was scoped (kickoff §1.1) to "the audit-7→audit-8 commit window" on
the named codebase. With **zero** candidate commits on either side of the
window (monolith: empty; bot extractor: never touched; only stemHash
instrument + analyzer changed, and `git show cc85f91` confirms cc85f91 is
the commit that **added** the `pre-pick-skip` telemetry — see below), the
bisect has no oracle-tunable axis. Skipping it is **not** a procedure
violation; it is the procedure's empty-set output.

### The bifurcation finding — disk re-analysis of the audit-8 RESULT ledger

The kickoff's frame (`docs/AUDIT8_G5_REPAIR_GATE.md` §0.2: "Extraction
reached-pick fraction ≈ 509 / (509+3800) ≈ **11.8 %**") is a **time-pooled
rate**. The per-minute distribution in
`chaos-reports/v4-long/audit8_20260518T191705Z/chaos-doctor-v4-2026-05-19T03-17-08-116Z.json`
+ `medical_findings_ai_v4.jsonl` shows a **sharp bifurcation**, not a
steady-state ~88 % failure (numbers from disk, deterministic — re-runnable
by anyone with the ledger):

- **Phase 1** (`19:17` → `22:30` Jerusalem, ≈ 3 h 14 min): **0**
  `pre-pick-skip` events; **2–3** successful Qs per minute, steady.
- **Transition** (`22:29:27` last ok → `22:31:07` first `pre-pick-skip`):
  ~1 m 40 s gap. **Zero** `pageerror` / `requestfailed` / `console:error` /
  `http >=400` / `methodology` events at the transition or in the preceding
  10 min. The trigger has **no telemetry footprint**.
- **Phase 2** (`22:31` → end-of-run `03:17`, ≈ 4 h 46 min): **13–14**
  `pre-pick-skip` events per minute, **zero** successful Qs. Mean delta
  between consecutive `pre-pick-skip` events 4.52 s (min 3.51, median 4.52,
  max 5.53; 3799/3799 deltas in the 2–10 s bucket) — consistent with the
  worker loop's short-path `ensureOnPracticeQuiz` (≈ 1.5 s) +
  `extractQuestion` timeout accumulation (4 × `.innerText({ timeout: 500 })`
  ≈ 2–3 s). dropCtx is **100 % `pre-pick-no-question`** — `extractQuestion`
  returned `null` (not the short-extract variant).
- **Recovery did NOT occur.** The 6 `stuck-refresh` events all fire in
  Phase 1 (`19:25`, `19:42`, `20:01`, `20:21`, `20:47`, `21:38`); none fire
  in Phase 2. The bot's `stuckCount` mechanism increments only when
  `result.stemHash` is non-null AND equal to `lastStemHash`; failed
  extractions return `stemHash: null`, so `stuckCount` never accumulates
  during Phase 2, and the page is never reloaded. **The bot is structurally
  unable to recover from Phase 2** with its current stuck-refresh contract.

### Cross-check — audit-7 ledger (same instrument family, 4 h vs 8 h)

`chaos-reports/v4-long/audit7_2026-05-18/chaos-doctor-v4-2026-05-18T09-29-42-226Z.json`:

- Duration 4 h, 1 worker, 569 `qsAnswered`.
- Per-15-min buckets across the full run: **flat at 32–40 successful Qs
  per 15-min window**. No tail-off in the final 30 min (32, 36, 38, 36, 37
  → last partial minute 1). Audit-7 **did not** hit the Phase-2 collapse.
- Audit-7 ran *before* `cc85f91` (PRE-STEP): the `pre-pick-skip` bug-type
  did not exist in its bot (`git show cc85f91 -- scripts/chaos-doctor-bot-v4.mjs`
  shows the row being **added**; before #235 the same condition was a
  silent `return { advanced: false, stemHash: null }`). So audit-7's ledger
  cannot disprove that *some* extractions failed; it can only show that the
  bot kept producing successful Qs at a flat rate to the end.

The 4 h window puts the Phase-2 onset somewhere in `[3.2 h, > 4 h]`. It is
not 0 % steady-state ("88 % extraction failure"), and not deterministically
4 h either — it is a duration-gated, intermittent state corruption with no
visible trigger in the available telemetry.

### What this means for R1's locked procedure

- **Hypothesis 2** (gate §"HYPOTHESES" item 2): "Something regressed
  between audit-7 (4 h) and audit-8 (8 h)" was a "bisect signal, not a
  measured regression magnitude." Disk evidence promotes it from
  *unverified* to **structurally refuted**: the bisect window has no
  monolith changes and the only relevant bot change was *adding the
  telemetry*. The 4× G2 shortfall (30 vs the projected 110–130) is
  consistent with audit-8 having spent ~4.7 h of its 8 h budget in a
  failure mode that audit-7's 4 h budget never entered, not with a
  per-question extraction regression.
- **Hypothesis 1** (gate §0.3): "live-DOM / practice-surface drift"
  is **not testable** by R1.0b on disk evidence — both sides of the
  pre-registered comparison are byte-identical.
- **R1.2 GREEN criterion** (gate §1.2): projects N_drop from a short
  (≈ 15 min) post-fix probe via *reached-pick rate × drop-fraction*. A
  short probe **systematically samples Phase 1 only** (Phase-2 onset is
  ≥ 3.2 h). The projection is therefore not honest for a fix that targets
  Phase-2 — it would over-state the recovered yield. This is exactly the
  REV1.1 "denominator-shrink / criterion-swap-by-silence in the likely
  branch" trap, applied to the rate-projection side.

### Why no fix is shipped in this PR

The smallest plausible scoped fix — a `null-stemHash`-aware consecutive
`pre-pick-skip` counter that triggers `page.reload()` after N (5? 10?)
events — would bound the blast radius of Phase-2 (Phase-2 events ride at
~4.5 s each, so N=10 → ~45 s lost before recovery) without addressing the
unknown trigger. That is a legitimate option, but adopting it inside this
PR has two problems:

1. **GREEN criterion math becomes structurally non-validating.** A 15-min
   probe never enters Phase 2, so cannot witness the recovery-on-reload
   path firing; "rate × duration projection from a non-representative
   window" is the spec-provenance trap REV1.1 calls out
   (`feedback_pre_commit_diagnostic_gates`).
2. **Trigger remains unknown.** Without a reproducible trigger, the fix is
   resilience-only, not causal — and the gate's R1 is *named* "extraction-
   yield repair," not "bot resilience patch." Re-naming silently inside R1
   would be the same provenance violation, just on a different axis.

The honest action under §6 bail #1 (whose *action* is "document and
surface, do not fabricate a fix") is to ship the probe + appended RESULT
and let the gate author decide between two pre-registered branches (open
question §below).

### What this PR ships

- `scripts/chaos-doctor-bot-v4.mjs`: minimal `export` keyword added to
  `extractQuestion` and `ensureOnPracticeQuiz`. Regex-grep tests
  (`chaosBotV4ModalDismiss.test.js`) still match — `async function` prefix
  preserved. Bot CLI behavior unchanged (still gated by `isMain`).
- `scripts/audit8/r1RedProbe.mjs`: the R1.0 RED probe, configurable via
  `R1_PROBE_URL` / `R1_PROBE_N` / `R1_PROBE_HEADLESS` / `R1_PROBE_OUT` /
  `R1_PROBE_LABEL` / `R1_PROBE_READ_PAUSE_MS` / `R1_PROBE_FORENSIC_SAMPLES`.
  Default-emits JSON to `chaos-reports/r1RedProbe/<label>-<ts>.json`
  (gitignored path; output is forensic, regenerable by re-running the
  probe).
- This appended R1 RESULT.
- **Not shipped:** no fix to the bot, no fix to the monolith, no new test
  pin (no fix → nothing to pin; the existing 21 chaosBotV4 tests stay
  green).

### Open question for the gate author (binding routing decision)

Two pre-registered branches, neither selected here:

- **Option A — close R1 findings-only.** R1's locked procedure (RED →
  bisect → fix) is empirically empty given the disk evidence above.
  Author an R1.5 (its own gate) re-registering a procedure that targets
  the actual failure mode — a long-duration probe (≥ 4 h) with
  screenshot-on-`pre-pick-skip`-streak + `pageerror`/`console` capture +
  DOM-state dump on the *first* `pre-pick-skip` after a successful Q
  (the transition itself), to give the next session telemetry the trigger
  currently lacks. R2 and R3 stay blocked behind R1.5 closing.
- **Option B — accept a scoped bot resilience patch as R1's fix.**
  Add a `null-stemHash` consecutive-skip counter + `page.reload()` to
  `runWorker`. Trinity untouched (bot-only, mirrors #235). Acknowledge in
  R1.2 RESULT that the GREEN criterion is **not** rate-projection-validated
  (the short probe cannot witness Phase 2); validation is via (a) unit
  test of the new counter+reload contract, (b) projection from audit-8's
  *Phase-1* rate × 8 h (2.5 Qs / min × 480 min ≈ 1200 reach-pick;
  with audit-8's 5.9 % `ai-parse-error/pick` drop fraction ≈ **71 drops**
  — still under G2's 80, **option B is not on its own a green outcome**,
  it is a precondition for a follow-up surface that lifts drop-rate
  separately or a longer R3). Re-naming the gate's R1 silently to "bot
  resilience" is forbidden; the doc must say so.

**The session author cannot select between A and B inside R1's
pre-registered scope — it requires the gate author's call** (this is
exactly the `feedback_design_gate_option_3_bias` carve-out applied to a
gate-level routing decision, not a tactical implementation choice).

### Trinity + verify

- `npm run verify` green on this branch (`shlav-a-mega.html` + `sw.js` +
  `package.json` untouched; the 6 non-vitest checks dominate before the
  vitest tail; the chaos-bot test trio is the most-relevant slice and is
  21/21 green).
- No `verify-deploy.sh` post-merge: this is a docs + scripts PR, no
  monolith change, no Pages cache to verify.

### Provenance

Append-only addition under the gate's pre-registered HTML-comment marker.
R1 section above this line: **not edited**. R2 / R3 sections: still
pending their own session's appended RESULT block.

