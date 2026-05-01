#!/usr/bin/env bash
# auto_fix_regenerate_misaligned_distractors.sh — auto-audit Tier 2 template
#
# Repairs data/distractors.json content corruption in Eiasash/Geriatrics
# by dropping misaligned entries and regenerating them via the Toranot
# proxy. Always opens a PR; never pushes to main.
#
# Triggered by: auto-fix.yml workflow_dispatch with
#   template = "regenerate_misaligned_distractors"
#
# Drop into: scripts/auto_fix/regenerate_misaligned_distractors.sh
# (chmod +x)
#
# Required env (provided by auto-fix.yml):
#   GITHUB_TOKEN — needs contents:write + pull-requests:write on Eiasash/Geriatrics
#   REPO         — "Eiasash/Geriatrics"
#   ISSUE_NUMBER — originating auto-audit issue (for PR cross-link)
#
# Wall time: 30-60 min (the regeneration loop dominates).
# Cost: ~$10 on the Toranot proxy (Haiku 4.5).

set -euo pipefail

REPO="${REPO:-Eiasash/Geriatrics}"
ISSUE_NUMBER="${ISSUE_NUMBER:-}"
TS="$(date -u +%Y%m%d-%H%M%S)"
BRANCH="auto-fix/distractor-realign-${TS}"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# ─── 0. Setup ──────────────────────────────────────────────────────────────
WORK="$(mktemp -d)"
cd "$WORK"

git config --global user.email "auto-audit@noreply"
git config --global user.name  "auto-audit-bot"

blue "Cloning $REPO..."
git clone --depth 50 "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" geri
cd geri
git checkout main
git pull --rebase origin main

git checkout -b "$BRANCH"

# ─── 1. Audit current state ────────────────────────────────────────────────
blue "[1/6] Auditing current alignment..."
node -e '
  const fs=require("fs");
  const Q=JSON.parse(fs.readFileSync("data/questions.json"));
  const D=JSON.parse(fs.readFileSync("data/distractors.json"));
  let aligned=0,misaligned=0;
  for(const[k,v] of Object.entries(D)){
    const i=+k,q=Q[i];
    if(!q||!Array.isArray(q.o)||typeof q.c!=="number") continue;
    if(!Array.isArray(v)||v.length!==q.o.length) continue;
    const e=v.findIndex(s=>!s||!String(s).trim());
    if(e===-1) continue;
    if(e===q.c) aligned++; else misaligned++;
  }
  console.log("Aligned:",aligned,"Misaligned:",misaligned);
  if(misaligned===0){ console.error("Nothing to fix — bailing."); process.exit(42); }
'
AUDIT_RC=$?
if [[ $AUDIT_RC -eq 42 ]]; then
  yellow "No misalignment found — closing the issue as already-fixed and exiting."
  if [[ -n "$ISSUE_NUMBER" ]]; then
    curl -sS -X POST \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$REPO/issues/$ISSUE_NUMBER/comments" \
      -d '{"body":"✅ Auto-fix `regenerate_misaligned_distractors` ran but found no misalignment — likely already fixed in a prior commit. Closing."}'
    curl -sS -X PATCH \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$REPO/issues/$ISSUE_NUMBER" \
      -d '{"state":"closed"}'
  fi
  exit 0
fi

# ─── 2. Drop misaligned entries ────────────────────────────────────────────
blue "[2/6] Dropping misaligned entries..."
node -e '
  const fs=require("fs");
  const Q=JSON.parse(fs.readFileSync("data/questions.json"));
  const D=JSON.parse(fs.readFileSync("data/distractors.json"));
  const out={};
  for(const[k,v] of Object.entries(D)){
    const i=+k,q=Q[i];
    if(!q||!Array.isArray(q.o)||typeof q.c!=="number") continue;
    if(!Array.isArray(v)||v.length!==q.o.length) continue;
    const e=v.findIndex(s=>!s||!String(s).trim());
    if(e===-1||e!==q.c) continue;
    out[k]=v;
  }
  fs.writeFileSync("data/distractors.json",JSON.stringify(out));
  console.log("Kept aligned:",Object.keys(out).length);
'

# ─── 3. Regenerate via Toranot proxy ───────────────────────────────────────
blue "[3/6] Regenerating distractors via Toranot proxy (this is the long step)..."
yellow "      ~30-60 min wall, ~\$10 spend, Haiku 4.5, 6 workers..."

# The script is resumable. If it dies mid-run we re-run; default mode skips
# entries already present.
ATTEMPTS=0
MAX_ATTEMPTS=3
while [[ $ATTEMPTS -lt $MAX_ATTEMPTS ]]; do
  ATTEMPTS=$((ATTEMPTS+1))
  blue "  Generator attempt $ATTEMPTS/$MAX_ATTEMPTS"
  if node scripts/generate_distractors.cjs --batch 6 --delay 250 --model haiku; then
    break
  fi
  yellow "  Generator exited non-zero, retrying in 30s..."
  sleep 30
done

# Verify completeness
node -e '
  const fs=require("fs");
  const Q=JSON.parse(fs.readFileSync("data/questions.json"));
  const D=JSON.parse(fs.readFileSync("data/distractors.json"));
  let missing=0,misaligned=0;
  for(let i=0;i<Q.length;i++){
    const q=Q[i],v=D[i];
    if(!q||!Array.isArray(q.o)||typeof q.c!=="number") continue;
    if(!v){ missing++; continue; }
    if(!Array.isArray(v)||v.length!==q.o.length){ missing++; continue; }
    const e=v.findIndex(s=>!s||!String(s).trim());
    if(e===-1||e!==q.c){ misaligned++; continue; }
  }
  console.log("Missing:",missing,"Misaligned:",misaligned);
  if(missing>0||misaligned>0){
    console.error("FAIL: regen left holes; manual intervention needed.");
    process.exit(1);
  }
'

# ─── 4. Run tests ──────────────────────────────────────────────────────────
blue "[4/6] Installing deps + running test suite..."
npm install --no-audit --no-fund --silent
npx vitest run tests/distractorsDrift.test.js
# Don't run the whole suite here — the alignment guard is the only thing
# affected by this change; full suite runs in CI on the PR.

# ─── 5. Bump version trinity ───────────────────────────────────────────────
blue "[5/6] Bumping version trinity..."
CURR=$(node -p "require('./package.json').version")
# Patch bump (e.g. 10.44.0 -> 10.44.1). Auto-fix never bumps minor/major.
NEW=$(node -p "
  const [maj,min,pat]=require('./package.json').version.split('.').map(Number);
  [maj,min,pat+1].join('.')
")
echo "  $CURR → $NEW"

# package.json
node -e "
  const fs=require('fs');
  const p=JSON.parse(fs.readFileSync('package.json'));
  p.version='$NEW';
  fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
"

# shlav-a-mega.html APP_VERSION
sed -i "s/const APP_VERSION='${CURR}';/const APP_VERSION='${NEW}';/" shlav-a-mega.html
# shlav-a-mega.html CHANGELOG entry — insert just after the CHANGELOG opening
node -e "
  const fs=require('fs');
  const f='shlav-a-mega.html';
  let html=fs.readFileSync(f,'utf8');
  const entry=\`'${NEW}':[
'🤖 Auto-fix: distractor autopsy data corruption detected by auto-audit probe and repaired automatically. \${process.env.MISALIGNED_COUNT||'?'} misaligned entries dropped and regenerated against current questions.json. Originating issue: #${ISSUE_NUMBER}.',
],
\`;
  html=html.replace(/const CHANGELOG=\\{\\n/, 'const CHANGELOG={\\n'+entry);
  fs.writeFileSync(f,html);
"

# sw.js cache name (assumes pattern 'shlav-a-vX.Y.Z')
sed -i "s/const CACHE='shlav-a-v${CURR}';/const CACHE='shlav-a-v${NEW}';/" sw.js

# ─── 6. Commit + push + PR ─────────────────────────────────────────────────
blue "[6/6] Committing + opening PR..."
git add -A
git commit -m "v${NEW} — auto-fix distractor autopsy data corruption

Auto-audit probe \`probe_distractor_alignment\` detected misaligned
entries in data/distractors.json. This commit:

- drops misaligned entries (where DIS[k] empty slot != Q[k].c)
- regenerates them via Toranot proxy / Haiku 4.5 / 6 workers
- bumps version trinity to ${NEW}
- adds changelog entry

Originating issue: #${ISSUE_NUMBER}

Co-Authored-By: auto-audit-bot <auto-audit@noreply>"

git push origin "$BRANCH"

PR_BODY="Automated repair of distractor autopsy corruption detected by \`probe_distractor_alignment\`.

Originating issue: #${ISSUE_NUMBER}

**Verify before merging:**
- [ ] CI green
- [ ] Spot-check 2-3 questions: open the live preview, answer wrong, confirm Distractor Autopsy block shows correct content for all 3 wrong options and a green-label on the correct one
- [ ] No 'Wrong because:' rationale on any green-checked answer

After merge, the alignment probe will re-run on the next health-check cycle and (should) report clean."

PR_RESPONSE=$(curl -sS -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/pulls" \
  -d "$(jq -n --arg title "v${NEW} — auto-fix distractor autopsy data corruption" \
              --arg body "$PR_BODY" \
              --arg head "$BRANCH" \
              --arg base "main" \
              '{title:$title, body:$body, head:$head, base:$base}')")

PR_NUMBER=$(echo "$PR_RESPONSE" | jq -r '.number // empty')
PR_URL=$(echo "$PR_RESPONSE" | jq -r '.html_url // empty')

if [[ -z "$PR_NUMBER" ]]; then
  red "PR creation failed: $PR_RESPONSE"
  exit 1
fi

# Cross-link to the originating issue
if [[ -n "$ISSUE_NUMBER" ]]; then
  curl -sS -X POST \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/issues/$ISSUE_NUMBER/comments" \
    -d "$(jq -n --arg body "✅ Auto-fix \`regenerate_misaligned_distractors\` opened PR #${PR_NUMBER}: ${PR_URL}\n\nMerge after CI green + manual spot-check on the preview deploy." '{body:$body}')"
fi

green "✅ Done. PR opened: $PR_URL"
