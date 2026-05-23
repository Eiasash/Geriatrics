# Schema Proposal: Optional Q-Schema Extensions from R13 Reference Content

**Status:** DRAFT — proposal only. No code change, no data change, no migration.
**Author:** terminal Claude, session 2026-05-23
**Related archive:** `~/archive/geriatrics-reference-content/` (R13 reference file + README)

## Context

The 2026-05-21 home-directory decontamination rescued four files of geriatric-MCQ
reference content. After audit (2026-05-23), all four were classified as
REFERENCE-ONLY (not corpus-merge candidates) due to schema incompatibility with
the live `data/questions.json` (no `ti` index, no `ref` chapter cite, English-
primary stems vs Hebrew-primary live, no exam-year `t` tag).

However, one of the four files — `R13_quizSystem.js` — carries three Q-schema
fields that the live schema does not have. The fields themselves are worth
considering as optional extensions, independent of whether R13's content
is ever merged.

## Live schema today

Per `data/questions.json` (3823 Qs as of v10.64.130):

```js
{
  q: "Hebrew stem (primary)",
  o: ["option A", "option B", "option C", "option D"],
  c: 0,                               // numeric idx into o[]
  t: "2022-Jun-Basic",                // exam tag
  ti: 12,                             // IMA topic index (0-26)
  ref: "Hazzard Ch 47 — Falls",       // single chapter cite (mandatory)
  tis: [12],                          // topic indices array
  // optional:
  q_en: "English stem (when bilingual)",
  o_en: ["English options..."],
  e_en: "English explanation",
  c_accept: [1, 2],                   // additional accepted indices
  img: "url",
  // etc.
}
```

100% of Qs have `q / o / c / t / ti / ref / tis`. ~50% have the bilingual layer.

## R13's schema delta

R13 entries carry three fields absent from live:

```js
{
  // ... standard fields above ...
  clinicalPearl: "Apixaban has lower bleeding risk than warfarin in elderly with AF.",
  relatedCalculators: ["CHA2DS2VASc", "HASBLED"],
  references: ["ARISTOTLE trial", "ESC Guidelines 2020"]
}
```

## Proposed schema additions

Three new **optional** fields, all backward-compatible. Naming kept terse to
match the existing convention (`q`, `o`, `c`, `t`, `ti`, `ref`, `tis`):

| Field  | Type             | Required | Description                                                           |
|--------|------------------|----------|-----------------------------------------------------------------------|
| `pearl` | `string`         | optional | 1-2 sentence clinical takeaway shown after the user answers           |
| `calc`  | `string[]`       | optional | Calculator IDs to surface alongside the Q (must reference existing in-app calc) |
| `refs`  | `string[]`       | optional | Multi-source citation array (complements existing `ref`, does not replace it)   |

### Naming rationale

- `clinicalPearl` → `pearl`: terse convention.
- `relatedCalculators` → `calc`: terse convention.
- `references` → `refs`: avoids confusion with the existing `ref` single-cite
  field; the plural makes the array-vs-string distinction obvious in code.

### Why `refs` array AND existing `ref` string both?

Adding `refs[]` does **not** deprecate `ref` (string). The existing field stays
as the primary single-source cite (matches the current 3823 / 3823 mandatory
convention). The new `refs[]` is for Qs that genuinely span multiple chapters
or guidelines (e.g., an AF-anticoag Q citing both Hazzard CV chapter and the
ESC 2020 guideline). UI can render `ref` first, then expand to `refs[]` on
"see more sources" interaction.

Alternative considered and rejected: promote `ref` to `string | string[]` (union
type). Rejected because every downstream consumer would need to type-check;
keeping the two fields separate is cheaper.

## Backward compatibility

- All three fields are **optional**. Existing 3823 Qs need zero backfill.
- The current Q renderer in `shlav-a-mega.html` ignores unknown fields; adding
  these fields without updating the renderer is a no-op visually.
- `tests/regressionGuards.test.js`'s `Q count === 3823` assertion is unaffected;
  the structural field-presence checks would need additional asserts only if
  field-addition is promoted to required.
- No JSON-schema validator currently strict-modes the corpus, so new fields
  pass through cleanly.

## Migration cost

| Scenario | Qs affected | Cost |
|---|---|---|
| Schema-only PR (this proposal) | 0 | docs-only, no migration |
| Adopt fields, populate nothing | 0 | renderer gains conditional branches, fields stay empty |
| First-author PR (1-2 example Qs) | 1-2 | trivial; validates the UI flow end-to-end |
| Backfill `pearl` on high-yield Qs | ~50-100 | clinical-author session, optional |
| Backfill `pearl` on ALL Qs | 3823 | substantial — likely AI-assisted with curator review |
| Backfill `calc` on relevant Qs | varies | needs `calc`-vocabulary registry first |

**Session-scope HALT trigger** in original brief was "R13 schema extension touches
more than 50 existing Qs". This proposal touches **zero** existing Qs, so the
HALT does not trip.

## Impact on existing tooling

**`scripts/regen_derived.cjs`** — verified at HEAD `6ceddfc`, line 69:

```js
const n = questions.filter(q => q.ti === topic.id).length;
```

The regen reads **only `q.ti`**. New optional fields have **zero impact** on
the regen pipeline or its CI gate.

**`scripts/tag_regulatory.cjs` / `scripts/tag_chapters.cjs`** — should be
verified similarly (likely only consume `q.q` / `q.o` / `q.ti`).

**Service worker cache** — unaffected. Schema additions don't change file size
materially; the existing `APP_VERSION` bump on any data PR triggers cache
refresh as usual.

**Test fixtures** — `tests/regenDerived.test.js` and `tests/regressionGuards.test.js`
pin `3823` Q-count; field additions don't change count, so fixtures stay valid.

## Calc-vocabulary (deferred sub-decision)

The `calc` field needs a registered vocabulary of in-app calculator IDs to be
meaningful. Existing calculators per `shlav-a-mega.html` (enumerate properly
during implementation PR):

- `CrCl` (Cockcroft-Gault creatinine clearance)
- `CFS` (Clinical Frailty Scale)
- `MNA` (Mini Nutritional Assessment)
- `CHA2DS2VASc`
- `HAS-BLED`
- ...others

A simple validator at corpus-load time can ensure each `calc` value is a known
calculator ID, warning on unknown IDs (warn, not error, to allow forward-compat).

## Implementation plan (IF accepted — NOT this PR)

This proposal does NOT commit to any of these. Listed only to clarify scope.

1. **Schema-acceptance PR** (no data change): teach corpus-load and any
   field-checking tests to accept the three new optional fields. ~30 lines.
2. **UI-render PR** (no data change): renderer learns to display `pearl` /
   `calc` / `refs` when present; absence falls through to existing render.
   ~100 lines + visual review.
3. **First-author PR** (data change): 1-2 example Qs populated with all three
   fields to validate UI flow. Trivial migration cost (no fixture changes).
4. **Optional backfill campaign**: clinical-author session to populate `pearl`
   on selected high-yield topics. Out of scope for the schema PR sequence.

Each step is independent. Rejecting (1) prevents (2)/(3)/(4). Accepting (1)
does not commit to (2)/(3)/(4).

## Risks and considerations

- **Schema bloat:** three optional fields is a small bloat, but conventions
  matter — if every minor enhancement adds a field, the schema becomes
  unwieldy. Recommendation: only add if at least two of the three have
  identifiable UI need within the next quarter.
- **Cross-repo siblings (Pnimit / Mishpacha):** the deploy-primitives § 10
  sibling-contract says shared engine files (`shared/fsrs.js`) propagate
  across § C / § D / § E. Question-schema is per-repo, but if sibling repos
  later want the same fields, naming should match. Worth a cross-repo notice
  during the schema-acceptance PR (not this one).
- **No clinical pressure to ship:** no user-reported gap, no exam-board
  requirement. This is opportunistic. Defer is a defensible answer.

## Decision needed (from Eias)

- [ ] **Accept** proposal — proceed to schema-acceptance PR.
- [ ] **Accept with naming changes** (please specify).
- [ ] **Defer** — revisit when a concrete UI need emerges.
- [ ] **Reject** — schema bloat not justified.

## References

- Source file: `~/archive/geriatrics-reference-content/R13_quizSystem.js`
- Archive context: `~/archive/geriatrics-reference-content/README.md`
- Related main-branch campaign: PRs #254 / #255 / #256 (82 rescued MCQs normalized
  via merge-questions.cjs + v10.64.93 explanations split)
- Audit conclusion thread: terminal Claude session 2026-05-23
