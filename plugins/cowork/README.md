# cowork (Geriatrics)

Claude Code plugin that formalizes the `cowork/<topic>` branch workflow already in use on this repo (`cowork/distractor-autopsy`, `cowork/flashcards-mode`, `cowork/tighten-hebrew-budgets`, …).

One plugin = consistent start / handoff / resume / status / land commands + tandem-session safety (claim/collisions) + a distractor-autopsy reviewer agent + Hazzard-scoped topic-coverage reporting + a SessionStart hook that loads the current handoff automatically.

## Install

Symlink into the repo's `.claude/plugins/` (matches existing `.claude/` convention):

```bash
mkdir -p .claude/plugins
ln -sfn "$PWD/plugins/cowork" .claude/plugins/cowork
```

## Commands

| Command | Purpose |
|---|---|
| `/cowork:start <slug>` | Cut `cowork/<slug>` from main, scaffold `.cowork/<slug>.md` |
| `/cowork:handoff` | Refresh handoff: question count, topic coverage delta, failing vitest suites, next step |
| `/cowork:resume` | Read handoff, verify `npm test`, restate next action |
| `/cowork:status` | Every cowork branch: ahead/behind, handoff age, question delta, any Hazzard-excluded-chapter regressions |
| `/cowork:land` | Rebase, enforce question-schema, run vitest, draft squash message |
| `/cowork:claim <path…>` | Declare paths the current branch is editing so parallel sessions can see it |
| `/cowork:collisions` | Report file overlap and claim violations across all active cowork/* branches (tandem-session safety) |
| `/cowork:distractor-autopsy <qid>` | Deep review one MCQ's distractors before approving it |
| `/cowork:topic-coverage` | Report question density per Hazzard allowed chapter; flag gaps and overweighted topics |
| `/cowork:hebrew-sweep` | Check recently-touched Hebrew strings against hebrew-medical-glossary |

## Agents

- `distractor-autopsy` — second-opinion reviewer for MCQ quality (homogeneity, plausibility, absolute-term red flags, answer-key stability).
- `schema-guard` — verifies any `data/questions.json` change respects the question-schema skill (fields, allowed enums, no GRS leak, no Hazzard-excluded chapter).

## Hook

`SessionStart` — if HEAD is `cowork/*`, prints the handoff file + last 5 commits.

## Handoff file

Lives at `.cowork/<slug>.md`, committed. See `skills/handoff-format/SKILL.md`.

## Tandem safety

When multiple Claude sessions (or humans + a Claude) run cowork branches in parallel, use:

1. `/cowork:claim data/questions.json shlav-a-mega.html` at the start of your session. This writes a timestamped **Claimed** block into `.cowork/<slug>.md` and pushes it.
2. Before a long edit, run `/cowork:collisions` — it fetches all cowork branches and reports any file touched by ≥2 branches, plus any branch editing paths claimed elsewhere.
3. Resolve by rebase or by yielding the newer branch. Never auto-resolve.
