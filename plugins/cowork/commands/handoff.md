---
description: Refresh the handoff file for the current cowork branch
---

Refresh `.cowork/<slug>.md` so the next session can resume cold.

1. Branch must start with `cowork/`; else stop.
2. Gather:
   - `git status --porcelain`, `git diff --stat main...HEAD`, `git log --oneline main..HEAD`.
   - Question delta: `jq 'length' data/questions.json` vs the value stored in the handoff's **Baseline** section.
   - Flashcard delta: same for `data/flashcards.json`.
   - `npm test --silent` per-suite PASS/FAIL.
3. Update the handoff:
   - **Status**: `in-progress` / `blocked: <reason>` / `ready-to-land`.
   - **Done**: concrete bullets — `data/questions.json +12 (topic: frailty)`, `shlav-a-mega.html: quiz button RTL fix`. Vague bullets (“improved”, “cleaned”) are forbidden.
   - **Next**: one concrete action with file path.
   - **Tests**: one line per suite.
   - **Notes for the next Claude**: non-obvious only — skipped test + reason, a distractor you deliberately left weak waiting for review, a Hebrew term waiting on glossary clarification.
4. `git add .cowork/ && git commit -m "cowork: handoff"`. Do not push.
5. Print the file.
