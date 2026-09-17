---
name: stage-a-supervised-change
description: "Use when supervising a Stage A console change end to end: agree scope with the SZMC geriatrics project chat, relay to Claude Code, verify, automatic Gemini review via Antigravity CLI, auto-merge, live check, report back."
---

# Supervised change loop — Stage A console

**Where this skill lives:** the source is in git at `C:\Users\eiasa\repos\Geriatrics\.claude\skills\stage-a-supervised-change\SKILL.md`. The desktop install `C:\Users\eiasa\.claude\skills\stage-a-supervised-change` is a junction onto that folder, so `git pull` updates it. The claude.ai account copy is a short pointer telling a session to pull the repo and read this file, so it never goes stale.

To change the checklist, edit this file only. Agree the change with the SZMC geriatrics project chat first, and report it there with the commit.

**This file pins no versions, hashes or counts.** Read them by command in the run.

**The console:**
- Repo: Eiasash/Geriatrics, folder `stage-a/`.
- Live: https://eiasash.github.io/Geriatrics/stage-a/
- Eias reads it on Android Chrome at XL text.

**Working style:** captain mode. Act, then report tersely in Israel time as bullets, with blunt status honesty.

## 0. Lanes and models
| Lane | Model | Owns |
|---|---|---|
| **SZMC geriatrics project chat** (claude.ai, decisions) | Sonnet | Clinical/exam content, what the console should do, project instructions and verification rules. Decides outside-review findings that touch content or scope. |
| **Cowork** (coordinator) | — | Relays, Gemini runs, verification, merges, live checks, project update doc, memory, scheduled checks. |
| **Claude Code** (CC, build) | Sonnet | Code, guards, red tests, mutations, PRs. |
| **Gemini** (outside reviewer, via Antigravity CLI on Eias's Ultra account) | Gemini 3.1 Pro High | Defects only. Never decides. |

When Cowork opens the project chat or starts CC, it selects Sonnet.

**Lane rules:**
- **Coordinate, don't bypass.** Before a change touching clinical text, sections, schedule, verification rules or project instructions, open a chat in the SZMC geriatrics project with the proposal and get its concurrence. Pure UI or CI mechanics Eias already asked for need no concurrence, but are still reported.
- **Report every change to shared infrastructure** when it lands: repo main, project docs, project memory, CI workflow, repo settings, this skill. Send one message to the project chat with what changed, where, and its revert handle:
  - repo → merge commit (`git revert`)
  - project doc → the previous doc path
  - memory → the exact old text quoted
- **Disagreement:** if the chat contradicts a change, hold or revert it until both lanes agree. If they still disagree, send Eias one bold line with both positions.
- **Eias-only decisions:** escalate in one short message with the proposed answer, and tell the other lane so he isn't asked twice.
- **Handoffs** are commits, PR numbers and paths, never recollection.
- **Proof of sending**, for every message to the chat or CC:
  1. The input box is empty.
  2. The message appears in the thread.
  3. Screenshot the recipient working after sending, and send it to Eias with SendUserFile.

  A screenshot of typed text is not proof. If a box ignores scripted text, click in, type a real keystroke and press Enter, then re-verify.

## 1. Relay the task to Claude Code
- **One bounded task at a time:** the fix, a guard, a red test (revert fix → guard fails → restore) and a `mutants.mjs` entry.
- **Local runs:** CC runs `test/audit/facts/sweep/dashtest`, `mutants --static`, and only the touched mutations (`MUTANT_ONLY`). CI runs the full sharded set.
- **Merging:** CC opens a PR and arms auto-merge (`gh pr merge N --squash --auto`). It never merges red and never uses `--admin`. No per-PR approval from Eias.
- **Stop pushing** once a head passes Cowork's retests; every push restarts CI.

## 2. Verify it yourself
- **Get the code:** fetch the PR head or main and extract `stage-a/index.html`.
- **Playwright:** 390x844, `hasTouch`, `isMobile`. Test real behaviour, not proxies:
  - computed style, `getBoundingClientRect`
  - accessibility snapshot, `nav.inert`
  - scroll, drag / long-press, viewport resize
  - light and dark, page errors
- **After merge:** re-fetch main and re-run. GitHub can merge an OLDER head than the fixed one (#439 did; #440 was needed).
- **Live check:** curl the live URL with `?v=RANDOM` for a marker string from the change, then rerun Playwright against the live URL.

## 3. Automatic Gemini review (Antigravity CLI)
Gemini web and the old Gemini CLI both fail when driven by Claude. Use `agy` on Eias's PC through Desktop Commander (PowerShell). It is signed in with his Google AI Ultra account.

1. **Build the diff and prompt file** in `C:\Users\eiasa\agy-reviews`:
   - `git diff <base> <head> -- stage-a > prNNN.diff`
   - Write `prNNN-prompt.txt` as UTF-8 without BOM, using `[IO.File]::WriteAllText` (never a heredoc).
   - Contents: the reviewer rules, then `DIFF:`, then the diff. Rules: do not use any tools; review only the pasted diff; no patches; no rewording clinical text; sideways tables are by design; `calc(Npx*var(--fs,1))` font sizes; check correctness, accessibility, blind guards, and whether each mutation turns its guard red; severity + exact snippet + why + repro for runtime claims; say clean per area; top 5; under 400 words.
2. **Run it with the prompt piped on stdin.** Do NOT pass it as an argument: PowerShell splits it, and `--print` swallows the next flag.
   ```powershell
   cd C:\Users\eiasa\agy-reviews
   cmd /c "type prNNN-prompt.txt | `"%LOCALAPPDATA%\agy\bin\agy.exe`" --model gemini-3.1-pro-high --print-timeout 10m > prNNN-review.txt 2>&1"
   ```
3. **Read `prNNN-review.txt`** and check it:
   - Exit 0 with a real review → proceed.
   - "no output produced", a permission denial, an error, a refusal, an empty file, or a generic greeting → it did not review. Fix the invocation and re-run; never treat it as "clean".
   - Headless mode auto-denies tools. Keep it that way; never use `--dangerously-skip-permissions`.
4. **Verify every finding** against the source, using Playwright for runtime claims. Known pattern: static findings are usually right, runtime claims about half wrong, example data sometimes invented, "clean" calls reliable.
5. **Route findings:**
   - Mechanical verified defects → CC as a new PR.
   - Anything touching content or scope → the project chat first.
   - Tell Eias and the chat what was adopted or rejected, one line each with the reason.
6. **If `agy` stops working:**
   - Auth expired → open it interactively in a visible window for Eias to sign in again.
   - Unavailable → fall back to Eias pasting the prompt into his own Gemini and screenshotting the answer.

## 4. CI facts
- **Structure:** stage-a CI is a guards job plus a mutants matrix of 10 shards (`MUTANT_SHARD=i/N`).
- **INCOMPLETE shard:** the suite crashed before DONE. Reproduce on main with `MUTANT_ONLY` before blaming the PR.
- **Codex** reviews PRs on GitHub. Its P1s are must-fix.

## 5. Close out
- **Project doc:** write `claude/SZMC-geriatrics-project-update-YYYY-MM-DD.md` to the project, with:
  - HEAD
  - checks / mutations / facts counts, read by command
  - a table of landed PRs
  - Gemini adopted / rejected
  - next review start commit
  - open items
- **Memory:** append a dated line to the study-console memory file.
- **Report to the project chat** in one message: commits, revert handles, Gemini verdicts, next review start. Screenshot after sending.
- **Triggers:** delete finished scheduled checks (`list_triggers`).
- *"Nothing pending" only when no PR is open, no trigger remains, and the chat has acknowledged.

## Scheduling
- Use `send_later` / `update_trigger`, matched to the real work: CI about 5 min, CC edits 15–30 min, an `agy` review about 1 min.
- Stay quiet unless something lands; check sooner when Eias asks.

## Keeping this skill current
When a run shows a missing check or a step that no longer works:
1. Edit this file in the repo (via CC PR, auto-merge).
2. Agree the change with the project chat.
3. Report the commit there.

The claude.ai pointer needs no update unless the path changes.
