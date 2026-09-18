---
name: stage-a-supervised-change
description: "Use when supervising a Stage A console change end to end: agree scope with the SZMC geriatrics project chat, relay to Claude Code, verify, route it through the outside review lanes (Codex, Gemini via agy, Antigravity, ChatGPT), merge, live check, report back."
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

## The pipeline for one change

This is the order to run. The sections below are grouped by topic, not by sequence, so each step names the one that details it — §2 and §3 in particular are run in the order here, not the order they appear.

1. **Agree the scope** (§0). Content, sections, schedule, verification rules or project instructions → the project chat concurs first. Pure UI or CI mechanics Eias already asked for → go, but still report.
2. **Build it** (§1). One bounded task: fix, guard, red test, mutation entry. Nothing speculative.
3. **CC's own gate** (§1). Suite at three pinned dates, audit/facts/sweep/dashtest, `mutants --static`, the touched mutations under `MUTANT_ONLY`, `harness-selftest`.
4. **Open the PR** (§1). Arm auto-merge, unless it touches persistence or clinical content — those wait for an outside lane.
5. **Cheap review, automatically** (§3). Codex reviews on open at no cost. Read it.
6. **Paid review, deliberately** (§3). `agy`/Gemini on the diff unless the change is trivial, which rule 1 defines the same way: **trivial means it cannot affect the product or the workflow.** A code comment or a typo in prose is trivial. A change to THIS file is not — it alters routing and merge behaviour, which is why the doctrine PR that introduced this rule got a full review and needed one. A deep ChatGPT or Antigravity pass when the cheap lanes disagree, or when a whole subsystem needs auditing rather than a diff.
7. **Verify it yourself** (§2). Playwright against the PR head: real behaviour, not proxies.
8. **Verify every finding in source, then route** (§3). Mechanical, on a PR still open → back onto that PR. Mechanical, after merge → a new PR. Content or scope → the project chat.
9. **If step 8 pushed to the PR, go back to step 3.** The head has changed, so the local gate, the `agy` review and the Playwright pass all ran against code that is no longer there, and Codex only reviews automatically when a PR OPENS — `@codex review` has to be asked for by hand on every later push. Merging here would land a persistence fix that no lane examined, which is the race the hold exists to prevent.
10. **Merge, re-fetch, re-run, live check** (§2). GitHub can merge an older head than the one you tested.
11. **Close out** (§5). Project doc, memory, reviewer scorecard, triggers.

## 0. Lanes and models
| Lane | Model | Owns |
|---|---|---|
| **SZMC geriatrics project chat** (claude.ai, decisions) | Sonnet | Clinical/exam content, what the console should do, project instructions and verification rules. Decides outside-review findings that touch content or scope. |
| **Cowork** (coordinator) | — | Relays, Gemini runs, verification, merges, live checks, project update doc, memory, scheduled checks. |
| **Claude Code** (CC, build) | Sonnet | Code, guards, red tests, mutations, PRs. |
| **Outside review** (five lanes) | see §3 | Defects only. Never decides. |

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
- **Merging:** CC opens a PR and arms auto-merge (`gh pr merge N --squash --auto`). It never merges red and never uses `--admin`. No per-PR approval from Eias. **Exception:** a change to persistence or clinical content does not get auto-merge — it waits for an outside lane, because auto-merge has raced a real Codex P1 on three consecutive PRs.
- **Stop pushing** once a head passes Cowork's retests; every push restarts CI.
- **Clone hygiene.** Anywhere a save compares "what I have" against "what moved on", the snapshot must be a real copy. A shallow copy is not enough: the live edit paths mutate **in place** (`HL[sec.id].push(h)`, `SN[id] = ta.value`, `pqDone[pqKey(p)] = …`), so a one-level copy still shares the arrays and objects underneath, the in-flight edit mutates the snapshot too, and the moved-on check compares an object with itself. Use `structuredClone` or a JSON round trip. The red test must **fail under a shallow copy AND under no copy**, and pass only with an independent deep snapshot — a test that survives the shallow-copy mutation is not testing depth and would let the same data-loss regression back in. It must also run against existing stored data, not an empty store. (An earlier wording here had this backwards, asking for a test that *passes* under a shallow copy; the guard in `test.mjs` has always been the stronger one — swapping the deep clone for `Object.assign({}, getMine())` turns two checks red.)

## 2. Verify it yourself
- **Get the code:** fetch the PR head or main and extract `stage-a/index.html`.
- **Playwright:** 390x844, `hasTouch`, `isMobile`. Test real behaviour, not proxies:
  - computed style, `getBoundingClientRect`
  - accessibility snapshot, `nav.inert`
  - scroll, drag / long-press, viewport resize
  - light and dark, page errors
- **After merge:** re-fetch main and re-run. GitHub can merge an OLDER head than the fixed one (#439 did; #440 was needed).
- **Live check:** curl the live URL with `?v=RANDOM` for a marker string from the change, then rerun Playwright against the live URL.

## 3. Outside review

Five outside lanes, plus Claude Code itself — the two Codex modes count separately, because they differ in what they can see and in how they are invoked, and each is scored on its own row. They are not interchangeable and they do not cost the same. Spend them in the order of the seven rules below, not all at once on every PR.

### The six lanes

| Lane | How it runs | What it can see | Known error profile |
|---|---|---|---|
| **Codex on GitHub** (`chatgpt-codex-connector[bot]`) | Automatic on PR open; `@codex review` re-runs it | The PR diff, in repo context | **Accurate, late.** Five findings over #459 and #462, five real, no false positives; its P1s have all been genuine data-loss bugs. The failure mode is timing, not correctness: it posts minutes after open, which on this repo is minutes *after* auto-merge fires. That is why persistence PRs do not get auto-merge. |
| **Codex CLI** | Run locally, read-only, blind against a named commit | The working tree at that commit | **Strong on source, noisy about its own tooling.** Blind against `522d4cf` it found the three in-place mutation sites and the shallow-copy gap, all real. It also reported an escape-sequence mismatch that was an artifact of its own throwaway parser, not a defect. Check whether a finding is about the code or about how it read the code. |
| **Gemini via `agy`** (Antigravity CLI, headless) | Piped diff on stdin, about a minute, see below | Only the pasted diff — no tools, no execution | **Static findings usually right; runtime claims about half wrong; example data sometimes invented; "clean" calls reliable.** It cannot run anything, so every runtime claim it makes is inference. |
| **Antigravity** (the IDE agent, Eias driving) | Interactive, on Eias's machine | The repo, and it can execute | Not yet recorded against this console. Because it can run the code, its runtime findings outrank every non-executing lane's — see rule 4. |
| **ChatGPT GPT-6 Astra** | Eias pastes a scope; deep audit, returns a written report | Whatever is pasted, plus what it asks for | **High recall, low precision at scale.** Rounds 3–5 produced real defects nothing else had found (the `wireErrs` gap in secondary windows, `classifyMutant` checking CAUGHT before DONE, `baselineOk` discarding exit status, `sectionForChapter` string coercion). Its weak-check audit flagged ~234 of 618 checks; six survived hand-verification. It over-flags **by class**, so take the classes as hypotheses and the instances as work. Its line numbers drift against a file that has moved since it read it. |
| **Claude Code** | This lane | Everything, and it executes | **Ships regressions its own guards do not cover.** #459 introduced three defects that Codex caught on review; #462 introduced two more. Its guards are strong against what it thought of and blind to what it did not. This is the whole reason the outside lanes exist — CC reviewing its own work is not independence. |

### The seven rules

1. **Cheap first.** Codex on GitHub costs nothing and fires by itself, so it runs on every PR without deciding anything. `agy` costs about a minute, so it runs on every PR **except a trivial one — meaning one that cannot affect the product or the workflow**: a code comment, a typo in prose. A change to this file is not trivial by that test, and neither is anything under `stage-a/`. A deep ChatGPT audit or an Antigravity session is the expensive instrument: spend it on a subsystem, a disagreement, or a suspicion — never as a reflex. Step 6 of the pipeline states the same eligibility; if these two ever disagree, this one is wrong, because the pipeline is what someone actually follows.
2. **Convergence is the confidence signal.** Two lanes reaching the same finding independently is the strongest evidence available here — stronger than any single lane's stated confidence. When two name the same line, treat it as real and go straight to verifying it.
3. **Divergence is where to spend attention.** One lane flags what another called clean: that gap is the finding. Do not average the lanes and do not let a majority vote settle it — go and look.
4. **Execution beats inference.** A lane that ran the code outranks a lane that read it. A runtime claim from a non-executing lane (`agy`, ChatGPT on a pasted diff) is a hypothesis to test, never a finding to route.
5. **Bound the output at Max.** A lane at its maximum reasoning setting, uncapped, returns a wall of prose in which the real findings are indistinguishable from the padding. Always cap the shape: severity, exact snippet, why, repro for any runtime claim; top N; a word limit; and an explicit "say clean per area" so silence is never ambiguous.
6. **Verify in source before routing.** Nothing reaches CC, a PR or the project chat until it has been reproduced against the source. A false finding routed as real costs a whole build cycle, and the lanes above produce them at a known rate.
7. **The repo is the shared memory.** Chat compacts; the repo does not. An acceptance checklist, a lane's error profile, a decision — it goes in a file, and it gets read from disk rather than recalled. `stage-a/build/ACCEPTANCE-round5.md` exists because exactly this was relayed through chat once and lost.

### Running `agy` (Antigravity CLI, headless)
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
4. **Then rules 4 and 6:** this lane cannot execute, so verify every finding against the source and every runtime claim with Playwright before it goes anywhere.
5. **If `agy` stops working:**
   - Auth expired → open it interactively in a visible window for Eias to sign in again.
   - Unavailable → fall back to Eias pasting the prompt into his own Gemini and screenshotting the answer.

### Routing a verified finding
Where it goes depends on whether the code it is about has merged yet. A finding on a PR that is still open cannot be fixed by a new PR branched off `main` — the defect is not on `main`; sending it to a new PR means either merging the known-bad change first or building an undocumented stack.
- Mechanical defect, **PR still open, fix fits the bounded task** → back onto that PR. This is the usual case for a held persistence change, where the whole point of holding it is to fix the finding before it lands. Then go back to step 3 of the pipeline: a push invalidates every gate that has already run.
- Mechanical defect, **PR still open, fix does NOT fit** — a redesign, a second subsystem, a schema change → hold the PR and get a scope decision before choosing between widening it and ordering the work separately. "Mechanical" says the defect is real, not that the fix is small, and the one-bounded-task rule still applies.
- Mechanical defect, **already merged** → a new PR.
- Anything touching PRODUCT content or scope → the project chat first. (The row above is about the size of an implementation fix; this one is about what the console should do.)
- Tell Eias and the chat what was adopted or rejected, one line each with the reason, and which lane raised it — that line is what keeps the scorecard honest.

## 4. CI facts
- **Structure:** stage-a CI is a guards job plus a mutants matrix of 10 shards (`MUTANT_SHARD=i/N`).
- **INCOMPLETE shard:** the suite crashed before DONE. Reproduce on main with `MUTANT_ONLY` before blaming the PR.
- **Required for merge:** `validate`, `js-integrity`, `scan`, `claude-review`. **`guards` and `mutants` are not required** — a mutation regression, or a review posted while auto-merge is counting down, lands anyway. Read the shard results before treating a merge as clean.

## 5. Close out
- **Project doc:** write `claude/SZMC-geriatrics-project-update-YYYY-MM-DD.md` to the project, with:
  - HEAD
  - checks / mutations / facts counts, read by command
  - a table of landed PRs
  - findings adopted / rejected, **named by lane**
  - next review start commit
  - open items
- **Reviewer scorecard:** update the Stage A Reviewer Scorecard artifact. Three kinds of row, because findings alone can only measure precision:
  - **one per finding** — lane, PR, severity as raised, verified outcome (real / false / already-known / not-reproducible)
  - **one per review that came back clean** — otherwise a lane that says "clean" is invisible, and §3's claim that a lane's clean calls are reliable rests on nothing
  - **one per miss**, written back when a later lane, or production, finds something an earlier review could have seen and did not report. "Could have seen" is the whole test: the defect had to be present in the material and scope that lane was actually given — the pasted diff for `agy`, the diff in repo context for Codex on GitHub, whatever was pasted for ChatGPT. A lane is not charged for code it was never shown, or the visibility differences in the table above would quietly become a ranking of who got the most context. Otherwise no profile can ever get worse, only better

  This is the only thing that keeps the error profiles in §3 honest instead of anecdotal; a profile nobody is scoring drifts into folklore, and one scored on findings alone drifts favourably. Correct §3 when a lane's numbers move.
- **Memory:** append a dated line to the study-console memory file.
- **Report to the project chat** in one message: commits, revert handles, Gemini verdicts, next review start. Screenshot after sending.
- **Triggers:** delete finished scheduled checks (`list_triggers`).
- **"Nothing pending"** only when no PR is open, no trigger remains, and the chat has acknowledged.

## Scheduling
- Use `send_later` / `update_trigger`, matched to the real work: CI about 5 min, CC edits 15–30 min, an `agy` review about 1 min.
- Stay quiet unless something lands; check sooner when Eias asks.

## Keeping this skill current
When a run shows a missing check or a step that no longer works:
1. Edit this file in the repo (via CC PR, auto-merge).
2. Agree the change with the project chat.
3. Report the commit there.

The claude.ai pointer needs no update unless the path changes.
