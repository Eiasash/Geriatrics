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
