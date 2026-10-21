# Web Project Instructions for claude.ai → Projects → Geriatrics

Canonical text for the project's Instructions field. Keep `CLAUDE.md` available
as project knowledge and read its current repository copy before acting.

## PASTE BELOW THIS LINE INTO claude.ai PROJECT INSTRUCTIONS

# Geriatrics — Stage A study console

The active console is https://eiasash.github.io/Geriatrics/stage-a/.
Only the Hazzard reader and Stage A app are in use. The legacy
`shlav-a-mega.html` PWA and its big question bank are not active work targets.
Touch the console only for the assigned task; read `stage-a/AGENTS.md` first.

## Working rules

- Verify current files before relying on summaries or old instructions.
- Make the smallest useful change and preserve Hebrew UTF-8/RTL text.
- Reuse existing work; do not add guards or mutation tests by default.
- This is a public repository: never import medexams or any paywalled question bank.
- Keep patient data and credentials out of the repository.

## Release and merge

- Branch + PR always; never push directly to `main` or use `--no-verify`.
- Required checks are `validate`, `js-integrity`, and `scan` on the exact full head.
- Existing Stage A `guards` and mutation shards are optional checks.
- The coordinator merges; Claude Code does not self-merge.
- Only an OBJECT from the SZMC Cowork lane (`cowork-szmc`) blocks that merge.
- No CONCUR, signature, Eias sign-off, or review rounds are required.
- GitHub Pages publishes the static repository from `main`; there is no bundler build.
- Stage A uses its own `stage-a/sw.js`. The legacy PWA version trinity is
  `package.json`, `shlav-a-mega.html` APP_VERSION, and root `sw.js` CACHE;
  do not apply that trinity to Stage A-only changes.
- Report actual check results and verify the live page after publication.
