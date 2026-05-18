# Audit-8 — analysis tooling ⇄ gate crosswalk (PRE-REGISTRATION FREEZE RECORD)

**THIS IS NOT A GATE.** The single binding pre-registration is the merged,
on-`main` `docs/AUDIT8_PRE_REGISTERED_GATE.md` (#233, G0–G5 + DELTAS
D1–D4) plus its execution record `docs/AUDIT8_PRESTEP_INSTRUMENT_GATE.md`
(#235). This document re-derives **no** threshold, test, covariate, or
verdict rule. It transcribes each locked clause to the exact code site
that implements it, with file:line, so the web-lane fresh-eye reviewer
can check faithfulness against the gate **before any paid run**. If this
doc and the on-main gate ever disagree, **the gate wins and this doc is
the bug** (gate SHIP: "the data does not get to reshape it"; prestep
Reconciliation: "where they diverge, the merged gate wins").

Append-only (`feedback_spec_provenance_append_only`). Authored on
`claude/term-audit8-bounded-run` (cut from `origin/main` `cc85f91`),
**blind to any run data** — the bounded run has not been executed and
MUST NOT be until this tooling is merged and STEP 0.2 re-passes
(activation order is binding: G0 PRE-STEP PR → re-pass STEP 0.2 →
bounded run → RESULT). Trinity: **untouched** — `scripts/` + `tests/` +
`docs/` only, no bump (mirrors audit-5/6/7 + the #235 PRE-STEP).

The set-aside web-draft scripts (`build_stemhash_index.mjs`,
`analyze_pick_representativeness.mjs`) are **not on disk** in this tree
(prior instance pushed nothing; they were never committed here). They
are NOT used as a base. The tooling below is rebuilt from the on-main
gate clause-by-clause; only domain-neutral numerical methods (regularized
incomplete-gamma χ² tail, Fisher exact hypergeometric, Mann–Whitney U
normal approx, IRLS logistic) are implemented from standard references,
unit-pinned against hand-computed constants — nothing carried from the
set-aside criterion-swapped artifact.

---

## Files (locked product code; `scripts/` + `tests/`; no trinity bump)

| File | Role |
|---|---|
| `scripts/lib/audit8Stats.mjs` | Pure, side-effect-free numerical methods. Unit-pinned. |
| `scripts/build_stemhash_index.mjs` | Offline join index from `data/questions.json` — the path `scripts/lib/hashStem.mjs:3` already forward-references. |
| `scripts/analyze_pick_representativeness.mjs` | Frozen analyzer: G4.1 universe → G3 join → 6-cov family → Holm → floors → logistic sensitivity → G2 → G4.5 verdict. Reads a ledger dir; emits a structured report. **No data-dependent branch beyond the pre-registered ones.** |
| `tests/audit8Stats.test.js` | Stats vs known reference values (scipy-equivalent hand constants). |
| `tests/audit8AnalyzeRepresentativeness.test.js` | Universe/exclusion/join/verdict logic vs **synthetic** fixtures only — never real run data (pre-registration). |

---

## Clause ⇄ implementation crosswalk (binding source = on-main gate)

### Universe & outcome — gate **G4.1**

| Locked clause | Implementation |
|---|---|
| DROPPED (=1) = "dropped at the `:465` pick gate" = the invalid-parsed-pick path | rows where `type==='ai-parse-error' && context==='pick'` (instrumented `dropCtx:'pick-parse-error'`, bot `:480`). |
| RETAINED (=0) = "reached the judge" | `recordFinding` `finding` objects (bot `:709–724`); carry `disagrees` + full-stem `stemHash` (D4 / #235 item 6). |
| EXCLUDE pre-pick DOM/short-extract (`:448` class) — "not pick-parse events" | rows where `type==='pre-pick-skip'` (bot `:457`, `dropCtx:'pre-pick-short-extract'|'pre-pick-no-question'`). **Keyed on `type`, never on `context:'pick'` alone** (prestep P2: pre-pick shares `context:'pick'` with real drops). Counted via `log.extractNull` for an honest denominator; **not** analyzed for bias. |
| `:458` `ai-error/pick` network throws — "distinct path, reported separately, NOT in the parse-drop numerator" | rows where `type==='ai-error' && context==='pick'` (`dropCtx:'pick-ai-error'`, bot `:472`). Emitted as a **separate count**; excluded from the binary outcome's DROPPED cell. |
| `appIdx-null` `recordFinding` (passes pick gate, never reaches judge) | `context==='appIdx-null-post-check'` — neither DROPPED nor RETAINED; separate count (prestep item 5 gave it `stemHash` to keep this bookkeeping non-silent). |
| G3 join failures | counted, excluded, never imputed (G3). |

### Join fidelity — gate **G3 as superseded by D3**

| Locked clause | Implementation |
|---|---|
| Primary key = exact full-stem `stemHash`, "re-hash each `questions.json` stem with the bot's djb2" | `hashStem(normStem(q))` via the on-main SSOT `scripts/lib/hashStem.mjs` (imported, **not** re-implemented — the SSOT module exists to prevent a second drifting djb2). Also index `hashStem(normStem(q_en))` when `q_en` present, so a bilingual-toggled DOM extraction still joins; covariate values are variant-invariant and `stem_len` is **always** canonical `q` length per G4.2 (the matched variant never changes a covariate). |
| Fallback (2) = whitespace/BIDI-normalized stem-slice containment | normalized containment of the ledger row's `stem` slice (≤300) against `normStem(q)`/`normStem(q_en)`. |
| D3: global ≥95% is structurally unsatisfiable (3586/3743=95.81% ceiling; 157 byte-identical groups; `allow_dup`=936 **SANCTIONED — do NOT dedupe**) | no dedupe. Dup rows grouped by byte-identical `q`. |
| D3 new invariant: **per-covariate determinate-join rate ≥ 99%** after collapsing covariate-invariant dup groups; only covariate-**discordant** dup cells dropped | per covariate: a dup group all-agreeing on X joins determinately to X regardless of which member a row maps to; discordant groups drop **only that covariate's** cell (D3-verified discord: `broken` 2/157, `topic` 13/157, others 0). Each covariate's determinate-join rate computed and gated ≥99% independently; below 99% on a covariate ⇒ STOP+report for that covariate (D3 replaces the global-≥95% STOP). |

### Covariate family — gate **G4.2 as superseded by D1 + D2 → 6**

| # | Covariate | Operationalization (locked) | Primary test | Effect size / floor |
|---|---|---|---|---|
| 1 | `stem_len` | char length of canonical joined `q` | **Mann–Whitney U** (dropped vs retained) | **Cliff's δ**, floor \|δ\|≥**0.15** |
| 2 | `topic` | `ti` → repo's **12 `TOPIC_GROUPS`** (parsed from `shlav-a-mega.html:5082`, not hard-copied); expected-cell-<5 groups pooled to "other" **before** the test (locked) | **χ²** independence 2×k | **Cramér's V**, floor ≥**0.10** |
| 3 | `bilingual` | presence of `q_en` | **Fisher exact** 2×2 | **Cramér's V (φ)**, floor ≥**0.10** |
| 4 | `t` (was `year`) | **D1**: `t` field as **categorical** (18 levels), **same expected-cell-<5 pooling rule as `topic`** — NOT the superseded binary real-IMA-vs-AI Fisher | **χ²** independence 2×k | **Cramér's V**, floor ≥**0.10** |
| 5 | `c_accept` | **D2**: binary, non-empty `c_accept[]` | **Fisher exact** 2×2 | **Cramér's V (φ)**, floor ≥**0.10** |
| 6 | `broken` | **D2**: binary, `broken===true`. **Vacuity contingency**: analyzer computes `N_broken_served` over the joined universe; if `0`, `broken` is **vacuous → dropped from the family → Holm over 5**. (Empirical from the sample, NOT assumed from memory — `feedback_verify_simulator_findings`.) | **Fisher exact** 2×2 | **Cramér's V (φ)**, floor ≥**0.10** |

### Test family & sensitivity — gate **G4.3**

| Locked clause | Implementation |
|---|---|
| The marginal tests are the PRIMARY family; two-sided, α=0.05, **Holm–Bonferroni** across all | Holm over the 6 (or 5 if `broken` vacuous) marginal p-values; ordering + step-down per Holm (1979). |
| Joint logistic = **locked SENSITIVITY only**; **verdict NEVER keyed on the logistic** (locked to remove the post-hoc "which model" DOF) | logistic reported as sensitivity; the G4.5 verdict reads **only** the primary marginal family + floors. |
| **SURFACED REASONED RECONCILIATION (the one judgment call, non-apologetic per Working Rule 1).** G4.3's written formula `dropped ~ z(stem_len)+bilingual+C(topic_group)+ai_generated` is the **4-covariate-era** model; D1/D2 expanded the *family* to 6 and explicitly "supersede the G4.2 covariate table". The logistic's locked *purpose* is "whether a marginal signal survives **mutual adjustment**" — that purpose requires the adjusting set = the family, else it cannot adjust for `c_accept`/`broken`/`t` and the stated confound example generalizes. Faithful realization: the sensitivity model = the **locked family**: `dropped ~ z(stem_len) + bilingual + c_accept + broken + C(topic_group) + C(t_pooled)` (`t_pooled`/`topic` use the same <5 pooling as their marginal tests; `broken` dropped from the model too if vacuous). This **mirrors the gate's own D1/D2 precedent** (reconcile toward the authoritative/locked set, surface non-apologetically) and is **verdict-neutral** (G4.3 locks the verdict off the logistic). Recorded here and in the PR so the trail shows *why* the model is 6-term: faithful extension of a locked sensitivity purpose under D1/D2's family expansion — not scope creep, not a verdict lever. |

### Effect-size floors — gate **G4.4** (verbatim)
bias signal iff primary test **Holm-significant AND** effect ≥ floor:
Cliff's \|δ\|≥**0.15** (`stem_len`); Cramér's V≥**0.10** (every categorical).
Holm-sig but below floor = *detectable-but-negligible*.

### Verdict — gate **G4.5** (4-way, verbatim; stands per reconciliation)

| Condition | Verdict |
|---|---|
| ≥1 covariate is a bias signal (Holm-sig **and** ≥floor) | **BIASED** |
| ≥1 Holm-sig but **all** such <floor | **DETECTABLE-BUT-NEGLIGIBLE** |
| **0** Holm-sig **and** G2 min-N met | **REPRESENTATIVE** |
| **0** Holm-sig **and** G2 min-N **not** met | **INCONCLUSIVE** |

### Power / run-validity — gate **G2** (analyzer-side only)
`N_drop ≥ 80` **and** `N_retain ≥ 200` after the G3 join → "adequately
powered". Either unmet → under-powered → feeds the G4.5 INCONCLUSIVE
branch. `N_drop == 0` while the instrument is live → drop-rate-collapsed
**finding → STOP, report** (not an expected branch). The G1 budget /
G2 run-config ($20 cap, 1 worker, `claude-sonnet-4-6`, proxy, 8 h,
fresh `chaos-reports/v4-long/audit8_<ts>/`) is the **bounded-run
session's** concern — the analyzer only consumes the produced ledger.

---

## Pre-registration invariants the tooling enforces on itself

1. **Frozen before run.** No CLI flag, env var, or code path tunes a
   test, threshold, covariate, or verdict from observed data. The only
   data-conditional behavior is the **pre-registered** ones: `broken`
   vacuity (N_broken_served==0), expected-cell-<5 pooling, dup-group
   covariate-discord drop, join-fail exclusion, G2 power branch.
2. **Determinism.** Same ledger + same `data/questions.json` ⇒ identical
   verdict. No randomness, no time, no network.
3. **Read-only.** The analyzer flips no `q.c`, changes no `broken`,
   touches no Toranot file, appends **no** RESULT to the gate doc (the
   RESULT is appended by the bounded-run session per the gate's SHIP
   clause). It writes only its own report file.
4. **Verdict isolation.** The 4-way verdict function takes only the
   primary marginal family + floors + G2 N's. The logistic result is
   passed to the *report*, never to the verdict function (G4.3 lock,
   enforced by signature).
