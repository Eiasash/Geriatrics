---
description: Land the current cowork branch onto main with schema enforcement
---

1. `git rev-parse --abbrev-ref HEAD` — must be `cowork/*`. Abort otherwise.
2. `git fetch origin main && git rebase origin/main`. Conflicts → STOP, print them.
3. **Schema guard** (delegate to the `schema-guard` agent): confirm any change to `data/questions.json`, `data/notes.json`, `data/drugs.json`, `data/flashcards.json` obeys the `question-schema` skill — required fields, allowed enum values, no Hazzard-excluded chapters, no GRS content, auto-tagging topic map consistent.
4. Hebrew guard: for any Hebrew string diff in `shlav-a-mega.html` or data files, sample 5 strings and validate against `hebrew-medical-glossary`. Report deviations; do not auto-fix.
5. `npm test --silent`, then any lint/build script in `package.json`. All must pass.
6. Read `.cowork/<slug>.md`. Draft squash message: title `<type>(scope): <goal>`; body = **Done**; footer `Cowork-branch: cowork/<slug>`.
7. Print the draft message + the git commands. Do NOT merge/push.
