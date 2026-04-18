---
description: Question density per Hazzard allowed chapter; flag gaps and overweighting
---

1. Read `data/questions.json`.
2. For each allowed Hazzard chapter (from `question-schema` skill):
   - count questions tagged to that chapter.
3. Print a table sorted ascending: `chapter | count | % of total`.
4. Flag:
   - **Gaps**: allowed chapter with < 3 questions.
   - **Overweight**: any chapter > 15% of total.
   - **Leak**: any question tagged to a Hazzard-*excluded* chapter (must be 0; if not, hard fail and list the question ids).
5. End with a one-line recommendation: which gap to fill first in the current cowork branch.
