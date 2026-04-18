---
description: Summary of all cowork/* branches — ahead/behind, handoff age, data deltas
---

1. `git fetch origin --prune`.
2. Enumerate `cowork/*` local + remote (dedupe).
3. For each, in parallel:
   - `git rev-list --left-right --count origin/main...<branch>` → ahead/behind.
   - Read `.cowork/<slug>.md`: extract **Status**, **Last session** date.
   - `git show <branch>:data/questions.json 2>/dev/null | jq 'length'` vs main → question delta.
   - If the branch touches `data/questions.json`, grep the diff for any chapter in the Hazzard-excluded list (see question-schema skill). Any match → flag hard.
4. Print markdown table: `branch | status | ahead/behind | qΔ | fcΔ | age | flags`.
5. Recommend: smallest clean diff that is `ready-to-land`; flag any branch >14 days since last handoff.
