# Claude Code Automation Bundle

Drop-in automation for `Eiasash/Geriatrics`. Reconciled with the repo's **actual** data schema (`q`/`o`/`c`/`t`/`ti` for questions; `id`/`topic`/`ch`/`notes` for notes; `name`/`heb`/`acb`/`beers` for drugs), syllabus constraints (Hazzard excluded chapters 2-6/34/62, Harrison allowed chapters 26/382/387/433/436-439/458-459, zero GRS), and coexistence with existing `.claude/` layout.

## What's included

| Component | Path | Type | Coexists with |
|---|---|---|---|
| Pre-edit safety hook | `scripts/hooks/pre-edit-safety.sh` | PreToolUse | — |
| SW version pairing guard | `scripts/hooks/check-sw-version-pairing.sh` | PreToolUse | — |
| JSON schema validator | `scripts/hooks/validate-json-edit.sh` | PostToolUse | — |
| Git pre-commit safety net | `scripts/git-hooks/pre-commit` | Git hook | — |
| Hook registration | `.claude/settings.json` | Claude Code config | — |
| Clinical accuracy reviewer | `.claude/agents/clinical-accuracy-reviewer.md` | Subagent | `note-updater`, `question-explainer` (complements) |
| Schema guardian | `.claude/agents/schema-guardian.md` | Subagent | — |
| Content decomposer | `.claude/agents/content-decomposer.md` | Subagent | — |
| `/ship-it` | `.claude/skills/ship-it/` | User-only skill | `/audit-fix-deploy` command (different philosophy) |
| `/weekly-audit` | `.claude/skills/weekly-audit/` | User-only skill | `weekly-audit.yml` workflow (on-demand mirror) |
| `question-schema` | `.claude/skills/question-schema/` | Claude-only skill | `/add-questions` command (complements) |
| `hebrew-medical-glossary` | `.claude/skills/hebrew-medical-glossary/` | Claude-only skill | — |
| `/validate` | `.claude/commands/validate.md` | Slash command | `/audit` command (faster, parallel) |
| **Decomposition plan** | `docs/DECOMPOSITION_PLAN.md` | Executable plan | — |
| MCP additions | `.mcp.json.additions` | MCP config | existing `supabase` MCP (manual merge) |
| CLAUDE.md additions | `CLAUDE.md.additions` | Docs (manual append) | existing CLAUDE.md |

## Coexistence with existing automation

Current repo already contains `.claude/`:

| Existing | What it does | What this branch adds | Overlap? |
|---|---|---|---|
| `/audit` command | Audit checklist prompt | `/validate` command + `schema-guardian` subagent | NO — `/audit` is a checklist, `/validate` is a parallel executor |
| `/audit-fix-deploy` command | Aggressive auto-fix + deploy | `/ship-it` skill | NO — `/audit-fix-deploy` fixes as it goes, `/ship-it` fails loud on issues |
| `/add-questions` command | Question insertion workflow | `question-schema` skill | NO — the command runs the workflow, the skill is background schema knowledge |
| `/explain-batch` command | Pre-generate AI explanations | — | — |
| `/update-notes` command | Update notes.json per syllabus | `clinical-accuracy-reviewer` subagent | NO — command updates, subagent reviews |
| `note-updater` agent | Updates notes | `clinical-accuracy-reviewer` | COMPLEMENTARY — run reviewer after updater |
| `question-explainer` agent | Generates explanations | `clinical-accuracy-reviewer` | COMPLEMENTARY — run reviewer on generated output |
| `shlav-a-mega` skill | Project skill | `question-schema`, `hebrew-medical-glossary` | NO — new skills are field-specific |
| `supabase` / `supabase-postgres-best-practices` skills | Backend | — | — |

No filename collisions with the existing repo.

## Post-merge install steps

Two files in this branch are **not applied automatically** — you must merge them by hand:

```bash
# 1. Merge MCP additions into your .mcp.json
cat .mcp.json.additions
# Copy the "context7", "pubmed", and "github" entries into the mcpServers block
# of your existing .mcp.json (keep your supabase entry).

# 2. Append automation docs to CLAUDE.md
cat CLAUDE.md.additions >> CLAUDE.md

# 3. Make hook scripts executable
chmod +x scripts/hooks/*.sh \
         .claude/skills/ship-it/ship.sh \
         .claude/skills/weekly-audit/audit.sh \
         scripts/git-hooks/pre-commit

# 4. Install the git pre-commit hook (catches commits outside Claude)
git config core.hooksPath scripts/git-hooks
```

## Verify after install

```bash
CLAUDE_FILE_PATHS=data/questions.json bash scripts/hooks/pre-edit-safety.sh
CLAUDE_FILE_PATHS=data/questions.json bash scripts/hooks/validate-json-edit.sh
bash .claude/skills/ship-it/ship.sh --dry-run
bash .claude/skills/weekly-audit/audit.sh
```

## Recommended rollout order

1. **Merge the PR and restart Claude.** Hooks fire on next edit.
2. **Run `/weekly-audit` once.** Establishes a baseline in `docs/audits/weekly-<date>.md`.
3. **Run `/validate` on current state.** Confirms all 13 schema checks pass on what you already have. Expect some failures — that's the point, your CI has been letting things through.
4. **Install PubMed MCP** (per `.mcp.json.additions`). Unlocks `clinical-accuracy-reviewer`'s citation verification.
5. **Read `docs/DECOMPOSITION_PLAN.md`.** Decide whether Phase 1 extraction is worth running in a dedicated sprint.
6. **On next question-add session: use `/add-questions` (existing command) — `question-schema` skill auto-loads.**
7. **On next content review: invoke `@clinical-accuracy-reviewer` after your edit.**
8. **First deploy via `/ship-it`** — moment of truth for end-to-end.

## Honest limits

- **I didn't execute the scripts against your real repo before pushing.** Schema validators match CLAUDE.md's declared canon; any edge case surfaces on first run.
- **PubMed / GitHub MCP package names are best-effort.** Confirm they expose the tool names referenced in `clinical-accuracy-reviewer.md` after installing, update the frontmatter `tools:` line if not.
- **The `weekly-audit.sh` script is BSD/GNU-date-agnostic** but assumes bash + coreutils + node + git. Exotic environments: a check or two may skip.

## First `/ship-it` will probably fail

With 1,685+ questions, 40 notes, and years of accumulated drift, the CI-grade gates in `/ship-it` and `schema-guardian` will almost certainly find:

- Some latent GRS references (2026 syllabus drift)
- Some excluded Hazzard chapter citations
- Some type drift (e.g. `t: 2022` instead of `t: "2022"`)
- Some innerHTML template-literal patterns

That's a feature. Fix the findings, rerun, ship.
