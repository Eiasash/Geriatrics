# Audit-9 — temporal-bin analyzer pre-registered gate (R3 prerequisite) — NO-RUN, ZERO-DOLLAR, DOCS-ONLY

Written **before** any analyzer code, any fixture, any fresh run. Append-only;
do not retro-edit (`feedback_spec_provenance_append_only`). Lane: terminal,
solo (`claude/term-audit9-temporal-bins-gate`, cut from `origin/main` `c48646c`).
Trinity: **untouched** — docs-only this session, no bump (mirrors audit-5/6/7/8
+ G5/R1.5: a pre-registration that ships no product code does not bump the
version trinity).

**Parent / trigger.** AUDIT-8 G5 R1 RESULT (`f44ffae`, #241, appended into
`docs/AUDIT8_G5_REPAIR_GATE.md`) surfaced — by disk re-analysis of the audit-8
8 h ledger — a **Phase-1 → Phase-2 bifurcation** the frozen analyzer's
single-aggregate verdict had pooled into a `3800 / 4309 ≈ 88 %` rate. R1.5's
mechanism-capture gate (`18c35e6`, #242, `docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md`)
§OUT OF SCOPE called out the analyzer prerequisite explicitly:

> **AUDIT-9 prerequisite for R3 — temporal-bin analyzer change.** The #238
> RESULT's `3800/4309 ≈ 88 %` aggregate hid the bifurcation. R3's analyzer
> must temporal-bin (e.g., per-15-min buckets) to surface re-occurrence of the
> bifurcation class. Authored as its own pre-registered gate before R3 fires.
> Out of R1.5 scope.

**This document is that pre-registration.** It authors the gate **only**. It
does **not** modify `scripts/analyze_pick_representativeness.mjs`, ship a
fixture, run a fresh bounded run, or change a verdict. It pre-registers the
bucket width, the bifurcation-detection criterion, the verdict routing, the
pre/post predicates, and the sequencing relative to R2's re-freeze rule — all
locked **before** any data the change would consume is seen.

## Why a new doc is NOT a "single-doc" violation (pre-empting the fresh-eye flag)

The AUDIT-8 gate warns "Single doc — no second gate doc." That warning is
scoped to **not authoring a second AUDIT-8 *representativeness* gate** (a
rival G1–G5). It does not forbid the **separately-gated analyzer-instrumentation
session** the R1.5 gate's §OUT OF SCOPE *mandates* ("authored as its own
pre-registered gate before R3 fires"). This is that mandated session; it is
a distinct workstream (analyzer instrumentation, not re-adjudication), with
its own pre/post predicates. The AUDIT-8 representativeness gate is **closed
and untouched**; nothing here re-opens, re-derives, or re-routes it. The
AUDIT-8 G5 REPAIR gate is **open** (R2 / R3 pending), and AUDIT-9 sequences
explicitly behind R2's re-freeze (§A6 below).

---

## READ THIS FIRST — what this gate does and does NOT authorize

- It pre-registers the **bucket width, the bifurcation-detection criterion,
  the verdict routing, what the criterion does NOT catch, and the pre/post
  predicates** — no-run, deterministic, from the disk-verified R1 RESULT +
  static source.
- It explicitly separates **disk-verified R1 RESULT facts** (the bifurcation
  numbers committed in `docs/AUDIT8_G5_REPAIR_GATE.md` §"The bifurcation
  finding") from **hypotheses the AUDIT-9 implementation session MUST prove
  against disk** (none — the design is class-agnostic, see §"HYPOTHESES";
  this is by deliberate choice, not a gap).
- It is **gate-only**. It does **NOT** modify
  `scripts/analyze_pick_representativeness.mjs`. The implementation lands in
  a subsequent session, sequenced behind R2 per §A6.
- It does **NOT** authorize R3. **The $20 cap is NOT widened**; G1/G2 config
  is inherited UNCHANGED. R3 is still gated behind R1 + R2 + this gate's
  implementation session landing.

---

## STEP 0 — distrust contract (no-run; results)

- **0.1 State (verified).** `origin/main` HEAD `c48646c` (#274 firstfail
  debounce squash-merged; R1.5 gate doc landed at #242, `18c35e6`). No prior
  `claude/term-audit9-*` branch on origin; no `docs/AUDIT9*.md` (armed scan,
  real negative — evidence, not silence). Solo terminal lane; branch + PR;
  **no self-merge** (audit-evidence path: `docs/AUDIT*`). ✅
- **0.2 Disk-verified R1 RESULT facts (ground truth — cite as R1-RESULT-derived,
  NOT no-run claims; verifiable in `docs/AUDIT8_G5_REPAIR_GATE.md` §"The
  bifurcation finding", lines 399-449 on `c48646c`).**

  The audit-8 ledger numbers (Phase-1 / Transition / Phase-2 rows) come from
  the R1 RESULT section of `docs/AUDIT8_G5_REPAIR_GATE.md`. The Phase-1 blip
  catalogue (final bullet) is a **separate disk source** — sampled from
  PR #274's 2026-05-24 r15 timeline fixture — because audit-8's own Phase-1
  recorded 0 single-minute blips. AUDIT-9's bucket sizing must be robust
  to *both* shapes; combining them is by design, §A5 fixture-provenance.

  - **Phase 1** (`19:17` → `22:30` Jerusalem, ≈ 3 h 14 min, ≈ 194 min):
    **0** `pre-pick-skip` events; **2–3** successful Qs per minute, steady.
  - **Transition** (`22:29:27` last ok → `22:31:07` first `pre-pick-skip`):
    ≈ 1 m 40 s gap. **Zero** `pageerror` / `requestfailed` / `console:error` /
    `http >=400` / `methodology` events at the transition or in the preceding
    10 min. No telemetry footprint at the trigger.
  - **Phase 2** (`22:31` → `03:17`, ≈ 4 h 46 min, ≈ 286 min): **13–14**
    `pre-pick-skip` events per minute, **zero** successful Qs. Mean inter-event
    delta `4.52 s` (min `3.51`, median `4.52`, max `5.53`; 3799/3799 in the
    2–10 s bucket). `dropCtx` is **100 % `pre-pick-no-question`**.
  - **Phase-1 blip catalogue** (from PR #274 / `tests/fixtures/r15-2026-05-24-timeline-slim.jsonl`):
    7 single-minute blips at minutes 1, 11, 49, 63, 78, 160, 188, each
    exactly 1 minute wide, each with `d_ok ≥ 12` and `outcome=ok` (so even
    the blip minutes are mostly successful — see §A2 RED-proof).
- **0.3 Frozen-analyzer state (verified, static source @ `c48646c`).**
  `scripts/analyze_pick_representativeness.mjs` `git log --oneline` is
  **exactly** `edfa433 feat(audit-8 bounded-run): frozen pick-representativeness
  analysis tooling (#236)` — single commit, no R2 yet. The analyzer pools
  the whole ledger into one aggregate verdict via `joinRows`, `joinViolations`,
  and the three `STOP-JOIN-INTEGRITY` / `BIASED` / `REPRESENTATIVE` branches
  at `:269` / `:271` / `:275`. It has **no temporal-bin output** and **no
  bifurcation-detection signal**.
- **0.4 The gitignored-ledger caveat (REV-style honesty pin).** The audit-8
  8 h ledger (`chaos-reports/v4-long/audit8_20260518T191705Z/...`) lives
  under a **gitignored path** (`chaos-reports/` is in `.gitignore`). A
  fresh-eye filesystem-grounded reviewer using `git clone` alone cannot see
  it (`feedback_audit_logs_cross_claude_visibility`). The §0.2 numbers are
  cited from the R1 RESULT text committed to `docs/AUDIT8_G5_REPAIR_GATE.md`
  on `main`; that text is the reviewer-visible record. Reviewers wanting to
  re-verify the per-minute distribution against the raw ledger need it
  pasted into a review prompt or copied out of `chaos-reports/` locally —
  the clone-only path stops at the committed R1 RESULT prose.

---

## HYPOTHESES the implementation session MUST verify against disk (do NOT treat as fact)

Proactive D1–D4 defense — the fresh-eye reviewer should check each is still
flagged as hypothesis, not silently promoted:

The AUDIT-9 design is **deliberately mechanism-agnostic** (advisor §"One
concern that does block"): the detection criterion operates on bucket-level
*outcomes* (`reached-pick = 0` vs `> 0`), not on root cause. Whatever R1.5
RESULT names — Class A (browser process leak) / Class B (page state) /
Class C (DOM injection) / Class D / Class E — the bifurcation manifests in
the same observable: a sustained run of buckets with zero successful pick-step
arrivals, after at least one bucket with non-zero arrivals.

Hypotheses still in play:

1. **The §0.2 Phase-1 / Phase-2 / blip cadence is stable across R1.5 RESULT.**
   R1.5's run captures the mechanism, not the cadence; the bucketed signal
   need not change shape across mechanism classes. **Test:** the
   implementation session verifies — once R1.5 RESULT lands — that the
   captured-failure timeline still shows the §0.2 Phase-1 / Phase-2 / blip
   shape. If R1.5 captures a *qualitatively different* failure shape (e.g.,
   gradual decay rather than sharp transition), AUDIT-9's criterion is
   **under-specified** and the implementation session re-opens the gate.
   That overturn condition is **named explicitly** here so taking it is not
   post-hoc (see §"PRE-REGISTERED PREDICTIONS").
2. **The bifurcation criterion's K (consecutive-zero-bucket count) catches
   the Phase-1 blips' false-positive class without missing the Phase-2 onset.**
   Verified at gate-author time against the §0.2 blip catalogue, RED-proofed
   in the CATCH/NO-FALSE-POSITIVE fixtures (§A5). The implementation session
   re-RED-proofs against the actual fixture before claiming GREEN.
3. **R3's $20 cap is enough to surface bifurcation if it recurs.** Inherited
   from AUDIT-8 G2's pre-registration. AUDIT-9 does **not** re-litigate
   budget — it instruments the analyzer that consumes whatever R3 captures.

### HYPOTHESES-REV1 — Mechanism-class taxonomy alignment (post-merge review, 2026-05-24)

Web fresh-eye review of this gate found that the inline class taxonomy at the §"deliberately mechanism-agnostic" paragraph (`docs/AUDIT9_PRE_REGISTERED_GATE.md:128`) — "Class A (browser process leak) / Class B (page state) / Class C (DOM injection) / Class D / Class E" — does NOT match the binding taxonomy in the parent gate doc `docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md:47-51`:

| Class | R1.5 doc (`:47-51`, binding) | AUDIT-9 inline (`:128`) |
|---|---|---|
| A | Browser process leak | Browser process leak ✓ |
| B | **Page-state accumulation** (PWA heap, listener leaks) | Page state |
| C | **Connection / proxy state** (Toranot session, CDN edge, HAR) | DOM injection |
| D | **Persistent bot-profile state** (IDB / localStorage / SW) | (unspecified) |
| E | (open) Novel mechanism | (unspecified) |

The C and D labels in particular have **disjoint scopes** between the two docs. AUDIT-9's "Class D" inline could plausibly be read as the brief's `opus-consult-r15-bot-run.md` "extractor bug" class — which the R1.5 doc's bisect-window argument (`docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md:35`) already disposes of as a hypothesis.

*Original AUDIT-9 §HYPOTHESES paragraph at `:128` preserved verbatim — not retro-edited (`feedback_spec_provenance_append_only`).*

**Binding clarification.** Whenever this gate or any AUDIT-9 RESULT section references R1.5 mechanism classes, the **binding taxonomy is the one at `docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md:47-51`** (Class A=process leak / Class B=PWA accumulation / Class C=connection-proxy-CDN / Class D=persistent bot-profile / Class E=novel). The inline AUDIT-9 paraphrase at `:128` is a non-binding gloss; if conflict surfaces, the R1.5 doc wins. The bifurcation-detection criterion's mechanism-agnostic design is unaffected — the criterion operates on bucket-level outcomes regardless of which class wins selection.

**Why this matters for downstream R1.5 RESULT.** The R1.5 implementation session (when it lands) selects ONE class per the R1.5 doc's matrix. An AUDIT-9 RESULT that referenced the inline-paraphrase taxonomy would risk mis-labeling the selected class (e.g., calling a Class C/connection finding a Class D/DOM-injection finding, or absorbing what the R1.5 doc would call Class D into AUDIT-9's "Class E"). The binding clarification above forecloses that drift.

**No criterion change. No predicate change.** Taxonomic clarification only.

---

## THE LOCKED ANALYZER ADDITION (binding; the design does not get reshaped)

Order: §A1 (bucket width) → §A2 (criterion) → §A3 (routing) → §A4 (what-NOT)
→ §A5 (pre/post) → §A6 (sequencing vs R2). All locked here, before any data.

### A1 — Bucket width: **5 minutes**

**Locked at 5 minutes.** Justification from §0.2 disk-verified R1 RESULT
facts:

- **Lower bound (transition resolution).** The Phase-1 → Phase-2 transition
  is `≈ 1 m 40 s` wide (§0.2 transition row). A bucket width `< 2 min` would
  split the transition across multiple buckets, splintering the signal; a
  width `≥ 2 min` keeps the transition inside ≤ 1 bucket boundary on either
  side. **5 min satisfies this with margin.**
- **Steady-state signal-to-noise.** Phase-1 averages `2–3 ok/min`. A 5-min
  bucket holds `10–15 ok` of signal — large enough that a single-question
  hiccup doesn't dominate the bucket's outcome, small enough that the
  reached-pick rate has discriminating resolution.
- **Phase-1 blip robustness.** Single-minute blips (§0.2 blip catalogue:
  7 events of width 1 min each) deposit at most `1 min` of degraded outcome
  into a 5-min bucket. Even if the blip lands at a bucket boundary
  (degrading two adjacent buckets), each affected bucket still contains
  `≥ 4 min × 2 ok/min = 8 ok`. **Neither bucket goes to zero.** This makes
  K = 2 (§A2) safe against the blip false-positive class.
- **Phase-2 detection latency.** A 5-min bucket means the criterion (K = 2
  consecutive zero buckets, §A2) fires `≥ 10 min` after Phase-2 onset.
  Against a `≈ 286 min` Phase-2 (§0.2), this is `~3.5 %` of duration — small
  enough that the surfaced bifurcation is unambiguous, large enough that
  K = 1 (single-bucket zero) doesn't trigger on a sub-bucket-wide outage.
- **Not 15 min** (the R1.5 §OUT OF SCOPE's `e.g., per-15-min`) because at
  15 min, Phase-1 blip residues are `~6 %` of bucket-content vs `~20 %` at
  5 min — the larger bucket would still survive blips, but loses the
  transition-resolution + Phase-2-onset-latency advantages above. The
  R1.5-cited `e.g.` is correctly flagged as an example, not a lock.
- **Not 1 min** because at 1-min granularity, single-minute Phase-1 blips
  produce buckets with `reached-pick ≈ 0` (the blip happens to land entirely
  inside the bucket), which would fire K = 1 false positives. K = 2
  consecutive at 1-min still false-positives on a `2 min` blip (absent from
  audit-8 disk, but the §0.2 blip-width prior is `1 min observed; ≤ 2 min`
  is the structurally-defensible bound).
- **Not 2 / 3 / 4 min** because they each erode either the blip-residue
  margin (smaller bucket = less Phase-1 ok signal per bucket) or the
  steady-state discriminating resolution. 5 min is the **smallest** width
  where K = 2 is robust against all 7 observed Phase-1 blips simultaneously
  AND keeps transition fragments within a 1-boundary band.

The bucket width **5 minutes** is a lock; it is not negotiable inside the
implementation session unless `R1.5` returns a cadence inconsistent with
§0.2 (the explicit overturn condition in §"PRE-REGISTERED PREDICTIONS").

**Bucket alignment: run-start-aligned, not clock-aligned.** Bucket `B[0]`
opens at the first event timestamp in the ledger; bucket `B[i]` opens at
`B[0].start + i × 5 min`. Run-start-alignment mirrors R1.5's per-minute
timeline indexing (`timeline.jsonl` indexes minutes from run-start, not
from wall-clock midnight) and makes synthetic-fixture authoring
deterministic — a CATCH-fixture that simulates "Phase-2 onset at minute
194" lands the onset bucket at the same fixed offset regardless of when
the fixture is read.

### A2 — Bifurcation-detection criterion: **K = 2 consecutive 5-min buckets with `reached-pick = 0`, after an anchor bucket with `reached-pick > 0`**

Formally, given the per-bucket time series `B[0], B[1], …, B[n-1]` where
`B[i].reached_pick ∈ ℕ`:

> Bifurcation is **DETECTED** iff there exists an index `b ≥ 1` such that
> `B[b-1].reached_pick > 0` AND `B[b+i].reached_pick = 0` for all
> `i ∈ [0, K-1]` (with `K = 2`). The first index `b` satisfying this is
> the **bifurcation onset bucket**; `B[b-1]` is the **anchor bucket**
> (immediately preceding, by definition).

- **Anchor rule** is "immediately preceding bucket has reached-pick > 0",
  not "any earlier bucket has reached-pick > 0." This forbids a cold-start
  no-quiz streak from triggering bifurcation when the run never reached
  Phase-1 in the first place. Mirrors PR #274's debounce predicate which
  requires an earlier Phase-1 anchor.
- **K = 2** is the minimum consecutive-zero length. K = 1 false-positives
  on a 5-min outage; K = 3 adds `+5 min` to detection latency (already
  ~10 min at K = 2) for no documented gain. **K = 2 is the inflection.**
- **`reached-pick` definition (inherited from the frozen analyzer).** A
  question is `reached-pick` iff `extractQuestion` returned a parseable
  question AND the bot reached `pickStep` (i.e., NOT `pre-pick-skip`
  excluded). The frozen analyzer's existing `pre-pick-skip` row category
  (`scripts/analyze_pick_representativeness.mjs`) is the authoritative source;
  AUDIT-9 buckets that category by ledger-event timestamp.
- **Single-bucket dips are NOT bifurcation** (named in §A4 below for
  reviewer clarity).

### A2-REV1 — Anchor-rule framing correction (post-merge review, 2026-05-24)

Web fresh-eye review of this gate (consult `opus-consult-r15-bot-run.md`) flagged that §A2's claim "Mirrors PR #274's debounce predicate which requires an earlier Phase-1 anchor" is structurally inaccurate. PR #274's predicate at `scripts/audit8/r15LongProbeLogic.mjs:81-84` scans the entire history prefix (`for (let i = 0; i < tailStart; i++)`) and fires if ANY earlier record has `deltaOk > 0` — the **liberal "any earlier"** rule. AUDIT-9 §A2 locks the **strict "immediately preceding bucket"** rule (`B[b-1].reached_pick > 0`). These are two distinct rules, not mirrors.

*Original §A2 anchor sentence preserved verbatim — not retro-edited (`feedback_spec_provenance_append_only`); this REV clarifies the framing without changing the bucket-level criterion.*

**Behavioral equivalence on the first onset.** On the canonical Phase-1 → Phase-2 sequence (the §0.2 shape and any single-onset variant), both rules fire at the same point: PR #274 because the entire Phase-1 prefix provides an anchor; AUDIT-9 because the immediately-preceding bucket is the last Phase-1 bucket. The rules diverge only on **subsequent** onsets after a recovery span, where strict-anchor still fires (each onset's b-1 is the recovery's non-zero bucket) but at a *different* bucket index than liberal-anchor would surface. Since §A4 item 5 routes first onset only to verdict, the divergence has no verdict impact within this gate's scope.

**Doc text correction (where the inaccuracy lives, for the reviewer's trail).** §A2 third bullet: "Mirrors PR #274's debounce predicate which requires an earlier Phase-1 anchor" should read **"Functionally equivalent to PR #274's debounce predicate on first-onset detection; differs on subsequent-onset semantics, which §A4 item 5 routes out of scope for this gate's verdict."**

**No criterion change.** The strict-anchor lock remains, the K=2 lock remains, the bucket width remains. This REV is **framing-only**; no test or fixture changes.

### A2-REV2 — Multi-onset emission contract (post-merge review, 2026-05-24)

Web fresh-eye review on §A4 item 5 ("first onset only; surface subsequent as RESULT notes, not new verdict") flagged that the contract is ambiguous about WHAT structured data the analyzer emits. The implementation session could read "RESULT notes" as free-text prose and drop the structured onset list, losing the diagnostic information that all-onsets enables (e.g., "three bifurcations at b=14, b=42, b=71 with recovery spans 6/8 buckets").

Pre-registering the output contract:

> The analyzer's structured output object MUST include a `bifurcation_onset_buckets` field — an array of all bucket indices `b` satisfying §A2's criterion across the full timeline, in order, even when the routed verdict is `STOP-BIFURCATION` (first-onset-only). The verdict remains first-onset-only; the diagnostic field is exhaustive. Emitting `[b1]` when multiple onsets exist is a contract violation.

**Rationale.** Without the structured emission, "RESULT notes" relies on prose, which downstream consumers can't programmatically diff across R3/R4/Rn runs. The list is the source-of-truth for "did the mechanism recurrence pattern change between runs."

**No criterion change, no test fixture changes.** This REV adds an output-contract field; the routing logic is unchanged.

### A3 — Verdict routing: bifurcation **overrides** aggregate

Pre-registered:

- The analyzer adds a new mechanical verdict branch `STOP-BIFURCATION`,
  routed by the §A2 criterion firing **regardless of** the aggregate verdict
  (`REPRESENTATIVE` / `BIASED` / `STOP-JOIN-INTEGRITY`).
- Branch order in the analyzer's verdict switch: `STOP-BIFURCATION` is
  evaluated **first**. If §A2 fires, the verdict is `STOP-BIFURCATION` and
  the aggregate is reported as *informational, not load-bearing*. The
  aggregate is **still computed and emitted** (so downstream readers see
  what the pooled rate would have said) — but the routed verdict is
  `STOP-BIFURCATION`.
- **Forbidden** (`feedback_pre_commit_diagnostic_gates`, criterion-swap-by-
  silence): "bifurcation is informational only, aggregate still routes" is
  the exact failure mode the analyzer change exists to prevent. The audit-8
  RESULT was that the aggregate hid the bifurcation. Letting the aggregate
  still route would re-introduce the failure mode under a different label.
  This is **named aloud and forbidden**, the gate's R2.0's "criterion-swap-
  by-silence" pin transplanted to verdict-routing.
- **Forbidden**: relaxing K below 2, relaxing the anchor rule, **shrinking**
  the bucket width below 5 min (false-positive risk per §A1 blip-residue
  calculation), **widening** the bucket width beyond 15 min (loses transition
  resolution per §A1 1m40s transition-width floor; 15 min is the upper
  bound the R1.5 OUT-OF-SCOPE explicitly contemplated as an "e.g."), and
  allowing aggregate to override bifurcation. None of these may pass under
  §"PRE-REGISTERED PREDICTIONS" refinements; they require their own
  append-only revision before any data is seen.

### A3-REV1 — Forbidden list expansion (post-merge review, 2026-05-24)

Web fresh-eye review flagged two gaps in §A3's `Forbidden` list that the implementation session could plausibly exploit without violating the written predicates:

1. **Bucket alignment change.** §A1 locks "run-start-aligned, not clock-aligned" with justification, but the §A3 forbidden list (`docs/AUDIT9_PRE_REGISTERED_GATE.md:262-269`) does not include "changing bucket alignment from run-start to any other origin." Implementation could clock-align without textually violating any forbidden item.

2. **Branch-coverage undercount.** §A3 says STOP-BIFURCATION overrides `REPRESENTATIVE / BIASED / STOP-JOIN-INTEGRITY` — three branches. The frozen analyzer at `edfa433` actually has **five** verdict branches (`scripts/analyze_pick_representativeness.mjs` at `edfa433`, lines 267-278):

   ```
   if      (joinViolations.length) verdict = 'STOP-JOIN-INTEGRITY';
   else if (anyBiasSignal)         verdict = 'BIASED';
   else if (anyHolmSig)            verdict = 'DETECTABLE-BUT-NEGLIGIBLE';
   else if (powered)               verdict = 'REPRESENTATIVE';
   else                            verdict = 'INCONCLUSIVE';
   ```

   The two unlisted branches (`DETECTABLE-BUT-NEGLIGIBLE`, `INCONCLUSIVE`) must also be overridden by STOP-BIFURCATION; otherwise an implementation that reads §A3 literally leaves them uncovered. An R3 run that triggers bifurcation alongside underpowered `INCONCLUSIVE` would mis-route as `INCONCLUSIVE` under the literal §A3 reading.

Append to §A3 `Forbidden` list:

> - **Changing bucket alignment.** Bucket origin must be run-start (first ledger event's timestamp), not clock-aligned (wall-clock midnight, UTC hour boundary, or any other origin). Justified at §A1; locked here.
> - **Under-coverage of aggregate branches.** STOP-BIFURCATION overrides ALL FIVE frozen-analyzer verdict branches (`STOP-JOIN-INTEGRITY`, `BIASED`, `DETECTABLE-BUT-NEGLIGIBLE`, `REPRESENTATIVE`, `INCONCLUSIVE`), not just the three named in §A3's first bullet. The §A3 first-bullet enumeration is illustrative; this bullet binds.

**No criterion change.** Forbidden-list additions only.

### A4 — What the criterion does NOT catch (named explicitly to forbid scope-creep, `feedback_closed_decision_tree_no_extra_leaves`)

The §A2 criterion fires only on the **sharp-transition class**: an anchor
bucket > 0 followed by ≥ K consecutive zero buckets. It does **NOT** catch:

1. **Gradual degradation.** A reached-pick rate that drifts from
   `15 ok/bucket` → `10` → `5` → `2` → `1` without ever hitting zero.
   AUDIT-9's criterion would not fire; the aggregate would correctly route
   `BIASED` or `STOP-JOIN-INTEGRITY`. This is **not a gap** — gradual
   degradation is the case the aggregate verdict already handles. AUDIT-9
   targets the case the aggregate hides.
2. **Oscillation.** Alternating zero / non-zero / zero / non-zero buckets.
   The anchor rule requires the *immediately preceding* bucket to be > 0;
   in oscillation that condition gets re-satisfied each cycle, but the
   K = 2 consecutive-zero requirement prevents firing unless oscillation
   collapses into a sustained zero streak. Oscillation that resolves to
   sustained zero **is caught** at the resolution point. Oscillation that
   continues indefinitely **is not** — and is named here as an open
   monitoring-class for future audits, not patched into AUDIT-9.
3. **Sub-bucket spikes.** A `1 min` outage entirely inside a 5-min bucket
   leaves the bucket with `~ 12 ok` (Phase-1's `15 ok/bucket × 4/5`). Not
   caught; correctly not caught — the §A2 design rejects this class by
   §A1's "Phase-1 blip robustness" calculation.
4. **Recovery within K buckets.** A zero bucket followed by a non-zero
   bucket within K buckets does not fire bifurcation (the consecutive-zero
   requirement breaks). Audit-8's Phase 2 was sustained `~286 min`; a
   bot-resilience patch that recovers within `< 10 min` would *not* surface
   here, by design — that's the resilience patch working. The aggregate
   would correctly absorb the brief outage as `BIASED` if drop-fraction
   exceeds threshold, or `REPRESENTATIVE` if not.
5. **Multiple bifurcations in one run.** §A2 fires on the **first** onset;
   subsequent re-bifurcations after a recovery span are not separately
   counted in this gate. Named here because R3's run could in principle
   show multiple cycles; if it does, that's a separate "named monitoring
   class" finding the implementation session surfaces as a RESULT note,
   not a new verdict.

### A4-REV1 — Item 6 (trickle / sub-anchor floor) named (post-merge review, 2026-05-24)

Web fresh-eye review flagged a Phase-2 mode the original §A4 list does not name explicitly: **trickle / sub-anchor floor**. A future Phase-2 mechanism that leaks ≥ 1 successful Q per 5-min bucket (a "leaky" lock-in, distinct from the §0.2 monotonic-zero shape) would have NO consecutive zero buckets and the §A2 K=2 criterion would never fire. The aggregate would route `BIASED` (correct, by elevated drop fraction) but the *bifurcation regime* itself is invisible to the temporal-bin output.

This is **implicitly** absorbed into §A4 items 1 (gradual decay) and 2 (oscillation), but neither names it cleanly:
- "Gradual decay" implies monotonic decline; a trickle floor is a flat near-zero, not a decline.
- "Oscillation" implies alternation; trickle is sustained, not alternating.

Naming it explicitly:

> **6. Trickle / sub-anchor floor.** A sustained Phase-2-like state where `reached_pick` per bucket stays > 0 but `<< anchor floor` — e.g., 1 ok/bucket for 30+ buckets following an anchor at 12 ok/bucket. The §A2 criterion does NOT fire (no consecutive zero buckets). The aggregate correctly routes `BIASED` if the drop fraction crosses threshold. The bifurcation regime itself is surfaced as a RESULT note in the analyzer output (analogous to §A4 item 5's subsequent-onset notes), NOT silently patched into the K=2 logic. Named here to forbid scope-creep that would dilute the §A2 sharp-transition contract.

**Rationale for not extending the criterion.** A "trickle detector" requires anchor-relative thresholding (e.g., `reached_pick < anchor / 10` sustained over N buckets) — that re-introduces a tunable parameter to a criterion the gate's whole shape is engineered to keep parameter-free. The aggregate already catches the failure rate; AUDIT-9's job is the binary state-flip the aggregate hides, not every Phase-2 mode.

**No test or fixture changes.** This REV is taxonomic only.

### A5 — Pre/post predicate (synthetic fixtures, RED-proofed both ways)

Two synthetic fixtures, both authored by the implementation session, both
RED-proofed against the un-binned (frozen `edfa433`) analyzer to confirm the
test discriminates:

- **CATCH-fixture** — **principled composite of two disk sources, not a
  replay of either.** Replays the §0.2 audit-8 cadence shape: 3 h 14 min
  Phase-1 steady at `~2.5 ok/min` + `~1 m 40 s` transition + `4 h 46 min`
  Phase-2 at `0 ok/min, ~13.5 pre-pick-skip/min` — **AND** overlays the
  Phase-1 blip catalogue from PR #274's 2026-05-24 r15 timeline (7 blips
  at minutes 1, 11, 49, 63, 78, 160, 188, single-minute width, `d_ok ≥ 12`
  outcome=ok). The audit-8 ledger's Phase-1 recorded 0 such blips; the
  fixture composites the worst-case Phase-1-disturbance shape (PR #274)
  with the canonical Phase-1 → Phase-2 transition (audit-8). This is by
  design — AUDIT-9's criterion has to be robust to **both** shapes
  simultaneously, so the CATCH-fixture must contain both. The new analyzer
  **MUST** surface `STOP-BIFURCATION`. The frozen analyzer (no bucketing)
  would route on its aggregate — the test discriminates by routing
  difference.
- **NO-FALSE-POSITIVE-fixture** — 8 h of steady Phase-1 at `~2.5 ok/min`
  with the same 7 single-minute Phase-1 blips at minutes 1, 11, 49, 63,
  78, 160, 188. **No Phase-2.** The new analyzer **MUST NOT** flag
  bifurcation; verdict routes on aggregate. The frozen analyzer also
  doesn't flag bifurcation (it has no notion); the test discriminates by
  the new analyzer not promoting a blip into a Phase-2 false-positive.
- **RED-proof procedure.** Each fixture is run twice: once against
  `edfa433` (un-binned analyzer), once against the AUDIT-9 implementation.
  The CATCH-fixture's expected routing difference (`edfa433`: aggregate;
  AUDIT-9: `STOP-BIFURCATION`) and the NO-FALSE-POSITIVE-fixture's expected
  routing agreement (`edfa433` and AUDIT-9 both: aggregate, no
  bifurcation) are pinned as test assertions. The fixtures stay in-tree as
  `tests/fixtures/audit9-catch-bifurcation.jsonl` and
  `tests/fixtures/audit9-no-false-positive-blips.jsonl` (or equivalent
  paths; final names chosen at implementation time).
- **Existing-fixture pin (mirroring R2.0's predicate).** The existing
  `tests/audit8AnalyzeRepresentativeness.test.js` STOP-JOIN-INTEGRITY /
  BIASED / REPRESENTATIVE fixtures **either still pass OR are consciously,
  pre-registeredly updated with the rationale documented in the AUDIT-9
  implementation PR** (never silently changed) **plus** the two new
  bifurcation fixtures above. A test relaxation that lets AUDIT-9's
  `STOP-BIFURCATION` branch land while quietly weakening an existing
  branch is criterion-swap-by-silence — **named aloud and forbidden**
  (`feedback_pre_commit_diagnostic_gates`). The fresh-eye reviewer should
  diff `tests/audit8AnalyzeRepresentativeness.test.js` between `edfa433`
  and the implementation PR to verify no silent relaxations.

The fixtures are **synthetic** (computed from the §0.2 cadence + blip
catalogue) — not extracts from the gitignored `chaos-reports/` ledger — so
they survive the §0.4 visibility caveat. Reviewers can re-derive them from
§0.2 without ledger access.

### A6 — Sequencing relative to R2's re-freeze rule (advisor §"Sequencing conflict")

R2's gate (`docs/AUDIT8_G5_REPAIR_GATE.md` §R2.0) pins:

> *The R2 commit re-freezes the analyzer; `git log --
> analyze_pick_representativeness.mjs` must read exactly `edfa433` + the
> single R2 commit.*

AUDIT-9 also touches the analyzer. The conflict resolution **locked here**:

> **AUDIT-9 is gate-only this session.** The implementation lands in a
> subsequent session, sequenced **after** R2 has landed and re-frozen. The
> AUDIT-9 implementation commit then **re-re-freezes**: `git log` post-AUDIT-9-
> impl reads exactly `edfa433` + the R2 commit + the AUDIT-9 commit. R2's
> "single R2 commit" rule was scoped to R2's own session; AUDIT-9 is a
> distinct subsequent change, sequenced explicitly.

This is the advisor's option (a) (default, smallest commitment, mirrors
R1.5's gate-only pattern). Options (b) (amend R2's re-freeze rule in this
doc) and (c) (separate file post-processing the frozen analyzer's output)
were considered and rejected:

- **(b) rejected** because retroactively amending R2's predicate from this
  doc would be a cross-gate amendment (`feedback_spec_provenance_append_only`
  reads as: prior gates' predicates ARE forge-eligible only via their own
  doc's append-only revision, not via a sibling gate). The amend would have
  to live as a §R2.0-REV2 in `docs/AUDIT8_G5_REPAIR_GATE.md`, which is a
  scope-creep into another gate.
- **(c) rejected** because a separate `analyze_pick_temporal_bins.mjs` would
  duplicate the join logic the frozen analyzer holds, drift apart from it,
  and produce two sources of truth. The §A3 "bifurcation overrides
  aggregate" routing also forces tight coupling — the wrapper would need to
  inspect the frozen analyzer's internals to know whether to override.

(a) is the cleanest sequencing. It does cost one extra session — the
AUDIT-9 implementation cannot start until R2 lands. That is **deliberate**:
gating the analyzer-instrumentation behind R2 ensures the join logic the
new bucket-aware code reads is the post-R2 (`t`-aware or denominator-
re-derived) logic, not the pre-R2 logic that would diverge from R3's run-time
analyzer.

---

## PRE-REGISTERED PREDICTIONS + OVERTURN CONDITIONS (`feedback_prewritten_predictions`)

Locked before R1.5 RESULT and R3 data are seen:

- **Prediction (lean — not assumed):** R1.5's RESULT capture identifies a
  mechanism class (A / B / C / D / E) but the captured timeline shape stays
  consistent with §0.2: sharp Phase-1 → Phase-2 transition, transition
  width `< 5 min`, sustained Phase-2 zero-yield, Phase-1 blip cadence
  matching the §0.2 catalogue. AUDIT-9's bucket width (5 min) and K (2)
  remain valid.
- **Refutation:** if R1.5 captures a *qualitatively different* failure
  shape (gradual decay across `> 30 min`, oscillation cycling at `< 10 min`
  period, or Phase-2 onset width `> 5 min`), the §A1 bucket width and §A2
  criterion are **under-specified**. The AUDIT-9 implementation session is
  **blocked** until this gate is re-opened via an append-only §A1-REV1
  / §A2-REV1. The implementation session does **not** silently widen the
  criterion (`feedback_pre_commit_diagnostic_gates`); it surfaces the
  contradiction and the gate is re-pre-registered.
- **Prediction:** R3's run, if it reproduces the bifurcation class, fires
  `STOP-BIFURCATION` with `b` (onset bucket index) somewhere in the second
  half of the run (audit-8 onset was at minute `194` of `480` ≈ 40 %).
  R3's 8 h budget covers `~96` 5-min buckets; the onset bucket index is
  predicted in `[40, 80]`.
- **Refutation:** R3 fires `STOP-BIFURCATION` in the first 20 % of the run
  (onset bucket `< 19`) — that's an *earlier* onset than audit-8, which
  would imply a duration-gating mechanism that's gotten worse, not a stable
  cadence. Surfacing this is a finding for the R3 RESULT, not a defect of
  AUDIT-9 itself.
- **Refutation:** R3 shows no bifurcation **and** clean aggregate
  (`REPRESENTATIVE`) — that means R1.5 / R1.6 (the fix-gate after R1.5) hit
  the root cause and Phase-2 onset no longer occurs in the budget. AUDIT-9
  is then a **confirmatory no-op** for that run, which is the **intended
  good outcome**.
- **Refutation:** R3 shows no bifurcation **and** routed
  `STOP-JOIN-INTEGRITY` or `BIASED` — the aggregate caught a different
  failure mode. AUDIT-9 is correctly silent (its scope is sharp-transition
  bifurcation, not aggregate failure).
- **Refutation:** R3 shows a *third* pattern AUDIT-9 doesn't name — e.g.,
  gradual decay (§A4 item 1) or indefinite oscillation (§A4 item 2). The
  pattern is **surfaced as a RESULT note**, not silently patched into the
  bifurcation criterion. The next audit cycle (AUDIT-10? or a new repair
  gate) author the response.

---

## SCOPE

Temporal-bin instrumentation of the pick-representativeness analyzer **only**.
Ships **no representativeness verdict**. Flips **no `q.c`**. Changes **no
`broken`**. Touches **no Toranot file**. Adds **no new chaos-bot scenario**.
Does **not** modify R1.5's capture procedure or R1.6 / R2 / R3's locked
sequencing. The AUDIT-8 representativeness gate is **closed and untouched**.
The G5 REPAIR gate is **open** — AUDIT-9's implementation session sequences
behind R2 per §A6.

## OUT OF SCOPE (handed off untouched)

- Any analyzer change beyond §A1–A5 (bucket width + criterion + verdict +
  fixtures). No `JOIN_DETERMINATE_MIN` change (forbidden, mirroring R2's
  forbidden list). No new verdict branches beyond `STOP-BIFURCATION`. No
  drop-fraction-by-bucket secondary signals (deferred to future audit).
- R1 / R1.5 / R1.6 / R2 / R3 — none re-litigated.
- `q.c` / `broken` / distractor work.
- The paid R3 run itself (separate explicit go; **$20 cap NOT widened**;
  config inherited UNCHANGED).
- B4 content adjudication.
- The named-but-not-caught monitoring classes from §A4 (gradual decay,
  indefinite oscillation, sub-bucket spikes, recovery-within-K,
  multiple-bifurcation-cycles).

## SHIP

Tracked, **docs-only**, append-only audit-5/6/7/8-style: **this gate doc**
(committed this session) + per-phase RESULT/closure sections appended
append-only by the implementation session. **No trinity bump.** Branch
`claude/term-audit9-temporal-bins-gate` → PR to `main`. **Do NOT self-merge**:
`docs/AUDIT*` is an audit-evidence path → **fresh-eye filesystem-grounded
review** (clone, read this gate doc + `docs/AUDIT8_G5_REPAIR_GATE.md` §R1
RESULT § "The bifurcation finding" + frozen analyzer source at `edfa433`;
verify §0.2 against the committed R1 RESULT prose, the §A1 5-min lock
against §0.2 numerically, the §A2 K=2 against the §0.2 blip catalogue, and
the §A6 sequencing against R2's pinned re-freeze) → **Eias merges** (human
merge authority). This PR opening is the fresh-eye reviewer's un-hold
trigger.

<!-- AUDIT-9 implementation RESULT section appended append-only below by the implementation session, after R2 has landed and re-frozen the analyzer. -->

---

## AUDIT-9 IMPLEMENTATION RESULT — temporal-bin analyzer landed; offline-complete (2026-06-06)

The locked gate (§A1–A6) is implemented exactly. No design reshape; the bucket
width, criterion, routing, what-NOT, and pre/post predicates were all honored.

**Captain-mode note.** Landed under the gate author's "go all in now" directive
(2026-06-06), self-merged under the granted authority with Codex + fresh-eye
substituting for the human-merge gate. Stacked on R2 (§A6); the re-freeze chain
is verified below. AUDIT-9 is **offline-complete** — its validation is synthetic
fixtures + a RED-proof vs `edfa433`, no live run; the only deferred item is R3
(the paid run that *consumes* the instrument), always a separate go.

### Overturn-check (§HYPOTHESES-1) — NOT triggered

§R1.5.4 RESULT (the `win-overnight-cc-20260524` capture) confirmed the §0.2
sharp-transition cadence on an independent run: **1-min transition width** (< 5),
sustained Phase-2 zero-yield, blip cadence matching. The §"PRE-REGISTERED
PREDICTIONS" refutation ("onset width > 5 min" / "gradual decay > 30 min" /
"oscillation < 10 min") is **not met** → bucket width 5 min and K = 2 stand. The
overnight run's own 5-min bucket preview fired K = 2 at onset b = 58 (single
onset) — the criterion reproduces on captured real data.

### What landed (binding §A1–A5)

- **`scripts/lib/temporalBins.mjs`** (new, pure): `temporalBifurcation(events)`.
  §A1 5-min **run-start-aligned** buckets (`B[0]` opens at the first event ts);
  §A2 detect iff ∃ `b≥1` with `B[b-1].reached_pick > 0` AND `B[b..b+K-1] == 0`,
  **K = 2**, strict immediately-preceding anchor; §A2-REV2 emits the **exhaustive
  `bifurcation_onset_buckets`** array (verdict first-onset-only).
- **`scripts/analyze_pick_representativeness.mjs`**: builds the per-event
  reached-pick stream (reached pick = dropped + ai-error/pick + retained +
  appIdx-null; pre-pick-skip = excluded), bins it, and routes
  **`STOP-BIFURCATION` FIRST** (§A3). The pooled aggregate is **still computed
  and emitted** as `aggregateVerdict` (informational); letting it route while
  bifurcation is "informational" is the forbidden failure mode and is NOT done.
- **§A3-REV1 branch coverage — now SIX, not five.** R2 (#327) added a sixth
  aggregate branch `STOP-JOIN-NONDETERMINABLE`. STOP-BIFURCATION overrides **all
  six** (`STOP-JOIN-INTEGRITY`, `STOP-JOIN-NONDETERMINABLE`, `BIASED`,
  `DETECTABLE-BUT-NEGLIGIBLE`, `REPRESENTATIVE`, `INCONCLUSIVE`) — the override
  is `temporal.detected ? 'STOP-BIFURCATION' : aggregateVerdict`, structurally
  branch-agnostic. *(§A3-REV1 enumerated five before R2 existed; this RESULT
  records the sixth append-only — A3-REV1 is not retro-edited.)*
- **Degenerate-stop robustness (beyond the five-branch list).** STOP-BIFURCATION
  is computed BEFORE the `N_drop==0` drop-collapse pre-check and overrides it too
  — a bifurcation is the more load-bearing finding even on a degenerate ledger.
- **Run-start alignment locked** (§A3-REV1 forbidden item): a +37-min wall-clock
  shift leaves the onset bucket index unchanged (pinned in the test).

### Pre/post predicate (§A5) — both fixtures, RED-proofed vs `edfa433`

Fixtures are **synthetic**, generated programmatically from the §0.2 cadence +
the PR#274 blip catalogue (minutes 1/11/49/63/78/160/188) in
`tests/audit9TemporalBins.test.js` — re-derivable, never a `chaos-reports/`
extract (survives the §0.4 visibility caveat).

- **CATCH** (Phase-1 + 7 blips + sustained Phase-2) → **MUST** surface
  STOP-BIFURCATION. RED-proof vs `edfa433`:
  ```
  OLD (edfa433): verdict=REPRESENTATIVE | has temporalBins? false
  NEW (AUDIT-9): verdict=STOP-BIFURCATION | detected=true | onsets=[40] | aggregate=REPRESENTATIVE
  DISCRIMINATES: true
  ```
  The frozen aggregate called the bifurcated run **REPRESENTATIVE** — the exact
  #238 failure mode. AUDIT-9 overrides it.
- **NO-FALSE-POSITIVE** (8 h-equivalent Phase-1 with the 7 blips, no Phase-2) →
  **MUST NOT** flag. Pinned: `detected=false`, every 5-min bucket keeps
  `reached_pick > 0` despite a 1-min blip (the §A1 blip-robustness calc), verdict
  routes on the aggregate.
- **Existing-fixture pin (§A5).** `tests/audit8AnalyzeRepresentativeness.test.js`
  stays **green, unmodified by AUDIT-9** — its `at:'t'` fixtures have no parseable
  timestamps → `applicable:false`, so the temporal verdict never fires there
  (the §0.2 verdicts are preserved). No silent relaxation. *(R2 consciously
  updated ONE pin in that file for the B2 re-attribution, documented in the R2
  RESULT — that is an R2 change, not an AUDIT-9 one.)*
- Pure-contract pins (10 tests): K=2 (single zero bucket + recovery → no fire),
  multi-onset exhaustive emission, cold-start anchor strictness (no Phase-1
  anchor → no fire), run-start alignment, blip robustness.

### §A6 re-freeze chain — verified

```
git log --oneline -- scripts/analyze_pick_representativeness.mjs
  → edfa433        (R1: frozen analyzer, #236)
  → <R2 commit>    (R2: B2 determinate-denominator re-derivation, #327)
  → <AUDIT-9 commit> (this PR: temporal-bin instrumentation)
```

AUDIT-9 was cut stacked on the R2 branch and merges after R2, so on `main` the
analyzer history is exactly `edfa433 + R2 + AUDIT-9` per §A6.

### Scope honored / open optionality (§A6 option a vs c)

R1.5 RESULT did NOT come back Class A with no per-question evidence (it came back
Class A **refuted**, Class C leading-by-inference). The temporal join consumes
ledger event timestamps (`at`), which the existing ledger already carries — no
separate-file post-processing (option c) was needed; the in-analyzer integration
(option a) is clean. No `q.c` / `broken` / Toranot / new-scenario touched.
Trinity untouched (analyzer + lib + test only).

### Net state

AUDIT-9 is **landed and offline-validated**. R3 (the paid bounded run) stays
gated behind: R1.6 live-GREEN (overnight) + a separate paid-run go
(**$20 cap NOT widened**, config inherited UNCHANGED). When R3 runs, this
instrument will surface any Phase-1 → Phase-2 bifurcation the pooled rate would
otherwise hide.
