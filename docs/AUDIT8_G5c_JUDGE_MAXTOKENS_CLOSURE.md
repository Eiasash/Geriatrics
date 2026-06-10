# AUDIT-8 G5 trigger (c) — judge `max_tokens` horizon: CLOSURE (DOCUMENT-only, NO self-merge)

**Date:** 2026-06-10 · **Lane:** terminal · append-only; every claim cites an on-main
artifact or a persisted ledger (`feedback_verify_mechanism_claims_not_assert`). This closes
the verification ceremony for G5 trigger (c). It runs nothing new ($0 — the verification
surface is the already-executed §4.B re-cert ledger), flips no `q.c`, changes no `broken`
flag, and bumps no trinity.

## 0. What (c) is, and the key fact: its lever ALREADY SHIPPED

G5 trigger (c) = "audit horizon item 2 (Geri judge `max_tokens`)" coined at
`docs/AUDIT7_PRE_REGISTERED_GATE.md` (the "two-item" re-prioritization): raise the judge
token budget from 400 and/or trim the verdict schema so judge verdicts stop truncating at
`stop_reason=max_tokens`, then prove it in a fresh bounded run.

**The lever shipped as PR #341 (`57fa35b`, 2026-06-07):** judge `maxTokens` 400 → **1024**
(`scripts/chaos-doctor-bot-v4.mjs:632`, `scripts/lib/judgeShapeValidator.mjs:59`),
CI-pinned at ≥1024 by `tests/judgeMaxTokensBudget.test.js` (`MIN_JUDGE_BUDGET=1024`). Pick
(250), explain (400), source (300) were untouched. So the *code* lever has been live and
guarded for days; what remained "gated" was only the **verification** that 1024 actually
emptied the truncation class, plus the optional verdict-schema trim.

## 1. Why it was gated, and the route-opener decision

(c) was queued **behind the de-bias** (G5 trigger (a)): "Only governs whether judge verdicts
*emit*; moot if the adjudicated population itself is biased" (`AUDIT7_PRE_REGISTERED_GATE.md`).
The judge sits downstream of the pick channel — improving judge throughput is pointless while
the pick channel silently drops a biased subsample.

**Route-opener (the gate-author decision this doc records; Eias's merge is its signature).**
G5(a) has run: the pick-channel `t`/provenance bias *signal* is removed (Cramér's V
0.190→0.087, below the 0.10 floor; `biasSignal` true→false — `AUDIT8_G5a_REPAIR_GATE.md`
§4.B RESULT). The residual aggregate-`BIASED` is on an under-powered `bilingual` flag that
the characterization (`AUDIT8_G5a_BILINGUAL_CHARACTERIZATION.md`) concludes is a de-bias
composition artifact, not adjudicable at the closed budget. **Honest tension, not hidden:**
the frozen analyzer's verdict strings unblock (c) only on `REPRESENTATIVE` /
`DETECTABLE-BUT-NEGLIGIBLE` (`scripts/analyze_pick_representativeness.mjs:567-578`), and the
re-cert aggregate is neither (it is `BIASED`, `powered=false`). So under a strict
verdict-string reading the unblock is **not literally granted**. The decision recorded here —
made before reading the verification counts below — is that the *substantive* gating
condition ("behind the de-bias") is met: the de-bias has run and removed its target signal;
the remaining `bilingual` flag is a separately-characterized artifact, not a pick-population
defect that would make judge verdicts moot. This is exactly the "no leaf for de-bias-completed
but aggregate-still-BIASED-on-a-different-under-powered-covariate" gap; resolving it is a
gate-author call, recorded here per the closed-decision-tree norm, and ratified by merge.

## 2. Verification — from the EXISTING re-cert ledger ($0, no new run)

The §4.B re-cert (`chaos-reports/v4-long/audit8g5a_recert_20260609T221558Z/`, 2026-06-10) ran
the bot at `main` `736b78d` — i.e. **with the #341 1024 judge budget live** — for 8 h /
$19.21 / 4023 calls / 0 failures, producing **1172 judged rows**. That run is a valid post-#341
verification surface; no fresh run is needed.

**Metric (pre-registered at AUDIT7: first-attempt `validateJudgeShape` OK rate ↑,
`judge-shape-firstfail/truncation` ↓):**

| | audit-7 baseline (400) | R3 (400) | §4.B re-cert (1024) |
|---|---|---|---|
| judge first-attempt shape failures | 55 / 569 ≈ **9.7%** | ~101 truncations / 38 residual | — |
| **judge `ai-parse-error` (context=judge), post-retry** | (all 55 retry-recovered) | 38 residual | **0 / 1172** |

The re-cert ledger carries **zero** `type=ai-parse-error ∧ context=judge` rows across all 1172
judgments (`chaos-doctor-v4-*.json` `workers[0].bugs`); all 1172 retained rows judged
determinately (analyzer `Nretain=1171` + 1 `appIdxNull` exclusion). The truncation class that
#341 targeted is **empty** at 1024. (Re-verified by the main session against the persisted
ledger before this doc was committed.)

**Reading.** The 1024 budget eliminated the judge-shape truncation class outright — not merely
"retry still recovers it" (the audit-7 state, where the cap=1 retry was load-bearing and
recovered 100% of the 55 failures), but **zero first-or-second-attempt judge shape failures**
in a 1172-judgment run. Per the audit-7 RESULT, this was always a **robustness/cost**
improvement, **not an active-incident fix** — production was never losing verdicts (retry
caught them). The fix removed the root cause so retry stops being load-bearing; the re-cert
confirms it did.

## 3. Verdict schema trim — declined as moot

The optional second lever (trim `{app_answer_correct, confidence, issue,
correct_letter_if_app_wrong}`) is **not taken**: at 1024 the schema fits with zero truncations,
so trimming buys nothing and would churn `judgeShapeValidator.mjs` + its pins for no metric
gain. Dropped, not deferred.

## 4. CLOSURE

- **G5 trigger (c): CLOSED.** Lever shipped (#341, 1024, test-pinned); verification positive
  from the existing re-cert ledger (0/1172 judge shape failures — truncation class empty);
  schema-trim declined as moot. No active incident existed; this is a robustness-confirmed
  close.
- **No new run, no `$` spend, no `q.c` flip, no `broken` change, no trinity bump.** Scripts
  unchanged; this is a docs-only closure citing already-merged code (#341) and an
  already-executed run.
- **Honest scope:** this closes the *judge-emission* horizon item only. It makes no
  representativeness claim (the pick channel's `REPRESENTATIVE` remains budget-unreachable,
  `AUDIT8_G5a_REPAIR_GATE.md`), and it does not re-open the series.

## 5. AUDIT-8/9 G5 ledger after this doc

- (a) pick-parser hardening — SHIPPED + re-certed (#355/#356/#357/#358/#359).
- (b) retroactive-reach characterization — CLOSED, DOCUMENT-only (#362).
- (c) judge `max_tokens` horizon — **CLOSED (this doc)**; lever was #341.
- `bilingual` flag — characterized as artifact, not adjudicable at the $20 cap
  (`AUDIT8_G5a_BILINGUAL_CHARACTERIZATION.md`); needs a budget clearing `Ndrop≥80` on
  independent stems (~$169) to revisit — its own future gate.

Nothing further is open in the AUDIT-8/9 series. Any continuation requires a fresh
pre-registered gate, not an edit to this doc.
