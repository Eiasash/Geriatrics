---
name: stage-a-supervised-change
description: "Use only when Eias explicitly asks for a change to the Stage A console (eiasash.github.io/Geriatrics/stage-a/). Claude Code PR, CI, auto-merge, live check. The outside-review lane process is retired."
---

# Stage A console change: lightweight (since 22 Sep 2026)

The console is now secondary; his main study surface is the Hazzard reader. Touch the console only when he asks.

## Steps
1. Claude Code (Sonnet High) makes the change on a branch in `Eiasash/Geriatrics`, under `stage-a/` only.
2. New CSS font sizes use `calc(Npx*var(--fs,1))`, or they ignore his text-size control.
3. Open a PR. CI (`stage-a-ci.yml`) runs the existing guards. Auto-merge on green; he doesn't want to be asked.
4. Check the live page at https://eiasash.github.io/Geriatrics/stage-a/ at 390×844.
5. Report in 3 lines or fewer: PR, commit, CI result, live check.

## Retired, don't do unless he asks
- Gemini/ChatGPT/Codex outside-review rounds, work-order files, and lane relays with delivery proofs.
- The "chat lane must attack it first" rule, O7–O12, and read receipts.
- New guards or mutations beyond fixing what CI already checks. Sideways-scrolling tables on a phone are by design.

If the repo's own `.claude/skills/stage-a-supervised-change/SKILL.md` still describes the old lane process, this file wins; replacing the repo copy is a small Claude Code PR.
