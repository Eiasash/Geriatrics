# Migration Ledger — Shlav A Mega

> Last audited: 2026-04-15 (4,922 lines, 178 functions, 402 tests)

## Current Phase: Monolith-in-place, four render functions decomposed

The app is a single-file monolith (`shlav-a-mega.html`). No module split is
planned. Work so far: S.ts bug fixed, `shared/fsrs.js` extracted, and all four
large render functions decomposed into prefixed helpers.

## Decomposition Summary

| Function | Helpers | Orchestrator | Prefix |
|----------|---------|-------------|--------|
| `renderCalc` | 13 (_rcCrCl … _rcMorse) | 15 lines | `_rc*` |
| `renderQuiz` | 2 (_rqSuddenDeath, _rqMain) | 5 lines | `_rq*` |
| `renderTrack` | 4 (_rtTop, _rtMid, _rtProgress, _rtFooter) | 7 lines | `_rt*` |
| `renderLibrary` | 7 (_rlHeader … _rlFooter) | 10 lines | `_rl*` |
| **Total** | **26 helpers** | | |

## S.ts Bug — Fixed

All 3 occurrences of `S.ts||{}` replaced with `getTopicStats()`. Test guards
prevent regression.

## What Remains Large / Risky

| Function | Lines | Notes |
|----------|-------|-------|
| `_rqMain` | ~230 | Quiz main flow — could be split further into question/controls/explain |
| `_rtTop` | ~140 | Track top half — metrics through calendar |
| `_rlHazzard` | ~96 | Hazzard reader + chapter list + annotated PDFs |
| `_rtProgress` | ~90 | Progress stats + bookmarks + syllabus + weak spots |
| `_rlHarrison` | ~63 | Harrison reader + chapter list |
| `exportProgress` | ~138 | Pure data, no DOM — low risk |
| `getHazPdf` | ~178 | Pure lookup table — low risk |

## Safe Next Steps

1. Split `_rqMain` into question/controls/explain sections (~3 helpers)
2. Split `_rtTop` into metrics/heatmap/plan/confidence/rescue/calendar (~6 helpers)
3. Split `_rlHazzard` into reader/list sub-helpers

## Patterns to Avoid

- Don't split the HTML file into modules — single-file is intentional
- Don't introduce addEventListener delegation
- Don't remove >5 functions per commit (integrity-guard GATE 4)
- Don't cache getTopicStats() in S.ts — call fresh each time
- Don't touch shared/fsrs.js without updating both repos
