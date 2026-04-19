---
description: Declare which paths the current cowork branch is actively editing, so parallel sessions can see it
argument-hint: <path> [<path> ...]   (relative paths or globs, e.g. data/questions.json src/ui/quiz-view.js)
---

Record intent to edit the given paths on the current cowork branch. Other sessions surface this via `/cowork:collisions`.

1. Current branch must start with `cowork/`; else STOP and tell the user.
2. `$ARGUMENTS` must be non-empty. Globs are kept verbatim — record, don't expand.
3. Open `.cowork/<slug>.md`. Locate the **Claimed** section (or append one immediately after **Baseline** if missing). Merge the new paths with any existing lines — no duplicates; refresh the timestamp for paths you re-claim.

   ```
   ### Claimed
   - <path>   (<YYYY-MM-DDTHH:MMZ>)
   - <path>   (<YYYY-MM-DDTHH:MMZ>)
   ```

4. `git add .cowork/<slug>.md && git commit -m "cowork: claim <paths>"`.
5. `git push -u origin cowork/<slug>` — pushing is REQUIRED so parallel sessions can `git fetch` the claim. If push fails, print the error and retry up to 3 times with 2s/4s/8s backoff; if still failing, warn loudly — a claim that isn't pushed protects nobody.
6. Print the updated **Claimed** block.

To release a claim, edit `.cowork/<slug>.md` directly or let `/cowork:land` clear it.
