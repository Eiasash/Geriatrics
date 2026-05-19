# Audit-8 — pick-channel `disagrees`-representativeness (selection / survivorship bias) — PRE-REGISTERED GATE

Written **before** any bounded `long-chaos-run.sh` pick-channel sample, and
before any drop/retain covariate table is seen. Append-only; do not
retro-edit (`feedback_spec_provenance_append_only`). Lane: terminal, solo
(`claude/term-audit8-pickchannel-gate`, cut from `origin/main` HEAD
`fedf27e`). Trinity: **untouched** — docs-only, no bump (mirrors
audit-4/5/6/7: an audit that ships no product code does not bump the
version trinity).

This is the horizon **item 1** pre-registration named in
`docs/AUDIT7_PRE_REGISTERED_GATE.md` (post-review append, lines 426-436):
*"[higher — foundational] Pick-channel `disagrees`-representativeness
check … Decides whether the right rows are being judged at all —
logically prior to any judge-verdict fix. Own session + gate."* This
session authors the gate **only**. The bounded run is a separate,
later, gated step.

---

## READ THIS FIRST — this gate INVERTS audit-7's STEP 0

Audit-7's STEP 0 ended `PASSED → paid run authorized against a
verified-live instrument`. **Audit-8's STEP 0 ends `FAILED` — and the
fail is established now, from static source, before any data is seen**
(instrument *absence* is a code fact, not a data peek; recording it
pre-run is legitimate and is the whole point of a make-or-break
instrument-live gate). Consequently the locked gate's *next action is
not a bounded run* — it is a mandatory instrument **PRE-STEP** PR
(`scripts/` + `tests/`, no trinity, own pre/post gate, mirrors audit-5).
The bounded run is gated behind **both** this locked gate **and** that
PRE-STEP landing test-pinned on `main`. Do not conflate this gate with
audit-7's "run authorized" — here, the paid run is explicitly
**WITHHELD**.

---

## STEP 0 (distrust contract) — results

- **0.1 State.** `git fetch --all`; `origin/main` HEAD = `fedf27e`
  (#232 squash-merged — the audit-7 gate+RESULT PR). `git log --all
  --since` shows only this workstream's own `claude/term-audit*`
  lineage in the last 2 days; no `claude/web-*` branch on the bot or
  `scripts/lib/`. `docs/AUDIT7_PRE_REGISTERED_GATE.md` present on
  `main`; `tests/chaosBotV4PickDropInvariant.test.js` NOT on `main`
  (intentionally parked, landed this session as the ride-along). → solo
  terminal lane. ✅

- **0.2 INSTRUMENT-LIVE GATE (make-or-break) — FAILED on current
  `main`, verified from primary source (deterministic, no run).**
  The representativeness question requires recovering, for the
  **dropped** picks, the covariates of the questions that were dropped.
  Traced in `scripts/chaos-doctor-bot-v4.mjs`:
  - `:465` invalid-pick validity gate
    `if (aiIdx == null || aiIdx < 0 || aiIdx >= q.options.length) {`
  - `:466` `log.bugs.push({ at: nowIso(), type: 'ai-parse-error',
    context: 'pick', text: pickResp.text.slice(0, 200) })`
  - `:467` `return { advanced: false, stemHash }`

  The persisted drop row carries **no question identity** — `text` is
  the model's *failed response* (first 200 chars), not the question.
  `stemHash` (`:450`, djb2 over the extracted stem, `:160-165`) is
  *returned* at `:467` but the worker loop (`:933-955`) consumes it
  **only** for stuck-refresh tracking (`lastStemHash`); on a normal
  drop it is **never written to any persisted row** (the lone
  `stemHash`-bearing bug row is the rare `stuck-refresh` at `:950`, a
  different condition logging `lastStemHash`, not a per-drop identity).
  The retained/judged **comparator** *is* recoverable: `recordFinding`
  (`:415-417`) writes `stem: q.stem.slice(0, 300)` (`:525` plus the
  main judged finding) → joinable to `data/questions.json`. Therefore
  the comparator exists but **the dropped population's covariates are
  unrecoverable from the current ledger** → the representativeness run
  is **NOT runnable on the current instrument**. Paying for it today is
  audit-7's "do NOT pay to run the un-instrumented bot"
  (`feedback_distrust_brief_frame_not_just_facts`) recursed onto the
  pick channel. ❌ → routes to G0's mandatory PRE-STEP.

- **0.3 Floor green.** Inherited from audit-7 close (#232): full suite
  green on `main`. Re-confirmed this session for the ride-along only:
  `tests/chaosBotV4PickDropInvariant.test.js` 5/5 green against current
  `chaos-doctor-bot-v4.mjs` + the RED-proof mutation matrix re-run (see
  this PR's ride-along commit). The bounded-run floor re-check is the
  PRE-STEP session's STEP 0, not this one's. ✅ (scoped)

- **0.4 Brief read, not reconstructed.** `docs/AUDIT7_PRE_REGISTERED_GATE.md`
  in full (the kickoff's named-authoritative brief), incl. the
  post-run RESULT and the post-review PICK-CHANNEL append (lines
  397-441) that resolved contamination **direction = DROP /
  selection-bias, not spurious-`disagrees`** ("the spurious-`disagrees:
  true` path … does not exist"). The mechanism cited there (gate
  before `disagrees`) is re-verified from source here with corrected
  line numbers (gate condition `:465`; `disagrees` compute `:516`) —
  see the Kickoff-vs-brief / line-fix note below. ✅

---

## Kickoff-vs-brief reconciliation (covariate set + the two line-fixes)

**Covariates — locked at the brief's superset of 4, not the kickoff's
3.** The kickoff DELIVERABLE lists `(3) covariates tested — stem-len,
ti, bilingual`; the named-authoritative brief
(`AUDIT7_PRE_REGISTERED_GATE.md` lines 423 & 432) twice lists `stem
length / ti / bilingual / year` (4). The kickoff itself designates that
brief authoritative ("`docs/AUDIT7_PRE_REGISTERED_GATE.md` (on main) is
the authoritative brief"); pre-registration discipline forbids silently
dropping a covariate the authoritative source names, and the kickoff's
3-item list reads as a representative shorthand ("stem characteristics")
of the brief's 4. Locked set therefore = **{stem_len, topic, bilingual,
year}**, family-wise corrected together (Holm). This is surfaced here
(and in the PR description) deliberately and non-apologetically so the
audit trail shows *why* the locked set is 4 — not scope creep, a
reasoned reconciliation toward the authoritative source. (Working Rule
1: surface the tradeoff in the artifact, not a clarifying-question
round-trip — the conflict is resolvable from the kickoff's own
authority designation.)

**Two AUDIT7 line-fixes (ride-along commit, in-place typo class).**
The kickoff mandates folding two pointer corrections into
`AUDIT7_PRE_REGISTERED_GATE.md`: the `disagrees` compute is at source
**`:516`** (the post-review append said `L519`), and the validity gate
*condition* is at **`:465`** (the append said "L466 gate" — `:466` is
the `log.bugs.push` *inside* the gate, `:467` the `return`). Both
verified against current source. Scope is exactly these two single
tokens (each occurs once: `L519` on doc line 408, `L466` on doc line
414); the `L461-467` range on doc line 406 is **not** in the kickoff's
scope and is left as-is (Rule 3 + append-only minimalism). Authorized
as in-place typo fixes by the spec author (kickoff), per
`feedback_spec_provenance_append_only`'s "typos in-place" carve-out;
no dated edit marker (factual-pointer typo, not a substantive rewrite).

---

## THE LOCKED GATE (binding; the data does not get to reshape it)

### G0 — Instrument-recoverability precondition (make-or-break; FAILS today → mandatory PRE-STEP)

Established by STEP 0.2 from static source. **The bounded run MUST NOT
be paid for until a separate instrument PRE-STEP lands on `main`,
test-pinned.** The PRE-STEP (own session / branch / PR / pre+post gate;
product code = `scripts/` + `tests/`; **no trinity bump**, mirrors
audit-5) must extend the pick-drop ledger rows with the minimal
joinable identity:

- **Primary target — `:466` `ai-parse-error`/`context:'pick'`** (the
  ~11% drop this whole audit is about): add `stemHash` + `stem`
  (mirror `recordFinding`'s `q.stem.slice(0, 300)`) + `optCount`.
- **For completeness (same selection class):** `:458`
  `ai-error`/`context:'pick'` (network/throw before parse) and `:448`
  pre-pick early return (`!q || q.options.length < 2` — DOM/extraction
  failure). Tag these with a distinct sub-context so the analysis can
  *exclude* the `:448` DOM-extraction failures from the pick-parse
  universe (pre-registered exclusion — `:448` is not a pick-parse event).
- Pin the new fields with a test in the `tests/chaosBotV4*` family
  (sibling-aligned shape).

The comparator (retained) needs **no** change — `recordFinding` already
carries `stem`. After the PRE-STEP, re-evaluate STEP 0.2; only a PASS
there authorizes the bounded run. **This gate's own activation order
is: G0 PRE-STEP PR → re-pass STEP 0.2 → bounded run (G1–G5) → RESULT
appended below.**

### G1 — Budget (locked)
Cap = **$20 USD**, `CHAOS_COST_CAP_USD=20` (the audit-7 ceiling,
preserved — `feedback_chaos_bot_cost_cap_per_process`: per-Node-process
across workers; with 1 worker, per-process == actual, so the cap binds
exactly). Script header estimate $5–8. If actual spend exceeds $20 →
STOP, report partial. (The deliberate choice of the $20 ceiling over a
larger "decisive-run" budget is paired with the G5 inconclusive branch:
an honest under-powered first pass at the established ceiling beats
silently widening the budget — lane-consistent with audit-7.)

### G2 — Run-validity / minimum-drops gate (locked)
Run config locked to audit-7's calibrated defaults: **1 worker**
(proxy 429s on 3+), `CHAOS_USE_PROXY=1`, **`claude-sonnet-4-6`**
(baseline≡sample model lineage, per AUDIT7 MODEL-LINEAGE append),
`CHAOS_REPORT_RATE=0.0` (read-only), **duration 8 h**
(`CHAOS_DURATION_MS=28800000` — ~2× the audit-7 4 h run; at the
audit-7 yield ≈64 drops/4 h this targets ≈110-130 dropped picks before
the $20 cap, the regime where the G4 marginal family has power for
small effects), isolated report dir `chaos-reports/v4-long/audit8_<ts>/`
(fresh ledger, no stale-row inheritance).

Minimum-analyzable-N gate: **N_drop ≥ 80** *and* **N_retain ≥ 200**
after the G3 join. If either is unmet → the run is **under-powered →
G5 INCONCLUSIVE** (do not force a verdict; recommend a specifically
sized larger run). If `N_drop == 0` while STEP 0.2 (post-PRE-STEP) shows
the instrument live → that is itself a finding (drop rate collapsed),
not an expected branch → STOP, report.

### G3 — Join-fidelity invariant (locked)
Every analyzed pick (dropped and retained) is joined to
`data/questions.json` by (1) exact `stemHash` (re-hash each
`questions.json` stem with the bot's djb2 `:160-165`), fallback (2)
whitespace/BIDI-normalized stem-slice containment. Pre-registered
minimum **unique-join rate ≥ 95%** of all attempted picks. Below 95%
⇒ DOM-extracted (possibly bilingual-toggled) stem vs canonical `q`
drift makes the covariate table unreliable → **STOP, report, do not
route** (the audit-7 G3 `reconciliation MISMATCH` analog). Picks that
fail to join are reported as a count and **excluded** (pre-registered),
never imputed.

### G4 — Decision rule (locked; no post-hoc test/threshold selection)

**G4.1 Outcome & universe.** Binary outcome `dropped` ∈ {dropped at
the `:465` pick gate, retained = reached the judge}. Universe = every
attempted question that reached the pick step with ≥2 extracted options.
**Pre-registered exclusions:** `:448` pre-pick DOM/short-extract early
returns (not pick-parse events); `:458` `ai-error/pick` network throws
(distinct path — reported separately, not in the parse-drop numerator);
G3 join failures.

**G4.2 Covariates (locked, 4 — see reconciliation above).**

| Covariate | Operationalization (locked) | Primary test | Effect size |
|---|---|---|---|
| `stem_len` | char length of canonical `q` (joined) | Mann–Whitney U (dropped vs retained) | Cliff's δ |
| `topic` | `ti` collapsed to the repo's **12 `TOPIC_GROUPS`** clinical categories (locked — no post-hoc binning; the 46-level `ti` is sparsity-degenerate) | χ² independence (2×k); expected-cell <5 groups pooled to "other" **before** the test (locked rule) | Cramér's V |
| `bilingual` | presence of `q_en` (AI-generated-from-English) vs native IMA Hebrew | Fisher exact (2×2) | Cramér's V (φ) |
| `year` | **binary** real-IMA-session vs AI-generated (`t`); per-session breakdown is descriptive-only (locked — prevents post-hoc session cherry-picking) | Fisher exact (2×2) | Cramér's V (φ) |

**G4.3 Test family (locked).** The 4 marginal tests above are the
PRIMARY family — two-sided, α = 0.05, **Holm–Bonferroni** correction
across all 4. A single **joint logistic regression**
`dropped ~ z(stem_len) + bilingual + C(topic_group) + ai_generated` is
a **locked SENSITIVITY analysis only**: reported to check whether a
marginal signal survives mutual adjustment (e.g., bilingual Qs tend to
be longer — confound). **The binary verdict is keyed on the PRIMARY
marginal family, never on the logistic** (locked now to remove the
post-hoc "which model" researcher degree of freedom).

**G4.4 Effect-size floors (locked).** A covariate is a **bias signal**
iff its primary test is **Holm-significant AND** its effect size meets
the floor: **Cliff's |δ| ≥ 0.15** (`stem_len`) / **Cramér's V ≥ 0.10**
(categoricals). A Holm-significant covariate **below** its floor is
*statistically detectable but practically negligible*.

**G4.5 PRIMARY QUESTION — binary, locked now:** *Is the dropped ~11%
missing-completely-at-random with respect to the four tested
covariates, or is the adjudicated `disagrees` population a biased
subsample?*

| Condition | Verdict |
|---|---|
| ≥1 covariate is a **bias signal** (Holm-sig **and** ≥ floor) | **BIASED** |
| ≥1 Holm-sig but **all** such < floor; none ≥ floor | **DETECTABLE-BUT-NEGLIGIBLE** |
| **0** Holm-sig **and** G2 min-N met (adequately powered) | **REPRESENTATIVE** |
| **0** Holm-sig **and** G2 min-N **not** met (under-powered) | **INCONCLUSIVE** |

### G5 — Per-outcome downstream triggers (locked)

- **REPRESENTATIVE** → the audit-3/4/5/7 `disagrees` population is
  unbiased on the tested axes; those verdicts stand un-revisited on
  this axis. **Close the pick-channel representativeness horizon
  item.** Horizon **item 2** (Geri-side judge `max_tokens` bump) is
  thereby **unblocked** — it was explicitly "moot if the adjudicated
  population itself is biased"; it is no longer moot and becomes the
  next workstream (own session + gate + fresh verification run).
  Toranot untouched; the audit-7 truncation route is unaffected
  (orthogonal channel).

- **DETECTABLE-BUT-NEGLIGIBLE** → route as REPRESENTATIVE for the
  horizon (item 2 unblocked, no retroactive re-adjudication), **plus**
  a recorded caveat stating the bounded bias magnitude (the
  below-floor effect sizes and their CIs). The instrument PRE-STEP
  already hardens future logging; no re-run of past audits.

- **BIASED** → the adjudicated `disagrees` population is a biased
  subsample on the named axis/axes. Triggers, each its own
  session/gate, none in this lane: **(a)** pick-channel robustness
  hardening — the pick-side analog of the judge root-cause fix — so
  future runs stop silently dropping ~11% (own pre/post gate + fresh
  bounded verification run); **(b)** retroactive-reach
  characterization — enumerate which audit-3/4/5/7 verdicts were
  computed over `disagrees` rows and whether any must be re-run on a
  de-biased population (**document; do not auto-rerun** — no `q.c`
  flip, no `broken` change); **(c)** horizon item 2 stays explicitly
  gated **behind** the de-bias. Toranot untouched; audit-7 route
  unaffected.

- **INCONCLUSIVE** → report the histogram + a power analysis; recommend
  a specifically sized larger bounded run (state the target N_drop);
  **force no verdict**, trigger **no** downstream (audit-7 G4.5
  analog). Item 2 remains blocked pending a conclusive run.

---

## SCOPE

Diagnosis of the **pick channel's selection profile only**. Ships
**no fix**. Flips **no `q.c`**. Changes **no `broken` flag**. Touches
**no Toranot file**. The instrument PRE-STEP (G0) and every G5 trigger
are separate sessions with their own pre/post gates and (where they
ship product code) their own fresh verification runs. The audit-7
truncation route (judge channel) is **out of this gate's reach** and is
not re-litigated.

## SHIP

Tracked, **docs-only**, append-only audit-5/6/7 style: **this gate doc**
(committed pre-run, this session) + a **post-run RESULT** section
appended by the *future* bounded-run session (after G0's PRE-STEP
lands and STEP 0.2 re-passes) — histogram, G3 join rate, the marginal
family + effect sizes, the logistic sensitivity, the G4 verdict, the
G5 route, recommended next session. No trinity bump. Branch
`claude/term-audit8-pickchannel-gate` → PR to `main`; **do not
self-merge** (normal PR discipline; the #230/#231 self-merge was a
discrete explicit user instruction, not a precedent).

## OUT OF SCOPE (handed off untouched)

- **The bounded run itself.** Gated behind G0's PRE-STEP + a re-passed
  STEP 0.2. Not this session.
- **Horizon item 2 — Geri-side judge `max_tokens` bump.** Lower
  priority; **moot if this audit returns BIASED**; unblocked only on
  REPRESENTATIVE / DETECTABLE-BUT-NEGLIGIBLE. Its own session + gate +
  fresh verification run.
- **B4 content adjudication (37 Qs).** Unchanged from audit-5/6/7 —
  different axis (content, not bot-reliability). NOT this session, NOT
  a queue. No `q.c` flip, no `broken` change, no distractor regen.

---

## Recommended next session (NOT this session)

**The instrument PRE-STEP** (G0): minimally extend the pick-drop ledger
rows (`:466` primary; `:458`/`:448` tagged for exclusion) with
`stemHash` + `stem` slice + `optCount`; pin with a `tests/chaosBotV4*`
test. Own branch / PR / pre+post gate. Product code (`scripts/` +
`tests/`) → **no trinity bump** (mirrors audit-5). Only after it is
live and test-pinned on `main` does STEP 0.2 re-evaluate and the
bounded run (G1–G5) become authorized.

<!-- RESULT section intentionally absent: this session authors the
gate only. It is appended, append-only, by the bounded-run session
that runs behind G0. -->

---

## [2026-05-18, appended post-fresh-eye filesystem-grounded review] DELTAS — corpus facts the no-run gate could not see

Append-only (`feedback_spec_provenance_append_only`); **G0–G5 and STEP 0
above stand verbatim** — this section *supersedes only the enumerated
clauses* and records *why*, so a post-squash reader sees the gate was
authored "from source, deterministic — no run" (STEP 0.2 / SCOPE) and
then corrected by the workspace CLAUDE.md **fresh-eye
filesystem-grounded review** (a web Claude with `git clone` read the
real `data/questions.json`; this is that rule firing exactly as
designed for a design-spec-shaped artifact pre-merge). Each delta was
**re-verified terminal-side against the on-disk corpus at `fedf27e`**
before folding — the relayed review's own prior "drop `year`" call was a
single-object-check error, so the numbers below are full-corpus
(`n=3743`), not deferred to.

**D1 — `year` covariate is the `t` field, categorical (not numeric, not
binary).** Verified: no `year` key (`hasYearKey:false`); `t` has **18
distinct** exam-batch values (`Hazzard`=1852, `Harrison`=294, `GRS8`=90,
`Hazzard-suppl`=24, `Exam`=24, plus dated IMA sessions
`2020`…`2025-Jun-Basic`). **Supersedes the G4.2 `year` row:** the
covariate is `t` as a **categorical**, **χ² with the same pre-registered
expected-cell-<5 pooling rule as `topic`** — *not* the prior binary
real-IMA-vs-AI Fisher 2×2. (The binary was a no-run simplification that
discarded 16 of 18 levels and was itself an un-pre-registered collapse;
the categorical with the locked pooling rule removes that DOF.)

**D2 — covariate family 4 → 6: add `c_accept` and `broken`.** Verified:
`c_accept` non-empty on **48** Qs, `broken===true` on **24**
(CLAUDE.md's "22" is stale — disk is 24), `allow_dup` on **936**.
Mechanism: a `broken` Q (garbled options) and a multi-accept Q (invites
a hedged, unparseable pick) are the questions *most likely to fail the
`:465` pick-validity gate* — i.e. exactly the suspected drop mechanism,
so a representativeness test must carry them. Consequence: the
audit-3/4/5/7 chain manages `c_accept` / `broken` / curator-override
Qs most carefully, so a drop-set that over-samples them means the
adjudicated `disagrees` set under-samples precisely the corpus the
chain is most careful about — the most load-bearing bias axis.
**Supersedes the G4.2 covariate table:** add `c_accept` (binary:
non-empty `c_accept[]`) and `broken` (binary) → a **6-covariate Holm
family**. *Power tradeoff (surfaced, Working Rule 1):* Holm over 6 vs 4
lowers per-test power at fixed N; this is **absorbed by, not a defect
of,** the locked $20-ceiling + G5 INCONCLUSIVE design (an honest
under-powered first pass that recommends a sized larger run —
lane-consistent with audit-7 / `feedback_design_gate_option_3_bias`).
*Terminal-side contingency the relayed deltas did not address:*
`broken===true` Qs may be **suppressed from the served practice pool**;
if so, `broken` is a **vacuous** covariate. Pre-registered: the
bounded-run session reports `N_broken_served`; if 0, `broken` drops out
as vacuous. Do **not** assume suppression from memory — trace the
production render path empirically (`feedback_verify_simulator_findings`:
the 2026-05-02 over-flag was exactly an unverified "renderer filters
these" assumption).

**D3 — G3 global ≥95% stem-join threshold is structurally
unsatisfiable; replace with a per-covariate-determinate join.**
Verified: **3586 unique stems / 3743 (95.81%)**, **157** byte-identical
`q` groups (+157 extra rows), `allow_dup`=936 (duplication is
**sanctioned** — do **not** dedupe). A perfect run therefore sits *at*
the 95.81% ceiling — the prior G3 `≥95%` could fail by construction.
**Supersedes G3:** join determinacy is **per-covariate**. Verified
within-dup-group covariate agreement over the 157 groups: `c` 157/157,
`c_accept` 157/157, `bilingual` 157/157, `stem_len` 157/157
(byte-identical ⇒ identical length — determinate by definition),
`broken` 155/157, `topic`(`ti`) 144/157. A dup group that *agrees* on
covariate X contributes determinately to X regardless of which member a
row maps to; only covariate-**discordant** dup cells are dropped (≤2 for
`broken`, ≤13 for `topic`, 0 for the rest). New locked invariant:
**per-covariate determinate-join rate ≥ 99%** after collapsing
covariate-invariant dup groups (replaces the unsatisfiable global ≥95%).

**D4 — instrument the JUDGED side too; STEP 0.2 "comparator
recoverable" was a no-run overclaim.** Verified: `recordFinding`'s
`finding` object (`chaos-doctor-bot-v4.mjs:695-708`) stores
`stem: q.stem.slice(0, 300)` **truncated** with **no `stemHash`**; the
bot hashes the **full** stem (`:450`; djb2 is collision-free over the
corpus — 3586 distinct hashes = 3586 unique stems); **1713/3743 (46%)
of stems exceed 300 chars** (max 1327). So the persisted
truncated slice is *not* a faithful join key for ~46% of rows and the
full-stem `stemHash` is **not reconstructable** from it. **Corrects
STEP 0.2 / SCOPE:** "the retained/judged comparator IS recoverable via
`recordFinding`" → recoverable *in principle but fragile in practice*
for ~46% of rows (truncation + 157 dup-prefix collisions). **Supersedes
G0's PRE-STEP scope:** the instrument PRE-STEP must add `stemHash`
(full-stem djb2) to the `finding` object (`:695-708`) **as well as** the
`:466` / `:458` / `:448` drop rows — both sides keyed on the same
full-stem hash.

**Reconciliation / lane (unchanged where the review concurred).**
Single doc — **no second gate doc** (two docs = reconciliation mess).
The G4 4-way verdict + effect-size floors + G5 triggers **stand** (the
review concurs they are better than a binary route; the binary core
"biased or not" is preserved — the non-biased split is reporting
granularity). The instrument PRE-STEP remains **its own future gated
session**; two real-data-verified scripts produced by the fresh-eye
lane (`build_stemhash_index.mjs`, `analyze_pick_representativeness.mjs`)
exist as **inputs** for that session — **not** committed in this
docs+test PR, and **not** pre-spec'd now: pre-writing a future gated
session's spec would repeat the no-run / provenance hazard this very
review just caught.

---

## [2026-05-19, appended post-run] RESULT — bounded run executed; mechanical verdict = STOP-JOIN-INTEGRITY (no representativeness verdict routed)

Append-only (`feedback_spec_provenance_append_only`); **everything above
this line is verbatim, retro-edited NOWHERE**. Appended by the bounded-run
session per the SHIP clause, after the frozen pre-registered analysis
tooling (PR #236, `edfa433`) was run on the completed ledger. The verdict
below is the **mechanical output** of `scripts/analyze_pick_representativeness.mjs`
— the histogram did not reshape it (gate STEP 0 / "the data does not get
to reshape it").

### Run end-state (actual, not assumed)
- **Full 8 h, clean finish.** Launched `2026-05-18T19:17:05Z` → summary
  written `2026-05-19T03:17:08Z` (the G2 8 h duration bound; the G1 \$20
  cap was **not** reached).
- **Cost \$7.91** (1731 calls, 1,315,804 in + 264,067 out tokens,
  **0 failures**) — inside the gate's \$5–8 estimate, well under \$20.
- Config verified from the launch banner: 1 worker, `claude-sonnet-4-6`,
  `toranot-proxy`, `CHAOS_REPORT_RATE=0.0`, `CHAOS_FEEDBACK_RATE=0.0`,
  fresh isolated dir `chaos-reports/v4-long/audit8_20260518T191705Z/`.
- **STEP-3 script-divergence flag (surfaced, not papered over):**
  `scripts/long-chaos-run.sh` *defaults* diverge from G1/G2 (4 h / \$25 /
  fixed stale-inheriting report dir). The run was executed
  gate-compliantly via explicit env overrides (`CHAOS_DURATION_MS=28800000`,
  `CHAOS_COST_CAP_USD=20`, fresh `audit8_<ts>` dir) running the bot
  directly (not the wrapper, whose tail invokes the superseded
  `long-chaos-analyze.mjs`). Reconciling the script defaults to the gate
  is a separate change, out of this docs-only RESULT scope.

### G4.1 universe (real counts)
| Class | N |
|---|---|
| **DROPPED** (`ai-parse-error`/`pick`) — the numerator | **30** |
| **RETAINED** (judged findings) | **479** |
| `ai-error`/`pick` (separate, not in numerator) | 0 |
| `pre-pick-skip` (G4.1-excluded; DOM/extract fail) | **3800** |
| `extractNull` honest-denominator counter | 3800 |
| `appIdx-null` (excluded) | 0 |

The run was **DOM-extraction-failure-dominated**: 3800 pre-pick-skip vs
only 30 reaching the pick-parse gate + 479 judged. Per G4.1 the
pre-pick-skip rows are pre-registered EXCLUDED (not pick-parse events) —
but the magnitude is a material instrument/run observation (below).

### G3 / D3 per-covariate determinate-join (locked invariant ≥ 0.99)
`joinFailDrop = 0`, `joinFailRetain = 0` (every row hash/containment-joined).

| Covariate | determinate / attempted | rate | ≥0.99? |
|---|---|---|---|
| stem_len | 509 / 509 | 1.000 | ✓ |
| topic_group | 507 / 509 | 0.99607 | ✓ |
| **t** | **474 / 509** | **0.93124** | **✗ VIOLATION** |
| bilingual | 509 / 509 | 1.000 | ✓ |
| c_accept | 509 / 509 | 1.000 | ✓ |
| broken | 509 / 509 | 1.000 | ✓ (but vacuous — served = 0) |

`t` falls **35 cells short** of determinate. With `joinFail = 0` this is
**not** unjoined rows — it is `t`-discordant byte-identical-stem dup
groups (the same stem text carried under different exam-batch `t` tags).
Consistent with D3's pre-verified within-dup-group disagreement being
highest for the `ti`/`t`-class tags. **D3 mandate: ≥1 covariate < 0.99 ⇒
do NOT route a representativeness verdict.**

### G2 power
`N_drop = 30` (< MIN 80 → **under-powered**); `N_retain = 479` (≥ MIN 200).
`powered = false`. Absent the join violation this run would route
**INCONCLUSIVE** on the G4.5 under-powered branch — corroborating, not
the binding reason.

### Marginal family (descriptive only — verdict is STOPped, not REPRESENTATIVE)
`broken` D2-vacuous (served = 0) → dropped; `t` D3-join-excluded →
dropped. Holm family = {stem_len, topic_group, bilingual, c_accept},
two-sided α = 0.05.

| Covariate | test | stat | p | effect | floor | pAdj | Holm-sig | bias-signal |
|---|---|---|---|---|---|---|---|---|
| stem_len | Mann–Whitney U | U=6342, z=−1.078 | 0.2809 | Cliff δ = −0.1173 | \|δ\|≥0.15 | 0.7554 | no | no |
| topic_group | χ² 2×k | χ²=1.425, df=1 | 0.2327 | Cramér V = 0.0530 | ≥0.10 | 0.7554 | no | no |
| bilingual | Fisher 2×2 | [[10,20],[222,257]] | 0.1889 | φ = 0.0615 | ≥0.10 | 0.7554 | no | no |
| c_accept | Fisher 2×2 | [[0,30],[6,473]] | 1.000 | φ = 0.0273 | ≥0.10 | 1.000 | no | no |

0 Holm-significant; 0 meet the effect-size floor. (Reported for
completeness; the G4.5 verdict is **not** read off this table because the
D3 join gate STOPped the route.)

### Logistic sensitivity (G4.3 — verdict-neutral by lock)
`n = 507`, **converged = false** (`reason: max-iter`; quasi-separation —
the extreme coefficients are separation artifacts, not estimates). Per
the G4.3 lock the verdict never reads the logistic; the non-convergence
is reported honestly and **no mutual-adjustment inference is drawn**
(the analyzer's honest-non-convergence path, by design — it does not
silently regularize to fabricate an estimate).

### G4.5 / G5 — mechanical verdict and route
**VERDICT = `STOP-JOIN-INTEGRITY`.** Per D3: a covariate (`t`,
determinate-join 0.931 < 0.99) is join-unreliable → **do NOT route a
representativeness verdict.** This is a pre-registered outcome, not a
forced one. Three independent facts all say the instrument/run must be
repaired before a representativeness verdict can stand:
1. **(binding)** D3 `t` determinate-join 93.1 % < 99 %.
2. Under-powered: N_drop = 30 < 80.
3. Extraction-failure-dominated: 3800 pre-pick-skip vs 30 parse-drops.

**G5 route (no verdict forced; no auto-rerun — separately gated):**
repair the join/instrument as its **own future gated session** —
candidate fixes: a `t`-aware (dup-group) join refinement and/or
`normStem`/index strengthening, **plus** investigation of the
extraction-failure rate (why `extractQuestion` returned null/<2 options
~88 % of attempts — likely a live-DOM/practice-surface interaction, not a
dataset fact) — **then** a fresh bounded run. Per the gate: horizon
**item 2** (Geri judge `max_tokens`) **stays blocked**; **no `q.c`
flip, no `broken` change; Toranot untouched; the audit-7 truncation
route is unaffected.** Do not widen the \$20 cap; a sized follow-up (if
warranted post-repair) is its own pre-registered session.

### Provenance
Append-only; nothing above retro-edited. Analysis = the frozen
pre-registered tooling merged in PR #236 (`edfa433`), unmodified, run
once on the completed ledger; result JSON at
`chaos-reports/v4-long/audit8_20260518T191705Z/audit8_representativeness_result.json`
(gitignored runtime artifact; a durable snapshot of the full run dir is
preserved off-repo as the single-copy safeguard). Docs-only, **no
trinity bump** (mirrors audit-5/6/7 + #235/#236). Branch
`claude/term-audit8-run` → PR to `main`; **NOT self-merged** —
`docs/AUDIT*` is an audit-evidence path (tiered-merge rule) → web-lane
fresh-eye review against this on-main gate before merge (gate SHIP
clause; same rigor as #236).
