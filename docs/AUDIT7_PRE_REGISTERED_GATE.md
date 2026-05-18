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
