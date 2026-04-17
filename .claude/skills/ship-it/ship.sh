#!/usr/bin/env bash
# /ship-it — local CI mirror + SW bump + commit + push.
# Uses the ACTUAL schema: q/o/c/t/ti (questions), id/topic/ch/notes (notes).

set -euo pipefail

COMMIT_MSG=""
DRY_RUN=0
NO_BUMP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-bump) NO_BUMP=1 ;;
    -*)        echo "Unknown flag: $1" >&2; exit 64 ;;
    *)         COMMIT_MSG="$1" ;;
  esac
  shift
done

say()  { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; }

# --- Preflight ------------------------------------------------------------
say "Preflight"
command -v node >/dev/null || { err "node not found"; exit 127; }
command -v npm  >/dev/null || { err "npm not found"; exit 127; }
command -v git  >/dev/null || { err "git not found"; exit 127; }
[ -f package.json ] || { err "run from repo root"; exit 1; }
ok "tools present"

BRANCH=$(git symbolic-ref --short HEAD)
if [ "$BRANCH" != "main" ]; then
  err "on branch '$BRANCH', not main."
  exit 1
fi
ok "on main"

# --- Gate 1: Vitest ------------------------------------------------------
say "Running Vitest"
if ! npm test --silent; then
  err "tests failed — fix before shipping"
  exit 1
fi
ok "tests pass"

# --- Gate 2: Node syntax check ------------------------------------------
say "Syntax check"
node -e "
  const fs=require('fs');
  const acorn=require('acorn');
  const h=fs.readFileSync('shlav-a-mega.html','utf8');
  const blocks=h.match(/<script(?![^>]*src=)[^>]*>([\\s\\S]*?)<\\/script>/g)||[];
  const joined=blocks.map(b=>b.replace(/<\\/?script[^>]*>/g,'')).join('\\n;\\n');
  acorn.parse(joined,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true});
  console.log('  inline JS parses');
" || { err "shlav-a-mega.html inline JS has syntax errors"; exit 1; }
node --check sw.js || { err "sw.js syntax error"; exit 1; }
for f in scripts/*.cjs scripts/*.js; do
  [ -f "$f" ] || continue
  node --check "$f" || { err "$f syntax error"; exit 1; }
done
ok "syntax clean"

# --- Gate 3: JSON validity ----------------------------------------------
say "JSON validity"
for f in data/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" \
    || { err "$f invalid JSON"; exit 1; }
done
ok "all data/*.json parse"

# --- Gate 4: questions.json schema (q/o/c/t/ti) -------------------------
say "questions.json schema"
node -e "
  const arr=JSON.parse(require('fs').readFileSync('data/questions.json','utf8'));
  let fatal=0;
  for (const [i,it] of arr.entries()) {
    if (!Array.isArray(it.o) || it.o.length !== 4) { console.error('  [idx '+i+'] o must be array of 4'); fatal++; }
    if (typeof it.c !== 'number' || it.c < 0 || it.c > 3) { console.error('  [idx '+i+'] c must be 0..3'); fatal++; }
    if (typeof it.t !== 'string') { console.error('  [idx '+i+'] t must be string year'); fatal++; }
    if (typeof it.ti !== 'number' || it.ti < 0 || it.ti > 39) { console.error('  [idx '+i+'] ti must be 0..39'); fatal++; }
  }
  if (fatal > 0) process.exit(1);
" || { err "questions.json schema fails"; exit 1; }
ok "questions.json: schema clean"

# --- Gate 5: Duplicate question detection (by first 80 chars of q) ------
say "Duplicate question detection"
node -e "
  const arr=JSON.parse(require('fs').readFileSync('data/questions.json','utf8'));
  const seen=new Map();
  let dups=0;
  for (const [i,it] of arr.entries()) {
    const key=(it.q||'').trim().slice(0,80);
    if (!key) continue;
    if (seen.has(key)) { console.error('  dup at idx '+i+' matches idx '+seen.get(key)); dups++; }
    else seen.set(key,i);
  }
  if (dups > 0) process.exit(1);
" || { err "duplicate questions"; exit 1; }
ok "no duplicates"

# --- Gate 6: GRS leak check --------------------------------------------
say "GRS reference scan"
if grep -rniE '\bGRS\b|Geriatric Review Syllabus' data/*.json 2>/dev/null; then
  err "GRS references in data/ — remove them"
  exit 1
fi
ok "no GRS leaks"

# --- Gate 7: notes.json coverage (40 unique topic IDs) ------------------
say "notes.json coverage"
node -e "
  const arr=JSON.parse(require('fs').readFileSync('data/notes.json','utf8'));
  const ids=new Set(arr.map(n => n.id));
  if (ids.size !== 40 || Math.min(...ids) !== 0 || Math.max(...ids) !== 39) {
    console.error('  notes.json must have exactly 40 topics, ids 0..39. Got ' + ids.size + ' unique ids.');
    process.exit(1);
  }
" || { err "notes.json coverage"; exit 1; }
ok "40 topics present"

# --- Gate 8: innerHTML audit -------------------------------------------
say "innerHTML template-literal audit"
if grep -nE '\.innerHTML[[:space:]]*=[[:space:]]*[^;]*\$\{' shlav-a-mega.html; then
  err "unsafe innerHTML template literals — use textContent or sanitized DOM"
  exit 1
fi
ok "no unsafe innerHTML"

# --- SW version bump ---------------------------------------------------
if [ "$NO_BUMP" = "0" ]; then
  say "Bumping SW cache version"
  CURRENT=$(grep -oE "v[0-9]+\.[0-9]+" sw.js | head -1 || true)
  if [ -z "$CURRENT" ]; then
    err "could not find vX.Y pattern in sw.js — use --no-bump or fix manually"
    exit 1
  fi
  MAJOR=${CURRENT#v}
  MAJOR=${MAJOR%%.*}
  MINOR=${CURRENT##*.}
  NEW="v${MAJOR}.$((MINOR + 1))"
  tmp=$(mktemp)
  awk -v old="$CURRENT" -v new="$NEW" 'BEGIN{done=0} { if(!done && index($0,old)){ sub(old,new); done=1 } print }' sw.js > "$tmp"
  mv "$tmp" sw.js
  ok "SW: $CURRENT → $NEW"
else
  ok "SW bump skipped (--no-bump)"
fi

# --- Commit + push -----------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  say "Dry run — not committing or pushing"
  git status -s
  exit 0
fi

say "Staging and committing"
git add -A
if git diff --cached --quiet; then
  ok "nothing to commit"
  exit 0
fi

if [ -z "$COMMIT_MSG" ]; then
  echo "Staged changes:"
  git diff --cached --stat
  printf "\nCommit message: "
  read -r COMMIT_MSG
fi
[ -n "$COMMIT_MSG" ] || { err "empty commit message"; exit 1; }

git commit -m "$COMMIT_MSG"
ok "committed"

say "Pushing to origin/main"
git push origin main
ok "pushed — GitHub Pages deploys in ~60s"
