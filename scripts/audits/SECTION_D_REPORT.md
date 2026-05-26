# Shlav A Mega — Section D Audit Report

**Generated:** see `sectionD_report.json` / `sectionD_ui_report.json` for machine-readable.
**Source files:** `data/questions.json` (3,823 Qs), `shlav-a-mega.html` (705.6 KB, 8,379 lines).
**Scope:** Investigate-only. ZERO code/data mutations. Surfaces real numbers before any D-bucket PR.

---

## Headline numbers

| Check | Count | % of total | Memory said | Verdict |
|---|---|---|---|---|
| **D1.** Hazzard ch 2-6 / 34 / 62 cited (EXCLUDED by P005-2026) | **217** | 5.68% | not tracked | **new finding — real content gap** |
| **D2.** `c_accept` length-1 redundancy | 0 | 0% | — | clean, no work |
| **D3.** `c_accept` multi-correct (length ≥ 2) | 48 | 1.26% | ~50 | matches ±2 |
| **D4.** Missing `e_en` (English explanation) | **1,876** | 49.07% | 49% / ~1876 | exact match |
| **D5.** `q_en` (English question) coverage | 1,947 | 50.93% | ~51% | exact match |
| **D7.** Harrison chapters cited but not indexed | 14 chs / 99 Qs | 2.59% | 15 chs / 100 Qs | matches ±1 |
| **D8.** RTL/LTR-mixed stems (Hebrew + Latin) | **2,969** | **77.66%** | not tracked | **typographic-hierarchy candidate pool** |
| **D9.** `broken` flag set | 24 | 0.63% | 24 | exact match |
| **D10.** Empty `ref` field | 80 | 2.09% | not tracked | new finding |

---

## D1 — Hazzard-excluded chapter orphans (217 Qs)

Excluded chapters per P005-2026: **2, 3, 4, 5, 6, 34, 62**. These questions cite material that is no longer in scope. Two paths forward:

1. Re-`ref` to a valid in-scope chapter (preferred where the question topic is still in scope).
2. Add a `_syllabus_orphan: true` flag and exclude from the default question pool (preferred where topic is genuinely out of scope).

Chapter histogram of orphan citations is in `sectionD_report.json` → `D1_syllabus_orphan_hazzard_excluded.excluded_chs_with_cites`.

## D4 — English-explanation gap (1,876 Qs)

49.07% of questions have no `e_en`. This is a content-generation task. Cost-bounded batch via `/api/claude` proxy is feasible:

- **Estimate:** 1,876 questions × ~600 input tokens × ~400 output tokens ≈ 1.9M total tokens. At Sonnet 4.5 pricing (~$3/M input + $15/M output) → roughly **$15–25 total**. Cheap.
- **Risk:** Memory rule R6b — rescued/AI-generated medical content can fabricate citations. Any batch run must be sample-validated against Hazzard 8e / Harrison 22e source text, not just face-validated. Recommend: pilot 50 Qs → manual spot-check 10 → tune prompt → proceed.

## D7 — Harrison missing chapters (99 Qs across 14 chapters)

Memory listed 15 chapters; audit finds 14 in the cited set. Either one was added since the memory update or the regex caught one differently. Full missing list in `sectionD_report.json` → `D7_harrison_chapter_gap.missing_chapters`. Graceful UX already shipped via #285; content fill needs textbook input from Eias (one chapter at a time).

## D8 — RTL/LTR-mix typographic pool (2,969 Qs)

77.66% of questions mix Hebrew and Latin scripts in the stem. Font-stack inspection of `shlav-a-mega.html`: Inter and Heebo both loaded. The typographic-hierarchy fix is one CSS rule:

```css
/* Wrap Latin runs inside Hebrew with Inter, leave Hebrew on Heebo */
[lang="he"] :where(en, [lang="en"], code, .lat) { font-family: 'Inter', system-ui, sans-serif; }
```

The harder problem is that questions store mixed-script content as raw strings without `<span lang="en">` wrapping. Two options:

- **Cheap:** CSS `unicode-bidi: plaintext` + a font stack that lists Inter *before* Heebo — browser picks per-glyph. Risk: Hebrew metric mismatch in mixed lines.
- **Correct:** Render-time pass that wraps Latin runs in `<span lang="en">`. ~10 lines of JS. Recommended.

---

## UI / CSS surface (from `sectionD_ui_report.json`)

| Metric | Value | Interpretation |
|---|---|---|
| **File size** | 705.6 KB | Single-file PWA |
| **Inline-styled `<button>` tags** | 138 | Migration target for `.btn` class system |
| **Total `style=` attributes** | 789 | Broad inline-style use |
| **`onclick` handlers** | 222 | Acceptable inline-handler pattern |
| **Unique hex colors** | 152 | High; semantic mapping would compress to ~12 |
| **Total hex color literals** | 905 | Mostly raw, not via token |
| **CSS color-token occurrences** | 128 | 12.4% of color usage — 87.6% migration debt |
| **`.btn` class definitions** | 7 | `.btn`, `.btn-primary`, etc. |
| **Total `<button>` tags** | **182** | The real population for migration math |
| **`<button>` with `.btn*` class** | 78 | **42.9% adoption rate** |
| **`<button>` with inline style** | 138 | |
| **`<button>` with both class AND inline** | 60 | Mixed — class adopted but inline overrides remain |
| **Fully migrated (class-only)** | 18 | **Only 9.9%** — real "done" count |
| **Inline-only (no class)** | 78 | 42.9% un-migrated |
| **`--tap-min` definitions** | 1 | Token exists |
| **`--tap-min` `var()` refs** | 1 | Dead-weight — never propagated to buttons |
| **Unique padding values** | 80 | Needs base-unit normalization (4px or 8px) |
| **Font sizes under 12px (distinct)** | 7 | Readability risk on phone — top offenders in JSON |
| **Native `confirm()`** | 2 | Inline-modal-replacement candidates |
| **Native `alert()`** | 0 | Clean |
| **Top 5 raw colors** | `#fff` 92, `#dc2626` 78, `#059669` 59, `#e2e8f0` 32, `#d97706` 28 | Map cleanly to fg / danger / good / border / warn |

---

## Recommended ship slices (Section D)

Per the captain-mode directive — **no mega-PRs, one slice per PR**:

1. **PR S1 (this PR):** audit scripts + reports. **Zero behavior change.** ← *you are here*
2. **PR S2:** quiz Check / Next button migration to `.btn` / `.btn-primary` (hot-path, daily-visible). Remove ~10 inline styles, no other changes.
3. **PR S3:** mixed-script typographic fix — CSS rule + (optional) render-time `<span lang="en">` wrapper for Latin runs. Visible on every screen.
4. **PR S4:** quiz-card color migration (semantic tokens for top 5 colors only). Smallest visible color slice.
5. **PR S5 (data, separate cycle):** D1 syllabus-orphan resolution — 217 Qs re-ref'd or flagged.
6. **PR S6 (data, separate cycle):** D4 e_en pilot batch (50 Qs) → expand only after spot-check.

Each slice ships independently, self-merges per CLAUDE.md authority.

---

## Reproducibility

```bash
node scripts/audits/sectionD_content_audit.cjs   # writes sectionD_report.json
node scripts/audits/sectionD_ui_audit.cjs        # writes sectionD_ui_report.json
```

Both are deterministic, run in <1s, zero deps.
