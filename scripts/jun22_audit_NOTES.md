# Jun 22 Al Exam — Audit Status

**Status:** Answer key + references extracted. c-field audit NOT YET APPLIED.

## Why not applied
My PDF parser (see `sept24_audit.py`) had a systematic off-by-one bug for this exam.
Jun 2022 Al PDF has a highly fragmented layout — PyMuPDF text extraction yields
15+ missing questions out of 100, causing downstream num-label shifts that made
naive answer-key lookup unreliable.

Concretely: my extraction labeled Q99 (Denosumab) as Q98. Applying answer[98]=ד
to that Shlav A entry would incorrectly change osteonecrosis of jaw (the correct
answer) to thrombocytosis. Five clinically-suspect fixes in the 13-fix plan
triggered me to revert all of them rather than ship any wrong clinical answers.

## What's saved for future sessions
- `jun22_answers.json` — authoritative answer key (100 Qs, 5 multi-accepted)
- `jun22_refs.json` — chapter references per Q (30 GRS refs NOT to propagate;
  P005-2026 syllabus removed GRS)
- Exam PDF available from Eias when needed

## Multi-accepted Qs in revised key (important)
- Q11: accepts א,ג
- Q36: accepts ב,ג
- Q42: ALL accepted
- Q66: accepts א,ב
- Q91: accepts ב,ד

## Next steps when resuming
1. Pick the ~83 SA "2022" entries with complete data
2. For each, read the actual PDF Q text and match to the RIGHT exam Q number
   by Q TEXT (not just options) — options can collide between recycled Qs
3. Apply c-fix only after confirming the Q TEXT matches

## Recommended fix approach
Since the exam PDFs are the source of truth and my parser fails on them,
the pragmatic fix is manual review of each of the ~13 flagged entries against
the exam PDF rendered in a viewer, then applying fixes one by one.
