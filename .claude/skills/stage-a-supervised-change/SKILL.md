---
name: stage-a-supervised-change
description: "Use when supervising a Stage A console change end to end: agree scope with the SZMC geriatrics project chat, relay to Claude Code, verify against source, outside review by a non-Claude oracle, live check, report back. Guard verdicts are governed by the guard ruleset (see Doctrine)."
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


## Doctrine — the guard ruleset (added 18 Sep 2026)

Guard verdicts in this repo are governed by `agy-reviews/GUARD-RULESET-v3-2026-09-18.md`, also in
project knowledge as `claude/SZMC-geriatrics-guard-ruleset-v3-2026-09-18.md`. Read it before
interpreting any CI result. The parts that change how this loop is run:

**Pin the commit.** Every review package, prompt or report names the commit it was built from. A
package without one is not reviewable, and an outside reviewer is right to refuse it.

**A green is not evidence a guard works.** `mutants-classify.mjs` certifies on a substring match of
a needle against any FAIL line, so a guard can be certified by a neighbour's red. Until that is
fixed, do not treat CAUGHT as proof the named guard bit.

**A mutation is a valid witness only if all three hold:** it turns that guard's own label red by
exact identity; it is shown to produce the defect the guard's label describes; and the spelling it
mutates is the only implementation of that behaviour. A mutant that duplicates a comment, or that
deletes one rule while another still enforces it, certifies nothing.

**Reds can be uninterpretable, and that is a reportable state.** A verdict you cannot explain is
reported as uninterpretable. Never resolve it by re-running: repetition is not validation.

**"No verdict" is not "passed".** Path filtering can skip the stage-a workflow entirely, so a green
checks list on main can mean the guard suite never ran. Check which workflow actually produced the
last verdict on the branch you are about to trust.

**Ranges are chosen per requirement.** An externally anchored requirement — an accessibility floor,
a sourced clinical figure — gets an absolute check. Relational ranges only for values that are
inherently about two things matching, and only once one side is externally anchored.

## The lanes — how to reach each one, and how to know it arrived

Every lane below has a different delivery mechanism and a different way of lying about delivery.
This table exists because "I sent it" was treated as "it landed" three times in one day. The
DELIVERY CHECK column is the only thing that counts as evidence; the send itself never is.

**NAMING — fixed by Eias on 19 Sep and not to be drifted from.** **CHAT LANE** means the claude.ai
PROJECT CHAT and nothing else: the partner and the first stop, not a queue to be drained. The Claude
Code cloud session is the **CLOUD LANE**, or **the builder**. Never write "build lane"; never call
the cloud session the chat lane. Work goes to the chat lane FIRST and its answer is read in full
before anything moves onward — including a question the chat lane itself raised, which is the one
that kept getting answered to the builder instead of back to it.

**A correct artifact tells you nothing about its provenance.** Three skill commits reached main
without clearing the chat lane, each one a good fix with a clean rationale, which is exactly why it
was easy not to notice. Judge the route, not the quality.

| Lane | Model / route | How to send | DELIVERY CHECK (target-side) | Known failure mode |
|---|---|---|---|---|
| **Chat lane** (project chat) | Sonnet, claude.ai project chat | browser: focus the composer, `document.execCommand('insertText')`, click send | a new assistant turn appears after your message; it quotes or acts on your content | long replies stream for 2–4 min; reading too early returns only thinking summaries |
| **Cloud lane** (Claude Code cloud) | Sonnet 5 / Medium, claude.ai/code | insertText, then **Ctrl+Enter** | **absence of "Queued. Claude will read this after the current turn"** AND no "Send now" control | a message typed while a task runs is QUEUED, not sent. Composer emptying and text-in-page are both TRUE while undelivered |
| **"Send now" / "Stop"** in that lane | — | ordinary clicks do nothing | after the action, re-check for the queued banner | needs a full dispatched pointer sequence: pointerdown, mousedown, pointerup, mouseup, click, with real client coords |
| **CC desktop** | `claude.exe -p --model opus --effort xhigh` | write prompt to a file, pipe it in via a `.cmd` wrapper, capture stdout to a file | the answer file is non-empty AND the log file records EXIT | PowerShell quoting mangles inline prompts — always use a `.cmd` wrapper and files, never inline quotes |
| **ChatGPT** | GPT-6 Astra, Extra High, project chat | attach the package as a FILE, short instruction in the composer | **read the composer back — it must contain the payload**, then a response turn with content. It once returned an EMPTY answer after 6m28s | can refuse to verify counts against an unnamed commit — correct behaviour, pin the sha. **Delivery is fragile:** `file_upload` is refused for any path outside the extension's own read allowlist (a connected folder is NOT enough), and a synthetic ctrl+v carries no clipboard payload. `navigator.clipboard.readText()` looked like a 45s renderer hang — **it was not: Chrome was showing an invisible "allow paste from clipboard" prompt at the top-left. The call was BLOCKED ON A HUMAN.** Before writing a path off as broken, ask Eias to look at the screen. ChatGPT may also show a "trust this folder" prompt for its local connector. **Never send the prompt without its payload — a review of an absent diff produces invented findings** |
| **Codex CLI** | `gpt-6-astra` | **NOT on PATH** — binary at `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` (`where /r C:\Users\eiasa codex.exe`). Non-interactive form is `codex exec --cd <dir> -s workspace-write` with the prompt on **stdin**; there is no `-a` flag on `exec`. Run it in a `git worktree` of the branch so no upload is needed and main's checkout is untouched | non-empty answer file AND the log records EXIT | NOT independent of ChatGPT — same family, so a second opinion rather than a second engine. It IS independent of Claude, which is the correlation that matters for something Claude lanes designed. **Its real edge is that it has a shell:** give it the questions that must be settled by RUNNING, not by reading. **Repo hazard:** the repo-root `AGENTS.md` describes `shlav-a-mega.html`, a different app, and Codex reads it walking up from cwd — restate the rules in the prompt and tell it to ignore `AGENTS.md` |
| **Gemini** | 3.1 Pro | **Antigravity IDE**, not the web app | the conversation appears in Antigravity's list and produces output | the WEB app's composer refuses programmatic text — its Angular model stays empty so Submit is a no-op. Chrome can only be granted READ access, so desktop-paste into it is blocked by design. Antigravity accepts a clipboard paste (`Set-Clipboard` then ctrl+v) |
| **Eias** | — | this chat | — | wants completions and decisions only, not narration |

**Editing these files from PowerShell will silently corrupt them — this already happened once, on
main.** `Get-Content -Raw` in Windows PowerShell 5.1 decodes a UTF-8 file with no BOM as ANSI, so
writing it back as UTF-8 double-encodes every non-ASCII character: 74 em dashes became mojibake in a
commit that was pushed before anyone looked. Always read with
`[Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($p))` and write with
`[IO.File]::WriteAllBytes($p, $utf8.GetBytes($t))` using `New-Object System.Text.UTF8Encoding $false`.
**And do not try to repair a double-encoded file by round-tripping it** — decoding it as UTF-8 first
replaces the invalid bytes with U+FFFD, destroying the information before the repair runs. Restore
from the last clean commit and redo the edit. Byte-level check, which is the only reliable one:
count occurrences of `0xC3` followed by `0xA2` or `0x83`; it must be zero.

**Cross-lane rules that apply to all of them:** O7 (each lane arms its own liveness check), O9
(blocked lanes say so in one line, as the last message), O10 (read the peer's last MESSAGE, never
its status flag), O11 (an external lane's review is UNSUPPORTED until its artifact is named), O12
(a relay error is the relayer's, never the other model's).

**Independence, for the record:** the chat lane, the cloud lane and the coordinator are all
Claude — one `engine` tag under R10, so their agreement is correlated, not corroborating. ChatGPT
and Codex share a family. Gemini is the only genuinely separate engine, and it is currently out of
the loop at Eias's instruction. Every substantive correction on 18 Sep came from the non-Claude
reviewer or from re-reading source after it.

## THE LANE RULE — binding, not advisory (18 Sep 2026)

Eias has had to state this more than once. It is written here so it is not restated as a promise.

1. **Nothing is issued before the project chat lane has attacked it.** Doctrine, rulesets,
   instruction sets to the cloud lane, ledger content, work orders. Agreeing the *substance* with
   the lane is not the same as the lane having seen the *words*. Send the artefact, ask for attack
   rather than ratification, and say explicitly that where an outside oracle's wording conflicts
   with the coordinator's, the oracle's wins **by default**. A non-Claude oracle's wording is the DEFAULT tiebreak, not an absolute: it is overridden by direct, cited, independent verification against the primary source. The point is not which model spoke, it is whether the wording was checked. Preferring an unverified outside phrasing over a verified one measures the wrong quantity - the identity of the speaker instead of the evidence - which is the same error as a guard that counts comments while claiming to check CSS rules.
2. **A decision that changes route goes back before it is acted on.** If the lane ruled on method
   A and method A fails, method B is a new decision — same outcome, different risk profile. Going
   ahead alone is the failure this rule exists to stop.
3. **Anything a lane relays back is ADDRESSED**, adopted and routed or overruled with the reason.
   Never merely noted, never left uncollected. An uncollected answer is a decision made without it.
4. **Every lane asked a question has its answer collected and read in full** before anything is
   reported onward or acted on.

Failure mode to watch for in yourself: reporting a plan to the lane instead of submitting it, and
treating the lane's agreement on a principle as clearance for the text you then wrote alone.

## O7–O12 — cross-lane rules (18–19 Sep 2026)

**Why these exist.** The coordinator acted on a stalled cloud lane only after Eias nudged. It had a
scheduled check on its OWN claims — main sha, PR draft state, ledger age — and nothing checking
whether the cloud lane was alive with an unanswered message in front of it. O1–O6 stopped the
coordinator grading its own homework; these close the gap beside it.

**Correction of record, made before filing:** the "monitored a status flag instead of reading the
message" self-diagnosis was the COORDINATOR's, not the cloud lane's. The cloud lane stopped and
posted that it was waiting on a check-in — the correct behaviour. So this is not two lanes
independently hitting one bug; it is the coordinator's fourth instance against a cloud lane that
made its block visible. The convergence claim is not supported and is not filed as one.

**O7 — Cross-lane liveness is not one party's job to remember.** Any lane depending on another
lane's output sets its own trigger to check that lane's liveness. A trigger that fires without a
human prompt is monitoring; a habit of checking when asked is not, whatever it is called.

**O8 — Acting only after Eias intervenes is logged as this rule FAILING.** If the gap between "a
lane went quiet" and "the coordinator acted" closes because Eias nudged, that is a FAILURE entry in
the claims log, same class as the five on record. The bar is a scheduled check finding the stall
and acting within one tick of DISCOVERY — not one tick of being told.

**O9 — Self-reported blocking is standing across every lane.** A lane blocked on a check-in says so
in one line, as the LAST message in its own thread, so silence cannot read as nothing-needed. The
cloud lane adopted this under pressure tonight; it now binds the coordinator, the chat lane and
the cloud lane alike.

*Worked example, and it is the reason O10 exists — keep it attached to O9 whenever this is
documented.* On 18 Sep the cloud lane did everything O9 asks: it finished item (2a), stopped, and
posted "not starting §3(3) without your check-in" as the last message in its thread. Visible
blocking, not silence. It was still missed for 53 minutes, because the reader on the other end
checked a STATUS FLAG — no Stop button, no queued message — instead of reading that message. So O9
was satisfied and the system still failed. That is a sharper argument for O10 than any hypothetical:
the rule is needed even when the lane being checked did everything right, because the defect lives
in the reader, not the writer. Do not write this up as the cloud lane stalling. It did not stall.

**O10 — A status flag never substitutes for reading the peer's last content.** Busy/idle,
composer-empty, no-Stop-button, no-queued-message: none is a check on what the other lane SAID. Any
tick logic concluding "nothing needed" must have read the peer's last message. *Scope corrected:
this binds tick logic anywhere, including the coordinator's, which is where the defect actually
was — it is not a remedy for a failure the cloud lane demonstrated.*


**Convergence claims get MORE scrutiny, not less.** Two lanes reaching the same conclusion is this
project's preferred confidence signal — grounds to stop verifying and start fixing. So a claim that
YIELDS a convergence arrives pre-approved by the system's own incentives and draws less scrutiny by
default, which is exactly backwards. Before reporting one: check each party's own artifact markers
(header, thread title, commit author, run id) that the parties really are distinct. The "two lanes,
one bug" claim of 18 Sep was false and survived precisely because it flattered this signal.

*O10, generalised — attribution is checked against the source's own markers, not its content.* A
quote, a finding or a behaviour attributed to a party is verified against THAT PARTY'S ARTIFACT —
its header, title, thread name, commit author, run id — never against how well it completes the
story being told. Thematic fit is a status flag like any other: it feels like evidence and is not.
Worked example: a self-diagnosis was attributed to the cloud lane because it fitted a two-lanes-
same-bug narrative; the screenshot headers settle it in seconds — image 3 reads "SZMC geriatrics
project / Eias10" (the coordinator's own chat), images 1/2/4 read "Stage A study console
verification" (the cloud lane). Checking the header is the check. It was available the whole time
and simply was not run.

**O11 — Coordinating a non-Claude lane gets the claims-log discipline pointed outward.** "Asked
Codex", "Gemini reviewed it", "ChatGPT confirmed" are each logged with the artifact supporting them
— a review comment with an id, a timestamped run, a quoted output — never "I sent it the prompt". A
report that an external lane reviewed, agreed or found nothing is UNSUPPORTED until the artifact is
named.

**O12 — Relay accuracy for external lanes is the coordinator's own.** A gap between what the
coordinator reports Codex CLI, Codex on GitHub, Gemini CLI, Gemini app or ChatGPT web said and what
the artifact shows is logged as the coordinator's failure, same class as the internal five — never
filed as the other model's mistake.

## Monitoring cadence — split by event class, not one flat poll

A flat 25-45 minute poll is wrong for both ends of the range. Split it:

**Checked EVERY tick, never skipped, because the damage is immediate and irreversible-ish:**
a PR that is no longer draft; main's sha moving; a message sitting in a lane's queue with a
"Send now" control; a lane's last message asking for a check-in. Today's near-miss was a CLEAN,
mergeable PR sitting behind a queued message — 25 minutes is far too slow for that class.
**The real fix for that class is structural, not faster polling:** PRs stay DRAFT, which makes the
dangerous state impossible instead of merely watched. Prefer making a state unreachable over
watching for it.

**Poll cadence is fine for:** CI shards mid-run (a 10-shard mutation set takes 10-20 minutes),
long builds, and any check whose subject cannot change faster than the interval.

**Not covered by either:** there is NO CI-completion webhook and no event trigger. A run finishing
at 22:05 is not noticed until the next tick. Say "scheduled check every N minutes", never
"continuous".

**A monitor's reference range is a guard's requirement — R7 applies to watchers too.** The external
watchdog's step 3 originally pinned main at a fixed sha. Every legitimate commit — including the one
that installed this very rule — invalidated it, so it would have fired, correctly by its own logic,
on a change that was fine. A watcher that alarms on normal operation gets ignored, and then it is
not a watcher. Snapshot equality (is the sha still X?) is a PROXY; the property that actually matters
is whether the content under hold moved. So a monitor asserts the behaviour, not the snapshot: step 3
now asks whether a commit beyond the recorded sha touches `stage-a/index.html` or `stage-a/build/`,
and names docs- or skill-only movement instead of alarming on it. Same defect class as a guard that
checks for a class name instead of the computed style that class is supposed to produce. **Whenever
you push, re-read every monitor that references what you just changed** — the coordinator invalidating
its own watchdog is a failure mode with no external witness by construction.

## Lane changes (18 Sep 2026)

- **The project chat lane is the partner, not a delegate.** Its input is collected before a package
  goes to any other lane, and its reply is read in full before anything is reported onward. Three
  Claude lanes agreeing is one oracle. Every substantive correction in ruleset v3 came from the
  non-Claude reviewer or from source re-read after it.
- **Gemini via Antigravity is dropped** from the automatic loop at Eias's instruction. ChatGPT
  (GPT-6 Astra, Extra High) is the outside oracle. Codex CLI is not independent of it — same model
  family — so it is a second opinion, not a second engine.
- **Messages to a Claude Code cloud session are QUEUED while a task is running.** The composer
  clearing, and the text appearing in the page, are not proof of delivery; look for "Queued. Claude
  will read this after the current turn" and a "Send now" control. To actually stop that lane,
  convert its PRs to draft at GitHub (`gh pr ready <n> --undo`) — that holds whether or not any
  agent reads anything, and reverses with `gh pr ready <n>`.
- **"Send now" and "Stop" in that session do not respond to a normal automated click.** They need a
  full pointer sequence dispatched in the page — pointerdown, mousedown, pointerup, mouseup, click
  with real client coordinates — on the button element. Stop first, then Send now; verify by the
  absence of "Queued. Claude will read this after the current turn", never by the composer
  emptying or by the text appearing in the transcript. Both of those are present while the message
  is still undelivered.
