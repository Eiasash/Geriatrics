# CLAUDE.md — Geriatrics / Stage A

## Active scope

- This public repository hosts Hebrew geriatrics study tools on GitHub Pages.
- The active app here is the study console at `stage-a/`.
- Live console: https://eiasash.github.io/Geriatrics/stage-a/
- Only Stage A and the separate Hazzard reader are in use.
- The old `shlav-a-mega.html` exam PWA and its big question bank are not in use.
- Do not resume work on that question bank or the inactive apps.
- Read `stage-a/AGENTS.md` for console-specific behavior and harness details.

## Files and release mechanics

- `stage-a/index.html` contains the console; it is static HTML/CSS/JavaScript.
- `stage-a/sw.js` is its own network-first service worker, scoped to `stage-a/`.
- Its cache name is `stage-a-v1`; Stage A has no package/HTML/SW version trinity.
- The retained exam PWA has a separate version trinity:
  `package.json` version, `shlav-a-mega.html` APP_VERSION, and root `sw.js` CACHE.
- Those retained sources currently use `10.64.195` / `shlav-a-v10.64.195`.
- `scripts/check-version-sync.py` requires HTML and SW versions to match;
  package.json must start with the HTML version (a package suffix is allowed).
- Keep that trinity aligned if an explicitly assigned legacy release changes it.
- Documentation-only changes do not require an application version bump.
- GitHub Pages publishes static files from `main`, at repository root `/`.
- A coordinator merge to `main` publishes the site; there is no production build.

## Branches and merging

- Always use a task branch and PR; never push directly to `main`.
- Never use `--no-verify`.
- Merges are trust-based (Eias, 17.10.2026).
- There is no CONCUR, signature, or Eias sign-off requirement.
- Only an OBJECT from the SZMC Cowork lane (`cowork-szmc`) blocks a merge.
- The coordinator merges after all three required checks are green on the
  exact full commit head; Claude Code and Codex do not self-merge this repo.
- No review rounds or routine bot-review requests.

## Checks

- Required checks are exactly `validate`, `js-integrity`, and `scan`.
- `validate`: `.github/workflows/ci.yml` (data/schema checks, version sync,
  innerHTML audit, image-map/HTML/brace checks, `npm ci`, `npx vitest run`).
- Its cross-repo syllabus check runs only for the corpus/syllabus paths in CI.
- `js-integrity`: `.github/workflows/integrity-guard.yml` (its Python checks).
- `scan`: `.github/workflows/gitleaks.yml`; run
  `gitleaks detect --no-git --redact --config .gitleaks.toml --exit-code 1`.
- Use the checked-in workflow commands for local verification.
- Stage A `guards` and mutation shards are optional, not required merge checks.
- Keep existing guards and mutation shards; a change need not add a new guard.

## Public-repository copyright

- NEVER import medexams or any paywalled question bank: this is a PUBLIC repo,
  and copying those questions here is unlawful republication.
- Never copy external/paywalled questions. Preserve this rule from `AGENTS.md`.
