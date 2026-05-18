# Audit-7 — chaos-doctor-bot v4 Option-0 EXECUTION (judge parse-failure histogram + route) — PRE-REGISTERED GATE

Written **before** the paid `long-chaos-run.sh` sample, and before reading
any histogram. Append-only; do not retro-edit
(`feedback_spec_provenance_append_only`). Lane: terminal, solo
(`claude/term-audit7-option0-run`). Trinity: **untouched** — docs-only,
no bump (mirrors audit-4/5/6: an audit that ships no product code does
not bump the version trinity).

This session is the **empirical terminus** of the audit-6 catch-chain
(`feedback_distrust_brief_frame_not_just_facts`: "if what remains is
running the thing and reading a number, no further design review can add
information — close it"). The Option-0 instrument shipped on PR #231,
survived three append-only reviewer precisions, and is test-pinned. Audit-7
**runs it once, reads the histogram, routes per the rule locked below.**
It re-litigates nothing and ships no fix.

---

## STEP 0 (distrust contract) — results

- **0.1** `git fetch --all`; clean tree (`git status --porcelain` empty).
  Branch `claude/term-audit7-option0-run` cut from `origin/main` HEAD
  `dac09e2`. Concurrent-lane scan: no `claude/web-*` branch on the bot or
  `scripts/lib/`; only this workstream's own `claude/term-audit*` remotes
  in the last 2 days. → solo terminal lane. ✅
- **0.2 INSTRUMENT-LIVE GATE (make-or-break)** — **initially FAILED, then
  resolved by explicit user direction.**
  - First read: PR #231 `state=OPEN, merged=null`. Per the kickoff this is
    a hard STOP ("Do NOT pay to run the un-instrumented bot"). Reported.
  - **Distrust-catch:** `scripts/lib/judgeShapeValidator.mjs` *did* exist
    on `origin/main` pre-merge — but as the audit-5/PR-#227 B5 version
    that does **not** emit `judge-shape-firstfail`
    (`git grep "judge-shape-firstfail" origin/main` → empty). A naive
    "does the validator file exist on main?" check would have **false-
    passed** this gate and sent money into an `underlying=0` run. The gate
    must be keyed off the `judge-shape-firstfail` emitter + the bucketer
    CLI, not the validator filename.
  - Resolution: the user (repo admin, kickoff author) explicitly directed
    "**Merge as written**" with a sound squash-vs-`--merge` rationale
    (gate-before-code is preserved at PR granularity here; #227 needed
    `--merge` only for *intra*-PR ancestry; no
    `feedback_spec_provenance_append_only` violation). That explicit
    instruction overrides the kickoff's general "ask the user / cannot
    self-merge" constraint. Merged squash+admin: **#230 → `2f47c27`**
    (docs gate), **#231 → `dac09e2`** (instrument). Both were
    `MERGEABLE/CLEAN`, all CI green (`validate`/`claude-review`/
    `js-integrity` SUCCESS; Supabase Preview SKIPPED = normal).
  - Re-verified instrument **live on `origin/main`**: `scripts/bucket
    JudgeParseFailures.mjs`, `scripts/long-chaos-run.sh`,
    `scripts/lib/judgeShapeValidator.mjs`,
    `tests/chaosBotV4BucketRule.test.js` all present;
    `judge-shape-firstfail` emitter present
    (`scripts/lib/bucketParseFailures.mjs` + `judgeShapeValidator.mjs`);
    bucketer bucket names match the four-bucket rule
    (`truncation`/`wrong_shape`/`genuine_prose`/`ambiguous`, plus
    `empty`/`unknown` recovered-context extras — names match, no mapping
    needed). ✅
- **0.3** Audit-5/6 floor green: full `npx vitest run` → **75 files /
  1426 passed / 7 skipped / 0 failed**. Audit-6 instrument pin trio
  (`chaosBotV4BucketRule.test.js` + `chaosBotV4JudgeShapeValidator.test.js`
  + `chaosBotV4ParseFailureTelemetry.test.js`) isolated → **3 files / 38
  passed**. (Kickoff's "15-pin judge-shape suite" = brief-not-ground-
  truth; real isolated counts recorded here instead.) ✅
- **0.4** Read `docs/AUDIT6_STEP0_scope_blocked_2026-05-18.md` incl. all
  three append-only precisions (truncation keyed off `stop_reason` not
  branch; the fork is ternary→four-bucket not binary; POPULATION =
  underlying first-attempt, not the ~7% residual), plus
  `feedback_toranot_proxy_strips_structured_output` and
  `feedback_distrust_brief_frame_not_just_facts`. Terminus acknowledged:
  the instrument design has bottomed out to empirical; audit-7 does not
  add a "next finding." ✅
- **0.5** `scripts/long-chaos-run.sh:41` `export CHAOS_USE_PROXY=1`
  confirmed (hard-coded). Bounded sample = script-calibrated defaults:
  **1 worker** (proxy 429s on 3+), **4 h** (`CHAOS_DURATION_MS=
  14400000`), **`claude-sonnet-4-6`**, `CHAOS_REPORT_RATE=0.0`
  (read-only, no bug filing), report dir `chaos-reports/v4-long`. Script
  header states expected cost **$5–8**, default cap **$25**.
  `feedback_chaos_bot_cost_cap_per_process`: the cap is per-Node-process
  across workers — with 1 worker, per-process == actual, so the cap binds
  exactly. Emit wiring confirmed operationally (not design review):
  `judgeWithShapeRetry` called at `chaos-doctor-bot-v4.mjs:566` with
  `log` passed; firstfail rows `log.bugs.push`'d; ledger flushed to
  `chaos-reports/v4-long/medical_findings_ai_v4.jsonl`. ✅

→ **STEP 0 PASSED. Paid run authorized against a verified-live instrument.**

---

## THE LOCKED GATE (binding; no post-hoc adjustment)

### G1 — Budget
Cap = **$20 USD**, enforced via `CHAOS_COST_CAP_USD=20` (overrides the
script default of 25 to honor the kickoff's pre-registered ≤ $20).
Expected $5–8 per the script header → the bound does **not** clearly
exceed $20, so **no pre-emptive STOP**. If actual spend exceeds $20 →
STOP, report partial.

### G2 — Run-validity
The bucketer's `summary.total` (UNDERLYING first-attempt judge failures)
**must be > 0**. If `summary.total == 0` → the run hit an
un-instrumented / pre-instrument ledger → **STOP, do NOT re-pay**, report.
(0.2 verified the instrument is live, so total=0 would itself be a
finding, not an expected branch.)

### G3 — Reconciliation invariant
`summary.reconciliation.match` **must be `true`** — the
`judge-shape-firstfail` `recovered:false` count must equal the
independent `ai-parse-error`/`context:judge` count 1:1. `MISMATCH` ⇒
instrument drift / mixed ledger → **STOP, do not route.**

### G4 — Decision rule (locked; the histogram does NOT get to reshape it)

**G4.1 Population.** Bucket the **UNDERLYING** population = **ALL**
`judge-shape-firstfail`/`context:judge` rows, recovered or not =
`summary.counts`. **NEVER** bucket `ai-parse-error` rows — that is the
~7% double-failure residual, the wrong population (the exact error
audit-6 spent three precisions fixing). `residual_counts` and the
reconciliation line are **diagnostics only**, never the routing basis.

**G4.2 Four buckets** (PR #231 / AUDIT6 corrected grid — truncation keyed
off `stop_reason`, NOT the parse-branch):

| `(first_stop_reason, first_branch)` | Bucket |
|---|---|
| `max_tokens`, **any** branch | **truncation** |
| `end_turn` + `no_brace` | **genuine_prose** |
| `end_turn` + `parsed` (malformed-but-complete) | **wrong_shape** |
| `end_turn` + `unbalanced` **or** `parse_threw` | **ambiguous** |

**G4.3 Resolve `ambiguous` BEFORE `genuine_prose` is final.** Transient
one-time eyeball of the raw text of **only** the `ambiguous` bucket
(both `unbalanced` *and* `parse_threw` cells — not `parse_threw` alone;
the earlier "shrink" was corrected in AUDIT6). Geriatrics is a board-exam
study app → MCQ adjudication content, **no patient PHI** (contrast
ward-helper); a one-time read of the single ambiguous bucket is within
the retention carve-out. Reassign each ambiguous row → `wrong_shape`
(malformed-but-complete JSON) or `genuine_prose` (prose with incidental
braces).

**G4.4 PRIMARY QUESTION — binary, locked now:** after `ambiguous` is
resolved, **is `genuine_prose` the strictly dominant (plurality)
bucket?**
- **NO →** ZERO Toranot. Route **Geri-side only**: truncation-dominant →
  judge `max_tokens` bump / verdict-schema trim (works through the
  *existing* proxy — proxy forwards `max_tokens`); wrong_shape-dominant →
  judge prompt/schema tweak. §4/Toranot does **not** reopen.
- **YES →** §4 (AUDIT6) reopens, and there **option 2 only**
  (`output_config.format` Toranot whitelist). Option 3 is strictly
  dominated on every axis — discarded, not a choice. The
  filesystem-grounded fresh-eye on the §2 proxy read becomes a
  precondition *here*.

**G4.5 Inconclusive.** If no bucket is a clear plurality (top-two margin
within run noise) → report the histogram **inconclusive**, recommend a
larger sample, **do NOT force a route**. "No Toranot" remains firm
whenever `genuine_prose` is clearly not dominant — even if
truncation-vs-wrong_shape is itself ambiguous, the only thing that costs
a cross-repo decision is genuine_prose dominance, and that is the binary
pinned here.

---

## SCOPE

Diagnosis + route **only**. Ships **no fix**. Flips **no `q.c`**. Changes
**no `broken` flag**. Touches **no Toranot file**. The fix (whichever
G4.4 branch) is a separate session with its own pre/post gate and its own
fresh verification run.

## SHIP

Tracked, **docs-only**, append-only audit-5/6 style: **this gate doc**
(committed pre-run) + a **post-run RESULT** section appended after the
sample (histogram, reconciliation pass/fail, ambiguous resolution, the
route per G4, recommended next session). No trinity bump. PR to `main`
from `claude/term-audit7-option0-run`; do not self-merge the audit-7 PR
(normal PR discipline; the #230/#231 merge was a discrete explicit
user instruction, not a precedent for self-merging this one).

## OUT OF SCOPE (handed off untouched — unchanged from audit-5/6)

**B4 content adjudication (37 distinct Qs — 4 real-IMA + 33
AI-generated).** Different axis (content, not bot-reliability). **Still
handed off untouched — NOT this session, NOT a queue.** No `q.c` flip,
no `broken` change, no distractor regen.

---

## [2026-05-18, appended pre-run] MODEL-LINEAGE precision — baseline and sample are BOTH sonnet-4-6

Append-only precision (`feedback_spec_provenance_append_only`); the
STEP-0 0.5 line above stands as written (it correctly recorded the
script-default model) — this section adds the **lineage check** that
0.5's self-checks did not explicitly close. Raised as the single open
item against the kickoff while the run was still shallow (29 ledger rows,
0 firstfail) → resolved here from primary source **before** the sample
deepened; no kill/restart needed. This is the frame-distrust rule
(`feedback_distrust_brief_frame_not_just_facts`) recursing onto model
identity — exactly the class it warns about.

**The concern.** `AUDIT6_STEP0_scope_blocked` §2a reasons from
`MODEL = claude-opus-4-7` (`chaos-doctor-bot-v4.mjs:112`). The audit-7
run is on `claude-sonnet-4-6`. If the ≈26% baseline the Option-0
instrument decomposes was an *opus-4-7* population while audit-7 measures
a *sonnet-4-6* one, G4 would route off a model the baseline never
measured (failure-mode composition is strongly model-dependent even
though the bucket *grid* is model-independent).

**Verified — lineage is INTACT (primary source, both ends):**

- `chaos-doctor-bot-v4.mjs:112` = `process.env.CHAOS_MODEL || 'claude-opus-4-7'`. `:173` `model: MODEL` — one model for pick/explain/**judge**.
- `scripts/long-chaos-run.sh:45` = `export CHAOS_MODEL="${CHAOS_MODEL:-claude-sonnet-4-6}"`. The bare `:112` opus default only applies when the bot is run *without* `long-chaos-run.sh`.
- **audit-3 baseline** (`chaos-reports/v4/audit3_caccept_fix_2026-05-17/` AUDIT3_REPORT.md): "`CHAOS_MODEL=claude-sonnet-4-6`", "MODEL=sonnet-4-6", "- Model: claude-sonnet-4-6". The ≈26% / 86-disagree / 22-B5 baseline is a **sonnet-4-6** population.
- **audit-7 run** (its own console banner, `bb59uhtll.output`): `[v4] Launching 1 workers × 240 min, model=claude-sonnet-4-6`. **sonnet-4-6.**

→ baseline sonnet-4-6 ≡ sample sonnet-4-6. The instrument decomposes the
same model's failure composition it was calibrated against. **G4
consumes a self-consistent population.**

**The §2a opus reference is a non-load-bearing imprecision.** It
conflated the bot's *bare* `:112` default with "the practical run
mode," when the practical run mode = `long-chaos-run.sh` (which the
*same* doc cites at line 266 for `CHAOS_USE_PROXY=1`) sets sonnet-4-6 at
`:45`. §2a's opus reasoning was scoped to the **prefill fallback** — a
mechanism the brief itself rejected, whose "not viable" conclusion holds
on *both* models via the proxy strip regardless. It changed **zero**
audit-6 conclusions. **Constraint for the RESULT:** do not propagate
"opus-4-7" into any audit-7 route reasoning — the measured and routed
model is **sonnet-4-6**, and the eventual fix (whichever G4 branch)
targets the sonnet-4-6 judge in the `long-chaos-run.sh` practical run
mode.

---

# [2026-05-18, appended post-run] RESULT — truncation-dominant (55/55, 100%) → ZERO Toranot, Geri-side route

Append-only (`feedback_spec_provenance_append_only`). The gate above was
locked **before** this sample; nothing above is retro-edited. The route
below is the **mechanical output of the pre-registered G4**, not a
post-hoc judgement.

## The run

`bb59uhtll` exit 0, full 4 h (no cost-cap trip). **Spend $9.74** (2096
calls, 1 network failure) — above the script header's $5–8 estimate,
**under the pre-registered $20 cap → G1 PASS**. Model `claude-sonnet-4-6`
(banner-confirmed; lineage precision above). Isolated dir
`chaos-reports/v4-long/audit7_2026-05-18/` (advisor contamination catch
held — fresh ledger, no stale-row inheritance). Top-line: **judged=569**,
methodology=0, source-checks=271.

## Gate evaluation

| Gate | Result |
|---|---|
| **G1** budget | $9.74 < $20 → **PASS** |
| **G2** validity | bucketer `total = 55` > 0 → **PASS** |
| **G3** reconciliation | `firstfail_unrecovered=0 == ai_parse_error=0`, `match:true` → **PASS** |

**G2 file-location detour (recorded honestly, not buried).** STEP 0.5
verified the `judge-shape-firstfail` *emit* into `log.bugs` and the
call-site wiring, but stopped the trace at the "terminus" and did **not**
establish *which persisted file* `log.bugs` lands in. It does **not**
land in `recordFinding`'s `medical_findings_ai_v4.jsonl` (that is the
per-question findings ledger) — it serializes into the per-worker
`bugs[]` of the full-run report `chaos-doctor-v4-<ts>.json`. First read
of the findings JSONL showed 0 firstfail rows; this was a plumbing
artifact, **not** a G2 STOP. Resolved by extracting `workers[*].bugs` →
`bugs_extracted.jsonl` (207 bug rows: 55 `judge-shape-firstfail/judge`,
64 `ai-parse-error/pick`, 1 `ai-error/judge`, 37 http, 37 console:error,
13 stuck-refresh) and feeding the **test-pinned** `bucketJudgeParse
Failures.mjs` (single source of truth, `tests/chaosBotV4BucketRule.test.js`,
38/38 green) — i.e. the result is exactly what a fully-traced setup would
have produced. Lesson for memory: the terminus rule needs an explicit
*operational-verification ≠ design-re-litigation* carve-out — "which file
does `log.bugs` persist to" is plumbing the run depends on, not design
review, and should be closed in STEP 0.5 even when the design is at
terminus.

## UNDERLYING histogram (decision input — 55 first-attempt judge failures)

```
total=55
counts:      truncation=55  genuine_prose=0  wrong_shape=0  ambiguous=0  empty=0  unknown=0
grid:        max_tokens|no_brace = 51
             max_tokens|unbalanced = 4
residual:    all 0   (recovered:false subset — every first failure was retry-recovered)
reconciliation: firstfail(recovered:false)=0 vs ai-parse-error/judge=0 -> OK
```

**Both grid cells are `first_stop_reason == max_tokens` → bucket
`truncation` for ANY branch.** The 4 `max_tokens|unbalanced` rows are
length-cuts (the `{` never balanced because the response was truncated
mid-JSON), **correctly truncation — NOT ambiguous.** This is precisely
the case the third AUDIT6 append-only precision ("truncation keyed off
`stop_reason`, NOT the branch") exists to get right: the obsolete
branch≡class shorthand would have mis-routed these 4 into the eyeball
bucket and inflated the Toronot-gating count.

**Validation that 100%-truncation is a real measurement, not a stuck
field:** `first_stop_reason` is constant (`max_tokens` ×55) but
`first_branch` varies **independently** (`no_brace`=51, `unbalanced`=4) —
a degenerate/stuck instrument cannot produce two independently
distributed signals. Timestamps spread 05:39:26Z → 09:28:24Z across the
whole ~4 h run (real accrual, not a launch cluster). All 55
`recovered:true`, consistent with `ai-parse-error/judge=0`.

**G4.3 ambiguous eyeball: VACUOUS.** `ambiguous=0` — there are zero
`(end_turn, unbalanced)` or `(end_turn, parse_threw)` rows. Nothing to
eyeball; the raw-text inspection step is not reached. Stated explicitly
so the audit trail shows the step was *evaluated and empty*, not skipped.

## THE ROUTE (mechanical output of pre-registered G4.4 — binary, no post-hoc adjustment)

**PRIMARY QUESTION: is `genuine_prose` the strictly dominant bucket?**
`genuine_prose = 0 / 55`. **NO** — it is empty; `truncation` is 100%.
55-vs-0 is maximal separation → **not G4.5-inconclusive.**

→ **ZERO Toranot. Geri-side route only:** truncation-dominant ⇒ **bump
the judge `max_tokens` (currently 400 — `judgeWithShapeRetry({maxTokens:
400})`, both the original and the cap=1 corrective re-ask) and/or trim
the required verdict schema.** This works through the *existing* proxy
(`netlify/edge-functions/claude.ts` forwards `max_tokens`, `clampInt(...,
256, 32768)` — 400 and a bump both pass). **§4 / AUDIT6's structured-
output cross-repo Toranot decision menu does NOT reopen.** The
filesystem-grounded fresh-eye on the §2 proxy read is **not** triggered
(it was a precondition only for the genuine_prose branch).

This **empirically confirms the AUDIT6 frame-distrust hypothesis**
(`feedback_distrust_brief_frame_not_just_facts`): the original brief
frame ("force structured output at the API layer", the 3-option
cross-repo Toranot security menu) was scoped to a failure mode the data
shows is **0% of the population**. Structured output constrains grammar,
not length; it is provably inert against 100%-truncation. The entire
cross-repo security conversation is moot for the measured reality.

## Calibration notes (recorded, not over-defended)

- **Rate delta — NOT a validity concern.** Sample first-fail rate =
  55/569 ≈ **9.7%**, vs the audit-3 ~26% baseline. G4 is locked as
  *composition*-based precisely so absolute rate is irrelevant: a
  measurement of `0 of 55` in `genuine_prose` bounds that bucket's
  population share tightly **regardless of overall rate**, and the route
  is invariant under any rate-scaling (the composition would have to flip
  *qualitatively*, not merely shift in magnitude, to change it). Plausible
  causes of the delta (not load-bearing): sample config differs (1 w / 4 h
  / proxy vs audit-3's 10 w / 25 min); the v10.64.113/114 prompt re-skin
  + operability fixes landed between audit-3 and now. Recorded; route
  stands.
- **Audit-5 floor: GROUNDED (verified, not inferred).** 568/569 findings
  carry a boolean `judge.app_answer_correct`; the **single** absent one
  is exactly the **1 `ai-error/judge`** (a network throw →
  `judgeWithShapeRetry` returns `{}` — a distinct path, not a shape
  failure). So the cap=1 retry recovered **100% of the 55 first-attempt
  shape failures into shape-valid verdicts the bot consumed.** Production
  is therefore **not currently losing judge verdicts to shape failure** —
  the audit-5 defense-in-depth floor is working. The `max_tokens` fix
  removes the *root cause* (so the retry stops being load-bearing and the
  judge's first attempt succeeds), but this is a robustness/cost
  improvement, **not an active-incident fix.** Severity calibrated
  accordingly.

## Recommended next session (the fix — NOT this session)

Geri-side judge `max_tokens` bump (from 400; size it against the verdict
schema + a board-level rationale — the AUDIT6 doc floats ~1200) and/or
verdict-schema trim, on `scripts/lib/judgeShapeValidator.mjs` /
`chaos-doctor-bot-v4.mjs:566`. Its own pre/post gate, its own fresh
bounded verification run (metric: first-attempt `validateJudgeShape` OK
rate ↑, `judge-shape-firstfail/truncation` ↓). Separate branch/session;
ships product code so it bumps no trinity either (scripts/tests, mirrors
audit-5).

## OUT OF SCOPE (handed off untouched)

- **B4 content adjudication (37 Qs).** Unchanged from audit-5/6 — NOT
  this session, NOT a queue.
- **Pick-channel parse failures.** `ai-parse-error/context=pick = 64/569
  ≈ 11.2%` this run. A **separate channel** (the bot's answer-selection
  call), explicitly **not analyzed and not bucketed here** (audit-7 is
  judge-channel only; the bucketer's `context==='judge'` filter correctly
  excludes it). Flagged so a future reader does **not** infer pick-channel
  cleanliness from this judge-only "0 ai-parse-error" analysis — it is
  **not** clean; it is unexamined. Its own workstream if pursued.

## SHIP

Docs-only (this gate doc, gate+RESULT as one PR per audit-5/6). No
trinity bump. No `q.c` / `broken` / Toranot / product code touched.
Branch `claude/term-audit7-option0-run` → PR to `main`; do **not**
self-merge (normal PR discipline; the #230/#231 merge was a discrete
explicit user instruction, not a precedent).

---

## [2026-05-18, appended post-review] PICK-CHANNEL contamination DIRECTION resolved + horizon re-prioritized

Append-only (`feedback_spec_provenance_append_only`); the OUT OF SCOPE
section above stands — this **sharpens** the pick-channel horizon from
"flagged, its own workstream if pursued" to a named, direction-resolved,
**higher-priority** item. Caught in user review: "newly flagged, not
engaged" undersold a finding with retroactive reach into every audit
since audit-3.

**Verified mechanism (not inferred).** `scripts/chaos-doctor-bot-v4.mjs:461-467`:
on pick-channel parse failure (`aiIdx == null || out-of-range`) the bot
logs `ai-parse-error/context=pick` and **`return { advanced:false }`
immediately** — *before* the option click, `detectAppAcceptedDisplay
IdxSet`, the `disagrees` computation (L519), `recordFinding`, and the
judge call (L566). **Contamination direction = DROP, not
spurious-`disagrees`.** The spurious-`disagrees:true` path posited in
review **does not exist**: `disagrees` is computed only for picks that
passed the L466 validity gate. A failed pick yields *no finding row*.

**Corrected reach.** Not false-positive contamination of audit-4's 86
adjudicated rows (that path is unreachable). Instead **selection /
survivorship bias**: ~11.2% of attempted questions this run (64/569-scale)
were silently excluded from the adjudicated population, and this has held
every audit since audit-3 (whose `disagrees:true` set is computed from
the pick channel's `aiIdx`). The open question: **is the dropped ~11%
missing-completely-at-random, or correlated with stem length / topic /
bilingual status** — i.e., is the audit-3/4/5/7 `disagrees` population
representative or a biased subsample?

**Re-prioritized next-workstream list (two items, not one):**

1. **[higher — foundational] Pick-channel `disagrees`-representativeness
   check.** Quantify pick-parse-failure rate over a bounded run; test the
   dropped set for correlation with stem length / `ti` / bilingual /
   year. Decides whether *the right rows are being judged at all* —
   logically prior to any judge-verdict fix. Own session + gate.
2. **[lower] Geri-side judge `max_tokens` bump** (from 400) /
   verdict-schema trim, as framed in the RESULT. Only governs whether
   judge verdicts *emit*; moot if the adjudicated population itself is
   biased. Own session + gate + fresh verification run.

Neither is this session. B4 (37 Qs) remains untouched and is **not** on
this list. The audit-7 route (RESULT above) is unaffected — it consumes
the *judge* channel; this is a *pick*-channel selection question that
sits upstream of, and orthogonal to, the truncation route.
