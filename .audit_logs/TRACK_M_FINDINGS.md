# Track M — investigate Track K side-finding (4 condensed 2021-Dec entries) + 1 mis-routed ref fix

**Date:** 2026-05-04
**Status:** Closed — 4 condensed entries verdicted as intentional curator-written second-editions; 1 mis-routed ref fixed; shipped v10.64.37.

## Background

Track K (v10.64.36) flagged 4 non-broken 2021-Dec entries (idx 285, 287, 299, 347) as appearing to be "condensed summaries of 2021-Jun originals" (idx 2402, 2403, 2405, 2408). The question for Track M: are these intentional curator-written second-editions, or parser by-products that should be flagged broken?

Workstream-2 leftovers from `NEXT_SESSION_BRIEF.md` (idx 2694 and 2758 hand-cleans) were also re-checked.

## Findings

### Finding 1: idx 2694 + 2758 already cleaned

The brief is stale (last updated 2026-05-03 at end of v10.64.17). The CHANGELOG shows:

> v10.64.21 — 🧹 Final 2 multi-pipe ref hand-cleans — idx=2694 (DKA vs HHS in elderly): set to `הזארד פרק 99 (Diabetes Mellitus)`. idx=2758 (COVID-19): cleaned to `הזארד פרק 108, עמ' 1737-1738 (גריאטריה בסיס)`.

Verified live: both refs are clean. **Workstream 2 is fully done. Brief should be updated.**

### Finding 2: 4 condensed 2021-Dec entries are intentional second-editions

Strong evidence each pair is curator-deliberate, not parser-induced:

| Pair | 2021-Dec | 2021-Jun | Same options? | Same `c`? | Independent `e`? | Refs differ? |
|---|---|---|---|---|---|---|
| 285 ↔ 2402 | 157 chars | 713 chars | ✓ | ✓ (c=0) | ✓ (different content) | ✓ (Ch 75 vs Ch 83) |
| 287 ↔ 2403 | 100 chars | 522 chars | ✓ | ✓ (c=1) | ✓ | same (Ch 51) |
| 299 ↔ 2405 | 129 chars | 408 chars | ✓ | ✓ (c=1) | ✓ | ✓ (Ch 94 vs Ch 1) |
| 347 ↔ 2408 | 115 chars | 446 chars | ✓ | ✓ (c=1) | ✓ | ✓ (Ch 44 vs Ch 22) ← **Ch 44 is wrong** |

Why these are intentional, not parser by-products:
- **Hebrew is grammatical.** Compare to Track-K broken entries (idx 14, 50, 97, 132, 2415) which start mid-sentence with isolated lab values ("K mmol/L 4.5..."). Condensed entries open with proper case framing ("בן 72 עם severe aortic stenosis...", "בת 70 עם Multiple Myeloma...") — readable summaries no parser would produce.
- **Standardized formatting.** Condensed option text is cleaner — "denosumab (prolia)" vs original "denosumab ( prolia)" with space artifact. Curator manually de-spaced.
- **Independent AI explanations.** Each `e` field is a separately-generated explanation (different word counts, different framing). No parser would generate explanations.
- **Sometimes improved refs.** idx 285 condensed has `Ch 75 VALVULAR HEART DISEASE` — captures the severe-AS mechanism better than original 2402's `Ch 83 KIDNEY DISEASES` (though Ch 83 is more on-topic for the dialysis indication question).

**Verdict:** ✅ All 4 are intentional curator second-editions. **Do not flag broken=true. They're meant to coexist with originals as alternative quiz forms** — short and long versions of the same exam content.

### Finding 3: idx 347 has a real mis-routed ref

Of the 4 condensed entries, one ref is unambiguously wrong:

- **idx 347** (clozapine-induced agranulocytosis question, ti=8 polypharmacy): ref was `Hazzard Ch 44 — SLEEP DISORDERS`. Sleep is not the topic of a clozapine-neutropenia question.
- The 2021-Jun sibling (idx 2408) has the correct ref: `Hazzard Ch 22 — MEDICATION PRESCRIBING AND DE-PRESCRIBING`.
- Likely a curator copy-paste error during condensation (Ch 44 was probably from a nearby question).

The other 3 condensed entries (285, 287, 299) have refs that are defensible alternatives to their originals' refs — not bugs, just curator preference.

## Action shipped (v10.64.37)

- **idx 347**: `Hazzard Ch 44 — SLEEP DISORDERS` → `Hazzard Ch 22 — MEDICATION PRESCRIBING AND DE-PRESCRIBING`

q/o/c/e/t/ti unchanged. Single-field fix on a single entry. Apply script at `.audit_logs/track_m_apply.py`.

## Aggregate state of `NEXT_SESSION_BRIEF.md` workstreams

| Workstream | Status |
|---|---|
| 1 — OCR for 2021-Dec | SUPERSEDED (v3 bundle parser already used; 47 still unmapped, low ROI to chase) |
| 2 — Source CSV re-extraction | **CLOSED** (482/484 done in v10.64.15+16; final 2 done in v10.64.21) |
| 3 — Hand-map 24 unmapped | OPEN (low ROI; image-only or curator-rewrites with no token overlap) |
| 4 — syllabus_data.json refresh | OPEN (cross-repo dependency on auto-audit Python script) |

## Open follow-ups

After Track M, what's still open in the Geriatrics audit:

1. **Distractor regeneration** — Track I (55.4% drift). Budget decision.
2. **syllabus_data.json refresh** — `Geri.total_questions_analyzed = 3833` should be 3743; per-topic frequencies stale by 1-2%. User-impact small. Cross-repo coordination needed (auto-audit Python script must re-emit fixture).
3. **Hand-map 24 unmapped** — low ROI marginal recovery.

The `NEXT_SESSION_BRIEF.md` itself is stale — Workstream 2 is fully closed but the brief still describes it as 99.6% done.

## Files

- This findings doc: `.audit_logs/TRACK_M_FINDINGS.md`
- Apply script: `.audit_logs/track_m_apply.py`
- Backup: `data/questions.json.bak-20260504T075220Z`
- Sister tracks: `.audit_logs/TRACK_J_FINDINGS.md`, `.audit_logs/TRACK_K_FINDINGS.md`, `.audit_logs/TRACK_L_FINDINGS.md`
