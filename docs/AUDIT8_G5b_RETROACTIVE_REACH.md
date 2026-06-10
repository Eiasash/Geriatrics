# AUDIT-8 G5(b) — retroactive-reach characterization (DOCUMENT-only — audit-evidence, NO self-merge)

## Scope & method (a characterization, not a run)

G5 trigger (b), as named in the CERT (`docs/AUDIT8_G5_REPAIR_GATE.md`) and
`docs/AUDIT8_G5a_REPAIR_GATE.md`: *"retroactive-reach characterization — DOCUMENT, do not
auto-rerun; no `q.c` flip, no `broken` change."*

This document characterizes the retroactive reach of the `t` (exam-provenance / source-era)
bias finding, grounded entirely in the already-recorded numbers in the prior gate docs. It
runs no bot, changes no analyzer, flips no `q.c`, and touches no `broken` flag. The original
biased run's granular per-era ledger (`chaos-reports/v4-long/audit8_20260518T191705Z/…`) is
not committed to this repo, and a rerun is forbidden by the CERT's cost gate — so this
characterization stays at the level the cited gate docs establish and deliberately does **not**
re-derive a fresh per-era breakdown.

## What the bias was (recap, cited)

Per CERT #348 (`docs/AUDIT8_G5_REPAIR_GATE.md`): `aggregateVerdict = BIASED`; biased axis =
`t` (question provenance / exam-source-era) **only**; χ²=42.96, pAdj=2.34e-9, Holm-reject; at
`Ndrop=47`, `Nretain=1148`. All other covariates null. The effect lives entirely in the bot's
pick-parse drop channel (`ai-parse-error/pick`) and is explicitly **not** a content /
answer-key defect. No Phase-1/Phase-2 bifurcation in the analyzed buckets
(`temporalBins.detected=false`).

## Retroactive reach — what the finding does and does not touch

**Does NOT touch (no retroactive re-flagging required):**
question content, answer keys (`q.c`), accepted-alternatives (`c_accept`), the 110 curator
overrides, `broken` flags, or distractors. The CERT scopes the defect to the bot's parse
channel, not the dataset ("Scope unchanged — bot's pick-parse drop channel, NOT a
content/answer-key defect"). Those artifacts are independently sourced and ratchet-guarded; the
`t`-bias does not implicate them, and **no content decision is retroactively invalidated.**

**Does touch (bounded):**
any representativeness conclusion *derived from the pre-G5(a) drop channel* inherits the
`t`-skew — the set of questions the pre-fix bot dropped was era-correlated, so a drop-based
sample was not provenance-neutral. That is exactly what the CERT verdict records, so the reach
is already disclosed at series level, not a latent liability. Because the skew is a property of
the pre-G5(a) bot's parse channel, the same property is shared by any earlier run that used
that channel; a per-prior-audit re-scoping (audit-5/6/7, earlier audit-8 phases) is **out of
scope** for this DOCUMENT-only characterization and would need its own review. This doc asserts
only the common mechanism, not a verdict on any specific prior result.

## Post-fix state (cited)

Per the §4.B re-cert #358 (`docs/AUDIT8_G5a_REPAIR_GATE.md`): after G5(a), drops 47→30; the
`t` effect fell V=0.190→0.087 (below the 0.10 floor — `biasSignal` true→false) while still
raw-Holm-rejecting (pAdj=0.0102); the five-option E-suppression drop subclass was eliminated.
The forward reach is therefore closed at achievable power: the drop channel no longer carries a
floor-crossing `t` effect. (The aggregate stayed BIASED on an under-powered `bilingual`
near-miss — separately characterized as a de-bias redistribution artifact, n=5, neither
certifiable nor dismissible; that is not part of (b).)

## Net

The `t`-bias's retroactive reach is bounded to drop-channel-derived sampling, is fully
disclosed at series level, and implicates no content / answer-key artifact. Post-G5(a) the
reach is closed at achievable power. No retroactive `q.c` or `broken` change is warranted, and
none is made.

## Trigger status

This closes G5 trigger **(b)**. Trigger **(a)** shipped (#355/#356; re-cert #358/#359). Trigger
**(c)** (Geri judge `max_tokens`) remains **BLOCKED** by the CERT (stays gated until R3 routes a
verdict) and is additionally moot — G5(a) recovered the truncation class without a token bump.
No further G5 work is open; any continuation requires a fresh pre-registered gate per the
capstone.
