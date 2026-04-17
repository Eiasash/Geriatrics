---
description: Run the full local CI mirror via the schema-guardian subagent. Non-destructive — reports pass/fail only.
allowed-tools: Task, Bash, Read
---

# /validate

Invokes the `schema-guardian` subagent to run every check the GitHub Actions workflows run, in parallel, locally.

Use this before `/ship-it` if you've made a lot of changes and want a dry run.

## Execution

Claude should:

1. Launch the `schema-guardian` subagent with the prompt: "Run all 13 checks against the current working tree. Report pass/fail with specifics. Flag anything that would fail CI."
2. Surface the full report to the user.
3. If all pass → suggest `/ship-it`.
4. If any fail → do NOT suggest `/ship-it`; point the user at the specific failures.

## Rules

- Never auto-fix anything. The failures are the user's signal.
- Never run `/ship-it` automatically even if everything passes — that's a human decision.
