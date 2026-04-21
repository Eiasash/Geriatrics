# Image Bucket Cleanup Report — 2026-04-21

Generated during full Geri+Pnimit infrastructure audit. Data sourced from Supabase
project `krmlzwwelqvlfslwltol`, bucket `question-images`.

## Summary

| | Pnimit | Geri |
|---|---|---|
| Bucket count | 313 | 145 |
| Referenced by questions.json | 154 | 111 |
| Orphans (uploaded, no Q references) | 159 | 40 |
| Missing (referenced, not in bucket → 404) | **0** | **6 → fixed this commit** |

- Stray `test_upload_check.jpg` (100 KB, created 2026-04-16): **DELETED** via one-shot edge function `image-audit-oneshot`.
- Geri broken-image Qs (6) fixed:
  - Q idx 3193 (Jun22_al Q38 MRI lumbar): rewired to existing `geri_Jun22_al_q38_tmuna7.jpg`.
  - Q idx 3194, 3196, 3200, 3204, 3205: `img` stripped + `imgDep: true` + `imgMissing: true` flags added so the UI doesn't try to load a 404. Images need to be sourced + re-uploaded next session.

## Missing images needing upload (Geri, 5 Qs)

Each should be sourced from the canonical IMA PDF and re-uploaded under the indicated filename.

| Q idx | Tag/ti | Topic | Expected filename |
|---|---|---|---|
| 3194 | Exam/6 | NPH CT head (קוגניטיבית + הליכה + שתן) | `geri_y2024_basis_neurology_q69.jpeg` |
| 3196 | Exam/14 | Bullous pemphigoid-type skin lesion | `geri_sep24_shared_skin_q69.jpeg` |
| 3200 | Exam/38 | Post-op hip fracture XR | `geri_y2024_basis_orthopedics_q35.jpeg` |
| 3204 | Exam/16 | Acute foot pain (gout vs cellulitis) | `geri_jun25_al_rheumatology_q136.jpeg` |
| 3205 | Exam/14 | PVD skin finding | `geri_sep24_shared_vascular_q31.jpeg` |

## Orphans — Pnimit (159)

Files in bucket not referenced by any Q. Likely either staged for future wiring, or stale.
Keep for next session; do not delete without confirming no pending wiring work.

See `/tmp/pnim_orphans.txt` (157 KB in sandbox — committed to Pnimit repo `docs/pnim_orphans_2026-04-21.txt`).

## Orphans — Geri (40)

Similar — likely staging or legacy. See `docs/geri_orphans.txt`.

## Active (but unused) edge functions — require dashboard cleanup

MCP has no delete_edge_function verb. Delete from Supabase dashboard → Functions tab:

- `upload-jun23-images` — v5, last used 2026-03-21
- `fix-jun23-rename` — v2, last used 2026-03-21
- `image-audit-oneshot` — v1, deployed 2026-04-21 for this audit (can be kept if reusable)

## RLS sanity check (as of 2026-04-21 17:24)

All 9 user-facing tables have correct policies (INSERT/SELECT/UPDATE only, no DELETE):
- `samega_backups`, `pnimit_backups`
- `shlav_leaderboard`, `pnimit_leaderboard`
- `shlav_feedback`, `pnimit_feedback`
- `answer_reports`
- `proxy_rate_limits` has `ALL` (correct for Netlify Function).
