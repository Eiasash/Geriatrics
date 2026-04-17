---
name: ship-it
description: Run the full CI-mirror locally, bump SW cache version, commit, and push. Use when you're ready to deploy a change to Geriatrics. Replaces the "edit → test → bump SW → commit → wait 60s for CI" loop.
disable-model-invocation: true
---

# /ship-it

Mirrors what `.github/workflows/ci.yml` and `integrity-guard.yml` check, but locally. Fails fast, refuses to push on failure.

## What it runs

1. `npm test` — full Vitest suite (all tests must pass, 0 failures)
2. Node syntax check on `shlav-a-mega.html`, `sw.js`, `scripts/**/*.cjs`, `scripts/**/*.js`
3. JSON schema validation on all `data/*.json`
4. Duplicate question ID detection
5. GRS-reference detection in `data/notes.json`
6. innerHTML audit on `shlav-a-mega.html`
7. SW cache version bump (auto-increments patch: `v9.48` → `v9.49`)
8. `git add` the changed files
9. Prompts for commit message
10. `git push origin main`

## Usage

```
/ship-it
/ship-it "feat: add 12 new fall-risk MCQs"     # skip commit-message prompt
/ship-it --dry-run                              # run checks, don't commit or push
/ship-it --no-bump                              # skip auto SW version bump
```

## How I (Claude) should execute this

When the user invokes `/ship-it`, run:

```bash
bash .claude/skills/ship-it/ship.sh "$ARGS"
```

The script is non-interactive when given a commit message, interactive otherwise. Surface its output verbatim to the user — don't summarize. If it exits non-zero, DO NOT retry or "fix it up" — the failures it surfaces are real CI gates. Report what failed and ask the user how to proceed.

## Design

- **Fail loud.** If any gate fails, stop. Don't try to be clever.
- **No auto-fixes.** Fixing a failing test or adding a missing citation isn't this skill's job — that's regular Claude editing.
- **SW bump is opt-out, not opt-in.** It's the single most-missed step; defaulting to auto-bump catches it.
- **Push is the last step.** So a test failure never leaves orphan commits unpushed vs. pushed.
