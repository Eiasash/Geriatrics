# AUDIT-8 G5(a) §4.B — `bilingual` flag characterization (DOCUMENT-only — artifact-vs-real within existing data, NO self-merge)

## Scope & method (a characterization, not a run)

The §4.B bounded re-cert of `docs/AUDIT8_G5a_REPAIR_GATE.md` (appended 2026-06-10)
returned `aggregateVerdict = BIASED` with the biased axis MOVED from `t` to a new,
explicitly **under-powered** `bilingual` flag (φ=0.102, `Ndrop=30 < 80`). The §4.B
RESULT flagged this as "its own separately-gated characterization session." This document
**is** that characterization. It strictly stays within already-persisted local artifacts
($0, no rerun), concludes **artifact-vs-real**, and — like the G5(b) doc (#362) it is
modeled on — runs no bot, changes no analyzer, flips no `q.c`, and touches no `broken`
flag. Every number is cited to its artifact (`feedback_verify_mechanism_claims_not_assert`).

## Provenance (cited)

- **Re-cert run:** `chaos-reports/v4-long/audit8g5a_recert_20260609T221558Z/` (gitignored,
  read-only). 1 worker, `claude-sonnet-4-6`, Toranot proxy, 8 h wall, `CHAOS_COST_CAP_USD=20`
  not widened. Actual **$19.21**, 4023 calls, 0 failures (`chaos-doctor-v4-2026-06-10T06-16-40-425Z.json` `cost`).
- **Bot:** `main` @ `736b78d` (#355 `pickParse` + #356 E-contract + #357 record).
- **Corpus:** `corpus_runstart_c34cc4e0776cd256.json` (4297 rows); `recordedSha == currentSha
  == c34cc4e0…806`; `qIdxTrusted=true` (`audit8g5a_representativeness_result.json`
  `corpusIdentity`). Bilingual is defined exactly as the analyzer does
  (`scripts/build_stemhash_index.mjs`): `bilingual = !!(row.q_en && q_en.trim().length)`
  — `q_en` only, **not** `o_en`.
- **Analyzer:** `scripts/analyze_pick_representativeness.mjs`, schema
  `audit8-representativeness-result/1`. Power floors `MIN_N_DROP=80`, `MIN_N_RETAIN=200`,
  `FLOOR_V=0.10`; `biasSignal = holmReject && |effect|≥floor` (`:389`).
- **CERT (pre-fix) baseline:** `docs/AUDIT8_G5_REPAIR_GATE.md` CERT RESULT (`:1256`) —
  `bilingual` Fisher 2×2 `[[15,32],[567,581]]`, raw p=0.025, **pAdj=0.099, φ=0.068, no
  signal**; `Ndrop=47`, `Nretain=1148`. The CERT run dir
  `chaos-reports/v4-long/audit8cert_20260607T205756Z/` is present on this machine, but its
  `corpus_runstart` snapshot is **not** saved and its corpus sha (`2b26d358…`) differs from
  the recert's — so all cross-run member-level work below keys on **`stemHash`**
  (text-derived, corpus-independent), never on raw qIdx across corpora.

## 1. Member-level recomputation (exact counts, recomputed from disk)

Recomputed with the repo's own libs (`scripts/lib/hashStem.mjs`, `scripts/lib/extractJson.mjs`,
`scripts/build_stemhash_index.mjs` join rules) — no re-implementation.

**Drop side — `[5, 25]` VERIFIED member-level.** The 30 `ai-parse-error/pick` drop rows
(`chaos-doctor-v4-*.json` `workers[0].bugs`, filtered `type=ai-parse-error ∧ context=pick`)
each carry a trusted `qIdx`. Joining `qIdx → corpus[qIdx].bilingual`:

| | bilingual | mono | total |
|---|---:|---:|---:|
| **drop (events)** | **5** | **25** | **30** |

Matches the analyzer's `[[5,25],…]` exactly.

**Retain side — `[578, 593]` VERIFIED, with one documented exclusion.** The 1172 judged
rows (`medical_findings_ai_v4.jsonl`) carry `stemHash`. Joining each via the `byHash` index
(djb2 of normalized `q` **and** `q_en`, per `build_stemhash_index.mjs`), all 1172 join
determinately and split **[579, 593]**. Exactly **one** of those rows has `appIdx==null`
(bilingual=true) and is the ledger's `N_appIdxNull_excluded=1` — the analyzer drops it from
the retain set, giving the published **[578, 593]** (`Nretain=1171`). The off-by-one is fully
accounted for.

**φ reproduced.** `φ([[5,25],[578,593]]) = −0.102085`; the analyzer reports
`effect = 0.10208534…`, `pAdj = 0.0016197`, `holmReject=true`, `meetsFloor=true`,
`biasSignal=true`. The sign is negative: **bilingual questions are UNDER-represented in the
drop channel** (16.7% of drops vs 49.4% of retains). Under independence the drop row would
carry **14.6** bilingual events; **5** were observed.

## 2. Bucket × bilingual cross-tab (`classifyExtractFailure` over the 30 drop texts)

Classifying each drop's post-retry `text` with `scripts/lib/extractJson.mjs`
`classifyExtractFailure`, plus the `parsed_bad_field` overlay:

| bucket | bilingual | mono | total |
|---|---:|---:|---:|
| `no_brace` | 5 | 25 | **30** |
| `unbalanced` | 0 | 0 | 0 |
| `parse_threw` | 0 | 0 | 0 |
| `parsed_bad_field` | 0 | 0 | 0 |
| `empty` | 0 | 0 | 0 |

**All 30 residual drops are a single bucket: `no_brace`** — pure prose chain-of-thought with
no JSON `{` at all (even after the one corrective retry). This is exactly the "designed
residual" the pre-flight smoke recorded. The recoverable buckets the G5(a) fix targeted
(`unbalanced` truncation, `parse_threw`, bare-letter, 5-option E-suppression) are **empty** —
corroborating that the lever worked and the residual is a different, harder class (the model
narrates and never emits the contract JSON). The bucket axis therefore carries **no**
bilingual discrimination: bilingual is distributed across the single bucket in the same 5:25
ratio as the whole drop channel.

## 3. Pseudoreplication & cross-run (drop)stability — the load-bearing finding

The event-level counts hide severe non-independence. Counting **distinct stems**:

- **recert:** 30 drop events = **9 distinct stems** (3.33 events/stem). Repetition
  `{675:1, 2064:4, 2515:4, 2548:4, 2556:1, 2855:4, 2982:4, 3092:4, 3328:4}`. Distinct-stem
  bilingual composition = **2 bilingual / 7 mono**.
- The "5 bilingual drops" are therefore only **2 distinct questions** — qIdx **2064 (×4)** and
  qIdx **675 (×1)**, both `t=Hazzard`, both `optCount=4`. One repeated question accounts for
  4 of the 5 bilingual-drop "events."
- **CERT:** 47 drop events = **13 distinct stems** (3.62 events/stem); distinct-stem bilingual
  = 5 / 8 (via recert-corpus stemHash join).
- **Cross-run drop-stem overlap = 1.** Of the recert's 9 distinct drop stems, exactly **one**
  also dropped in CERT. The two runs' drop sets are nearly disjoint.

So the Fisher 2×2 treats `n=5` bilingual drops as 5 independent observations, but the
*effective* independent count is **2 distinct bilingual stems**, one of which is replicated
four times. The drop channel is not a stable set of "hard bilingual questions" — it is a
small, largely run-specific set of prose-CoT incidents.

(As an independent check, the CERT drop cell **[15,32]** reproduced exactly when its drop
stemHashes were resolved through the recert corpus — confirming the inlined CERT figures and
that those stem texts are stable across the two corpora.)

## 4. The direction-flip mechanism — with corrected arithmetic

The §4.B RESULT's first-pass mechanism gloss was **inverted** and corrected in that doc's
`## Corrections` (2026-06-10). Corrected arithmetic, from the two runs' marginals:

| | CERT (47) | recert (30) | Δ (removed) |
|---|---:|---:|---:|
| bilingual drops | 15 | 5 | **−10** |
| mono drops | 32 | 25 | −7 |
| **bilingual share of drops** | **31.9%** | **16.7%** | — |

The G5(a) de-bias removed 17 drop events; **10 of the 17 were bilingual (58.8%)** — a slice
far more bilingual than the drop channel's own 31.9% bilingual share. This is coherent with
the fix's design: #355/#356 specifically recover 5-option/E and bilingual-surface parses,
so the fix preferentially recovers **bilingual** drops. Removing a 59%-bilingual slice from a
32%-bilingual channel drives the residual drop channel **more mono** (bilingual share
31.9% → 16.7%), while the retain-side bilingual rate stays ~49.4%. The gap between
drop-bilingual (16.7%) and retain-bilingual (49.4%) **widens**, sharpening a pre-existing,
sub-threshold negative association (φ 0.068, pAdj 0.099 — already present in CERT, just under
the floor) into a just-over-threshold one (φ 0.102, pAdj 0.0016).

**Critical caveat (`feedback_cross_tab_not_derived_delta`):** "10 of 17 recovered were
bilingual" is a **between-run marginal subtraction** of two independently-sampled runs whose
drop sets overlap by exactly **1 stem**. It is a valid description of the *rate/composition*
change, but it is **not** 17 identifiable questions that moved drop→retain. The mechanism is a
distributional shift in a shrinking, noisy channel — not a tracked per-question recovery.

## 5. Alternative explanations considered

1. **Composition artifact of the `t` de-bias (best-supported).** The signal is fully explained
   by §4: the fix preferentially recovered bilingual drops, pushing the residual channel more
   mono and sharpening a CERT-era sub-threshold near-miss across the 0.10 floor. The negative
   sign (bilingual *under*-dropped) is consistent with the fix removing the bilingual-favoring
   drop classes. The φ jump 0.068→0.102 is a floor-crossing of a contrast that already existed
   pre-fix.
2. **Real bilingual-surface parse effect (not excludable, not supported at this power).** A
   genuine effect would predict a *stable* set of bilingual drop stems across runs. Instead,
   drop-stem overlap is 1, the 5 bilingual drops are 2 distinct questions (one ×4), and the
   residual bucket is uniformly `no_brace` prose-CoT — a content-agnostic failure mode with no
   obvious bilingual mechanism. Evidence leans against, but n is too small to exclude.
3. **Small-n / pseudoreplication noise (co-primary with #1).** φ clears the floor by **0.002**
   at an effective ~2 distinct bilingual drop stems; one fewer ×4-replicated bilingual draw
   would drop the cell to ~1 and collapse the signal. At `Ndrop=30` with 3.3× replication this
   is squarely within sampling jitter.

**Reading:** #1 and #3 jointly account for the signal; #2 is neither certifiable nor
dismissible at this power.

## 6. Power analysis (honest arithmetic)

Target: detect φ ≥ 0.10 at 80% power, α=0.05, df=1.

- Non-centrality for 80% power: λ\* = (z₀.₉₇₅ + z₀.₈₀)² = **7.849**.
- **Naive Cohen's-w total-N:** N = λ\*/φ² = 7.849 / 0.01 = **785**; the run already has
  N_total = 1201 > 785. **This is the wrong instrument here and the analyzer correctly does
  not use it:** the bilingual×drop association lives entirely in the 30-event drop margin, and
  5 of those events are 2 distinct questions. Asymptotic χ² validity (expected drop cells
  14.6/15.4 > 5) is met, but *estimate stability* is not — which is why the gate floors on the
  rare margin, not on N_total.
- **Analyzer's operative floor:** `MIN_N_DROP = 80`. At the observed rate (30 drops / 8 h /
  $19.21 → 3.75 drops/h, $0.640/drop), reaching `Ndrop = 80` costs **~21.3 h and ~$51** —
  >2.5× the $20 cap.
- **Effective-independent budget (the honest number):** at ~3.3 drop *events* per distinct
  stem, 80 *distinct* drop stems ≈ **264 events ≈ 70 h ≈ $169**. To power the test on
  independent bilingual-informative drops, the real cost is ~8–9× the cap.

Either way, `Ndrop ≥ 80` (let alone 80 independent stems) is **unreachable at the locked $20 /
8 h budget**, exactly as the §4.B power-honesty clause pre-registered.

## 7. Verdict (scoped to evidence)

**Consistent with a de-bias composition artifact; not adjudicable at the closed budget.**
The `bilingual` flag is a direction-flip artifact of the G5(a) `t` de-bias (the fix
preferentially recovered bilingual drops, mono-enriching the residual channel and sharpening a
CERT-era sub-threshold near-miss). It is **not certifiable as a real bilingual-surface bias**
and **not dismissible as definitely noise**: φ=0.102 crosses the decision floor by only
**0.002**, on a drop cell of `n=5` that is effectively **2 distinct questions** (one
replicated 4×), with cross-run drop-stem overlap of 1 and a uniformly content-agnostic
`no_brace` residual bucket. `g2.powered=false` (`Ndrop=30 < 80`); the magnitude must not be
leaned on. The aggregate `BIASED` verdict stands on this under-powered axis only — `t`'s
signal is eliminated (V 0.190→0.087, below floor; `biasSignal` true→false).

## 8. Explicit DO-NOTs

- **No `q.c` flip.** This is the bot's pick-parse **drop channel**, not a content/answer-key
  defect — and `no_brace` prose-CoT is a model-output-shape failure, not a wrong key.
- **No `broken` change**, no `c_accept` change, no curator-override touch.
- **No rerun.** The $20 cap is closed and is **not** to be widened; `Ndrop≥80` is unreachable
  within it, and ~80 *independent* drop stems would cost ~$169.
- **Do not read "10 of 17 recovered were bilingual" as member-level recovery** — it is a
  between-run marginal subtraction (drop-stem overlap = 1).
- **Do not quote φ=0.102 as "the size of a bilingual bias"** — it is a floor-crossing decision
  trigger at effective n≈2, per the CERT guardrails.
- **Do not certify any quiet covariate as `REPRESENTATIVE`** — under-power blocks proving
  absence of bias.

## 9. Trigger status

This characterizes the §4.B `bilingual` flag as the §4.B RESULT routed ("its own
separately-gated characterization session… would need a power argument the $20 cap does not
provide"). The power argument is provided here and is **negative**: the cap cannot adjudicate
it. No fix is warranted or made. G5 triggers (a) shipped (#355/#356; re-cert #358/#359),
(b) closed (#362). No further G5 work is opened; any continuation requires a fresh
pre-registered gate with a budget that clears `Ndrop≥80` on **independent** drop stems.

---

*Verification note (main session, 2026-06-10): the load-bearing claims here were
independently re-derived from the persisted artifacts before this doc was committed — the
9-distinct-stem / 2-distinct-bilingual pseudoreplication count, the all-30-`no_brace` bucket,
the `[5,25]` drop cell, and the power arithmetic (λ\*=7.849; Ndrop=80 ≈ $51; 80 independent
stems ≈ $169) all reproduce.*
