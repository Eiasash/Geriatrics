---
name: weekly-audit
description: Run the 13 health checks that .github/workflows/weekly-audit.yml runs on a cron, but on demand. Use Monday mornings or before major milestones. Produces a markdown report of drift, staleness, and accumulated technical debt. Read-only, takes 2-3 minutes.
disable-model-invocation: true
---

# /weekly-audit

The cron-driven `weekly-audit.yml` workflow runs 13 health checks every week. This skill runs the same checks on demand so you can catch drift between scheduled runs and before big pushes.

## What it checks

1. **Test coverage trend** — `npx vitest run --coverage` and compare against last recorded baseline
2. **Function count** in `shlav-a-mega.html` vs. 7-day-ago count (from git)
3. **Question count growth** — `questions.json` item count vs. 7-day-ago
4. **Notes coverage** — exactly 40 topics present, no placeholder text
5. **Drug database currency** — flag any drug with no Beers 2023 annotation
6. **Dead link scan** — every PDF referenced in notes/questions actually exists on disk
7. **Image asset audit** — every `questions/images/*.png` referenced at least once
8. **Syllabus drift** — grep for any Hazzard ch 2-6/34/62, any GRS ref, any Harrison ch outside allowed list
9. **Stale branch check** — `git branch -a` showing branches not merged to main in >30 days
10. **Large file check** — flag anything >500KB that isn't a known PDF/PNG
11. **SW cache manifest accuracy** — every file in `sw.js` cache array actually exists
12. **Package.json drift** — check `npm outdated` for Vitest or critical deps
13. **TODO/FIXME scan** — count `TODO|FIXME|HACK|XXX` across the repo, report new ones since last week

## Invocation

```
/weekly-audit
/weekly-audit --since 2026-04-01      # custom baseline date
/weekly-audit --no-network            # skip npm outdated (offline mode)
```

## Execution

The skill runs:
```bash
bash .claude/skills/weekly-audit/audit.sh "$ARGS"
```

All output goes to `docs/audits/weekly-YYYY-MM-DD.md` so you have a historical trail. Claude surfaces the summary table in-chat; full details are in the file.

## Rules

- **Never auto-fix.** The whole point is passive monitoring; acting on findings is a separate decision.
- **Compare against git history**, not a state file. Git is the source of truth.
- **Graceful degradation.** If `npm outdated` fails (network, registry down), skip check 12 with a warning, continue.
- **Append to history.** If `docs/audits/weekly-YYYY-MM-DD.md` exists, overwrite it (today's audit replaces today's audit) but never delete prior days.

## When you'd skip this skill

- Same-day commit/push cycle — `/ship-it` already runs CI-mirror
- You just merged a big refactor — let CI settle first
- You're mid-sprint and don't want to see the drift (valid but denial)
