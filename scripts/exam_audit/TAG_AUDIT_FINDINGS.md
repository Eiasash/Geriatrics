# Exam Tag Audit — Findings and Recommendations

Run via `python3 scripts/exam_audit/audit_tag.py <tag>`. Classifies each entry in
a tag as VERIFIED (matches canonical exam PDF), MISTAGGED (matches a DIFFERENT
exam's canonical), or ORPHAN (no canonical exam match — usually AI-generated
practice content).

## Results (April 2026 run)

| Tag | Entries | Verified | Mistagged | Orphan | Interpretation |
|---|---|---|---|---|---|
| `ספט 24` | 342 | 73 | **269** | 0 | **Heavy pollution.** 91 match May24 Al, 44 May24 basis, 80 2025 Al, 54 2025 basis. Real exam Qs with wrong exam label. |
| `יוני 23` | 249 | 189 | 0 | 60 | Clean tagging. 60 orphans are AI-generated practice Qs. |
| `2021` | 100 | 8 | 0 | **92** | Mostly AI-generated. Only 8 entries are real 2021 Al Qs (matches against canonical PDF). |
| `2023-ב` | 95 | ~60 | 30+ | few | Residual pollution — some 2020/2021 Al Qs still not retagged. Needs cleanup. |

## Decisions needed

### 1. `ספט 24` retag — should 269 entries move to `מאי 24`/`יוני 25`?

**Arguments for retagging**:
- Users filtering "Sept 24 exam practice" currently get mostly May24/2025 content
- The canonical data is authoritative (100/100 and 150/150 Sept 24 Qs successfully parsed)

**Arguments against**:
- Tag may have been historically used to mean "imported during Sept 24 audit
  session" rather than "appears on Sept 24 exam"
- Prior session memory notes: "keep ספט 24 unchanged since questions ARE on the
  Sept 24 exam" — but my audit disproves that premise (they are NOT on Sept 24)
- Bulk retag = 269 user-facing changes

**Recommendation**: ask user before retagging. If approved, audit_tag.py report
provides the idx → correct_exam mapping for a batch fix script.

### 2. `2021` tag — rename or keep?

92/100 entries are AI-generated practice Qs modeled on 2021 Al themes (not
identical to exam PDF). 8 are real exam Qs.

Options:
- Keep as-is (tag means "2021-themed practice")
- Rename to `2021-practice` and move 8 verified to `יוני 21`
- Split into two tags

### 3. `2023-ב` residual pollution

Prior retag session moved 89 entries to 2020/יוני 21. Audit shows ~30 more still
mis-tagged. Re-run with lower threshold + apply.

## Tool usage

```bash
cd scripts/exam_audit
python3 audit_tag.py "ספט 24"                    # audit single tag
python3 audit_tag.py "ספט 24" sept24_al sept24_basis  # explicit canonicals
```

Output: `reports/tag_audit_<tag>.json` with full idx mappings.
