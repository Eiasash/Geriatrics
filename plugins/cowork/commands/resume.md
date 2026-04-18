---
description: Resume a cowork branch cold — read handoff, verify state, announce next step
---

1. `git rev-parse --abbrev-ref HEAD`. If not `cowork/*`, ask which to resume and checkout.
2. Read `.cowork/<slug>.md`. Print **Goal**, **Next**, **Notes for the next Claude** verbatim.
3. Verify no drift:
   - `git log --oneline -5`, `git status --porcelain` (flag uncommitted surprises).
   - `npm test --silent` — if a suite that was PASS is now FAIL, STOP, flag regression before anything else.
   - Re-run `jq 'length' data/questions.json` — if it changed but handoff wasn't updated, flag drift.
4. State in one sentence what you are about to do, mapped to the **Next** bullet.
