---
name: handoff-format
description: Canonical format for Geriatrics `.cowork/<slug>.md` handoff files. Load whenever writing or reading a handoff.
---

# cowork handoff format (Geriatrics)

Handoff files live at `.cowork/<slug>.md`, one per active branch, committed.

## Required sections

### Header
```
# <slug>

**Branch:** cowork/<slug>
**Last session:** YYYY-MM-DD (model)
**Status:** in-progress | blocked: <reason> | ready-to-land
```

### Goal
One paragraph. Never edit after the first session — this is the anchor.

### Baseline
Snapshot from `/cowork:start`:
- `data/questions.json` length at branch-off.
- `data/flashcards.json` length at branch-off.
- (optional) topic-coverage numbers at branch-off.

### Done
Concrete bullets with artifact + scope. Examples:
- `data/questions.json` +12 (topic: frailty, ids: q0612–q0623).
- `shlav-a-mega.html`: fixed RTL stray LTR mark in quiz-nav.
- NOT allowed: “improved quiz”, “cleaned up”.

### Next
One or two concrete actions with file paths. Imperative. Examples:
- `[ ] Add 4 questions for topic "delirium" to data/questions.json`.
- NOT allowed: `[ ] Continue`, `[ ] Review`.

### Tests
One line per suite, current state:
- `npm test -- quiz` : PASS
- `npm run lint` : FAIL (3, pre-existing)

### Notes for the next Claude
Non-obvious only:
- Skipped test + reason to re-enable.
- A distractor left deliberately weak pending distractor-autopsy agent review.
- Hebrew term waiting on glossary clarification.

## Not allowed
- Conversational summary — use commits.
- Restating the diff — use `git diff`.
- Follow-up ideas unrelated to this branch — open an issue instead.
