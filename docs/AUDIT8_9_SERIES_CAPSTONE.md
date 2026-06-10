# AUDIT-8/9 diagnostic series — CAPSTONE (series formally CLOSED)

**Status:** CLOSED — 2026-06-09. Terminal verdict landed 2026-06-08 (#348, CERT run).
**Scope of this doc:** index + formal close only. It re-derives nothing. Every claim below
points to an already-merged, on-main artifact (gate doc § / PR# / `file:line` / test path).
It flips no `q.c`, changes no `broken` flag, runs nothing, and re-opens no gate.

---

## Terminal verdict

**`BIASED` on `t` (provenance / exam-era) ONLY.**
Source: `docs/AUDIT8_G5_REPAIR_GATE.md` § "VERDICT — `BIASED` on `t` ONLY" (CERT tail, added in #348).

- `t`: χ²=42.96, p=4.69e-10, Holm-adjusted p=2.34e-9, Cramér's V=0.190 → `biasSignal=true`
  (the only covariate clearing both Holm-reject AND effect ≥ floor; analyzer
  `scripts/analyze_pick_representativeness.mjs:389`).
- The other 4 covariates show **no signal**: `stem_len` (p=0.117), `topic_group` (p=0.375),
  `bilingual` (near-miss: raw p=0.025 but φ=0.068 < 0.10 floor, pAdj=0.099 does not reject),
  `c_accept` (p=1.0).
- This **landed the pre-registered BIASED branch**, not a surprise: the pre-reg named
  "INCONCLUSIVE … or BIASED if a covariate signal survives at n≈38"; observed `Ndrop=47`,
  `t` survived Holm across the 5-covariate family.

**B1 CLOSED.** `t` is determinable at member level; the data-qidx instrument works on real data.
`STOP-JOIN-NONDETERMINABLE` is eliminated.
Source: `docs/AUDIT8_G5_REPAIR_GATE.md` § "Step (a) — recoverability determination → B1 CLOSED".

---

## Scope guardrail (do not over-read the verdict)

The bias is a property of the **chaos-bot's `ai-parse-error/pick` drop channel** — the bot
fails to parse a pick on a non-uniform fraction of questions by source-era. It is **NOT** a
content / answer-key defect. No `q.c` flip and no `broken` change follows from it.
Source: `docs/AUDIT8_G5_REPAIR_GATE.md` § "THREE GUARDRAILS ON READING THIS VERDICT" (guardrail 3).

`REPRESENTATIVE` for the quiet covariates was **unreachable as pre-registered — an honest
outcome, not a gap**: `Ndrop=47 < MIN_N_DROP=80`, `powered=false`; the `BIASED`-on-signal
branch routes before the `powered` gate (analyzer `:411-416`). Reaching `Ndrop ≥ 80` needs a
longer run ⇒ > $20 ⇒ cap widening, **forbidden by the gate**. Absence of evidence ≠ evidence
of absence at n=47 — the 4 quiet covariates are NOT certified representative.

---

## AUDIT-9 (temporal) status

The temporal-bin analyzer (to surface Phase-1→Phase-2 bifurcation that the single-aggregate
verdict had pooled) is **implemented and offline/fixture-complete** (2026-06-06).
Source: `docs/AUDIT9_PRE_REGISTERED_GATE.md` § "AUDIT-9 IMPLEMENTATION RESULT".
Fixture-pinned by `tests/audit9TemporalBins.test.js` (NOMINAL `detected=false` / CATCH
`detected=true`, onsets=[40]). The CERT run routed `BIASED`-on-`t`, **not** a
`STOP-BIFURCATION` — i.e. no bifurcation STOP was raised in the certified run.
*(No live full-ledger bucket sweep is claimed here; only what is committed/test-pinned is.)*

---

## Content actually shipped by the series (net improvement)

- **68 two-pass-confirmed answer-key corrections:** #343 (6, conf ≥ 90) + #344 (62) [B4].
- **Distractor restorations** after the key flips: #345 (Q#2546), #346 (4 questions).
- **q#2059** key flip C→D (comfort-focused care) #347 + canonical goals-of-care ref fix #350.
- **Security (parked items closed in-series):** #335 escape untrusted question content at
  render sinks (XSS); #336 stop cloud-syncing the API key (P0 exfiltration).
- Bot/selector hardening: #332, #349 (data-testid pins).

---

## What is explicitly NOT done (by design — separate gated lanes)

Per `docs/AUDIT8_G5_REPAIR_GATE.md` § "G5 ROUTE": *"This CERT closes the
instrument/determinability question (B1) and lands the verdict; it does not itself remediate.
Remediation is a separate gated lane."* The three G5 triggers each carry their own
session/gate and **none is taken**:

1. (a) harden the chaos-bot pick-parser so the `ai-parse-error/pick` drop channel stops
   skewing by era;
2. (b) retroactive-reach characterization — DOCUMENT-only;
3. (c) the Geri judge `max_tokens` horizon item (stays BLOCKED until a route opens).

Full `REPRESENTATIVE` certification is **budget-forbidden** (needs `Ndrop ≥ 80` ⇒ > $20 run;
gate caps at $20). Not a defect — a declared boundary.

---

## Artifact index

| What | Where |
|---|---|
| Verdict + B1 close + guardrails | `docs/AUDIT8_G5_REPAIR_GATE.md` (CERT tail, #348 `bd23cc3`) |
| Pre-registration (AUDIT-8) | `docs/AUDIT8_PRE_REGISTERED_GATE.md` |
| Instrument / corpus-index gate | `docs/AUDIT8_PRESTEP_INSTRUMENT_GATE.md` (#342) |
| Tooling crosswalk | `docs/AUDIT8_ANALYSIS_TOOLING_CROSSWALK.md` |
| R1.5 mechanism capture | `docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md` |
| AUDIT-9 temporal gate + impl result | `docs/AUDIT9_PRE_REGISTERED_GATE.md` |
| Frozen analyzer | `scripts/analyze_pick_representativeness.mjs` (verdict branches `:411-416`) |
| Answer-key corrections | PRs #343, #344 (#345/#346 distractors, #347/#350 q#2059) |
| Pinning tests | `tests/audit8AnalyzeRepresentativeness.test.js`, `tests/audit9TemporalBins.test.js` |

**The series is closed. Re-opening any arm requires a fresh pre-registered gate, not an
edit to this doc.**

---

## POST-CLOSE ADDENDUM — 2026-06-10 (index pointer only; the series stays CLOSED)

This addendum does **not** re-open any arm of the series. G5 **trigger (a)** was
subsequently executed under its own fresh pre-registered gate — exactly the mechanism the
closing sentence above requires — and this pointer exists so the capstone's index stays
truthful. It re-derives nothing; every claim points to the on-main artifact.

**G5 trigger (a) — EXECUTED.** Gate + execution record + bounded re-cert RESULT + dated
correction, all in `docs/AUDIT8_G5a_REPAIR_GATE.md`:
- Pre-registered gate + fix: PR **#355** (`pickParse.mjs` layered parse + one corrective
  retry + optCount-sized letter table + `letterFor`) and PR **#356** (`SYS_DOCTOR_PICK`
  contract permits E on the 38 five-option GRS8 questions — Codex P2).
- Execution record (conformance vs the pre-registration, one recorded deviation): PR **#357**.
- §4.B bounded re-cert RESULT (8 h, $19.21, cap NOT widened, frozen analyzer): PR **#358**.
  **Post-fix state:** `t`'s bias **signal removed** (Cramér's V 0.190 → **0.087**, below the
  0.10 floor; `biasSignal` true→false; `t` still RAW-Holm-rejects at pAdj=0.0102); drops
  **47 → 30**; the five-option E-suppression drop subclass **eliminated**; **aggregate verdict
  still `BIASED`** — now on an **under-powered `bilingual`** flag (φ=0.102, 0.002 over floor,
  5-count drop cell, `Ndrop=30 < 80`), not certifiable as real or spurious at the closed
  budget. `REPRESENTATIVE` remains unreachable (cap closed). Scope guardrail unchanged:
  drop-channel property, NOT a content/answer-key defect.
- Dated correction marker (bilingual-artifact direction prose was inverted; tables were
  always correct): PR **#359**.

**Terminal-verdict scope note.** The "Terminal verdict" section above remains the truthful
record of the series-close state (CERT run, corpus `2b26d358…`). The G5(a) re-cert is a
**separate post-fix snapshot** (corpus `c34cc4e0…`); it supersedes nothing in this doc — the
two verdicts answer different questions (pre-fix vs post-fix channel behavior).

**Still NOT done (unchanged):** G5 triggers **(b)** and **(c)** — their own gated sessions;
the **`bilingual`** characterization, if ever pursued, is likewise its own gated session and
needs a power argument the $20 cap does not provide.

| Addendum artifact | Where |
|---|---|
| G5(a) gate + execution record + §4.B RESULT + correction | `docs/AUDIT8_G5a_REPAIR_GATE.md` (#355–#359) |
| Pick-parse module + harness | `scripts/lib/pickParse.mjs`, `tests/pickParseResilience.test.js`, `tests/chaosBotV4PickDropInvariant.test.js` |
