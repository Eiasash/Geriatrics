---
description: Full audit → fix → test → build → deploy → verify cycle for this repo. Auto-detects repo; verify-first with coordinator-owned merges.
---

Run the **audit-fix-deploy** skill end-to-end for the repo in the current working directory.
Captain mode: ACT, don't ask — but obey the VERIFY-FIRST, GATES, CITATION, and MERGE rules below.
The skill owns the per-repo pipeline (STEP 0 detect → Audit → Fix → Test+Build → Deploy → Verify → Skill-update → Self-improve). Follow it; do not reinvent it. If it isn't already in context, load `audit-fix-deploy` + its `deploy-primitives` companion by name.

Start with STEP 0 immediately. Do not ask for confirmation.

## Verify-first — state is a claim until checked (Rule 5)
- Before acting: `git log -8 --all`, read the live SW/version (`curl <live-url>/sw.js | grep CACHE`), read on-main horizon/plan docs. Treat memory, compaction summaries, and any spec as claims to verify — not a task list. A task is "open" only after you confirm it isn't already shipped on main.
- Anchor-refresh any spec authored ≥24h ago: source-file line numbers, vitest baseline count, build-size figures, live SW version + commit SHA. Stale anchors fail silent and make gates meaningless.
- If a referenced plan artifact is missing, STOP and flag — do not reconstruct it from memory.

## Gates — declare before you run (Rule 6)
Before any commit and before any stochastic / AI-batch run, write the explicit pass/fail criterion AND the current green baseline. No proceeding on a partial win rationalized afterward. Detector-armed: prove RED on a known-bad input before trusting any test/detector to certify GREEN.

## Citation gate (Rule 7)
Every claim about what code/infra DOES ("covered", "inherits X", "verified", "handled by Y") cites a runnable/readable artifact — test path, command, or file:line. Reading the mechanism is not verifying it; run the real artifact. Once the cited artifact is green, do not re-litigate the prose around it.

## Fix priority + stop conditions
Fix in order: RLS hole > crash/silent-failure > wrong clinical/data output > leak > cosmetic. Halt at the current phase (fix before advancing) on: RLS hole, crash, red tests, failed build, failed deploy. Never force-push over a broken deploy — rollback and investigate. Run the deploy-primitives §3 RLS sanity pass on ANY schema-adjacent change (shared Postgres across five repos); record the result line in IMPROVEMENTS.md even when clean.

## Merge authority
Branch + PR always; never push directly to `main` or use `--no-verify`.
- The coordinator merges once `validate`, `js-integrity`, and `scan` are green on the exact full head.
- Claude Code does not self-merge. Only an OBJECT from the SZMC Cowork lane (`cowork-szmc`) blocks the coordinator's merge.
- No CONCUR, signature, Eias sign-off, or review rounds are required. Existing Stage A guards and mutation shards are optional checks.
- Don't unpark parked work or open a kickoff doc unless its documented trigger fired / required evidence exists.
- Follow the current `CLAUDE.md` and `stage-a/AGENTS.md` for repo scope and release mechanics.

## Output (terse)
Report findings, fixes, branch/commit or PR, required-check results, coordinator handoff status, and any verification not run. Report a live check only after the coordinator has merged and publication has been verified.

## Never
Reinvent the pipeline/spec; paraphrase clinical skill content into code (verbatim port only); exceed maxAttempts>3 on extract/emit; auto-flip q.c / c_accept / curator overrides / distractor empty-slots; collapse multi-accept Qs; trust a search snippet over live state.
