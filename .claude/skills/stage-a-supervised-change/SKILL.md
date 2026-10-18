---
name: "stage-a-supervised-change"
description: "Use only when Eias explicitly asks for a change to the Stage A console (eiasash.github.io/Geriatrics/stage-a/). Claude Code PR, CI, the coordinator merges once the required checks are green, live check. Gemini CLI reviews PRs and runs the test suites."
---

# Stage A console change: lightweight

The console is secondary; his main study surface is the Hazzard reader. Touch the console only when he asks.

## Steps
1. Claude Code (Sonnet High) makes the change on a branch in `Eiasash/Geriatrics`, under `stage-a/` only.
2. New CSS font sizes use `calc(Npx*var(--fs,1))`, or they ignore his text-size control.
3. Open a PR. CI (`stage-a-ci.yml`) runs the existing guards. The required checks on Geriatrics main are `validate`, `js-integrity` and `scan`; the mutation shards and `guards` are not required, and UNCERTIFIABLE mutations are reported separately and do not fail a shard.
4. Gemini CLI (`gr`) reviews the PR and runs the test suites; Bash suites run through Git Bash (`"C:\Program Files\Git\bin\bash.exe" ... < /dev/null`), never PowerShell's `bash`.
5. No CONCUR and no lane signature. Only an OBJECT from lane cowork-szmc blocks a merge. The coordinator (main Cowork, bus lane chatgpt) merges once the required checks are green on the exact head.
6. Check the live page at https://eiasash.github.io/Geriatrics/stage-a/ at 390x844.
7. Report in 3 lines or fewer: PR, commit, CI result, Gemini review, live check.

## Question data
Stage A / Geriatrics question data follows the same path as any other change. Official items keep the official IMA key; a missing or merged option is restored from the exam PDF page itself (rendered image), never from memory or the text layer. Eias uses only the Hazzard reader and the Stage A app: no work on the big question bank.

## Scope limit
No new guards or mutations beyond fixing what CI already checks. Sideways-scrolling tables on a phone are by design.
