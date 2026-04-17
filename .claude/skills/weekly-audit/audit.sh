#!/usr/bin/env bash
# /weekly-audit — on-demand mirror of .github/workflows/weekly-audit.yml
# Writes a dated report to docs/audits/, prints summary to stdout.

set -u

SINCE=""
NO_NETWORK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="$2"; shift 2 ;;
    --no-network) NO_NETWORK=1; shift ;;
    *) shift ;;
  esac
done

TODAY=$(date +%F)
mkdir -p docs/audits
OUT="docs/audits/weekly-${TODAY}.md"
BASELINE=${SINCE:-$(date -d '7 days ago' +%F 2>/dev/null || date -v-7d +%F)}

say() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
ok()  { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m⚠\033[0m %s\n" "$*"; }

{
echo "# Weekly Audit — $TODAY"
echo ""
echo "Baseline: $BASELINE"
echo ""
} > "$OUT"

# 1. Test coverage
say "Test coverage"
if [ "$NO_NETWORK" = "0" ] && command -v npx >/dev/null 2>&1; then
  COV=$(npx vitest run --coverage 2>&1 | grep -E 'All files|Statements' | tail -1 || true)
  echo "## Test coverage" >> "$OUT"
  echo '```'"$COV"'```' >> "$OUT"
  echo "" >> "$OUT"
  ok "coverage recorded"
else
  warn "coverage skipped (offline/no npx)"
fi

# 2. Function count vs baseline
say "Function count"
CURRENT_FC=$(grep -cE '(^|[^/])(function [a-zA-Z_]\w*\()|(const [a-zA-Z_]\w* *= *(async *)?\()' shlav-a-mega.html || echo 0)
BASELINE_SHA=$(git rev-list -n 1 --before="$BASELINE" main 2>/dev/null || true)
BASELINE_FC=0
if [ -n "$BASELINE_SHA" ]; then
  BASELINE_FC=$(git show "$BASELINE_SHA:shlav-a-mega.html" 2>/dev/null | grep -cE '(^|[^/])(function [a-zA-Z_]\w*\()|(const [a-zA-Z_]\w* *= *(async *)?\()' || echo 0)
fi
DELTA=$((CURRENT_FC - BASELINE_FC))
{
  echo "## Function count"
  echo "- Current: $CURRENT_FC"
  echo "- $BASELINE: $BASELINE_FC"
  echo "- Delta: $DELTA"
  echo ""
} >> "$OUT"
ok "functions: $CURRENT_FC (Δ $DELTA)"

# 3. Question count growth
CURRENT_QC=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/questions.json','utf8')).length)" 2>/dev/null || echo 0)
BASELINE_QC=0
if [ -n "$BASELINE_SHA" ]; then
  BASELINE_QC=$(git show "$BASELINE_SHA:data/questions.json" 2>/dev/null | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).length)" 2>/dev/null || echo 0)
fi
{
  echo "## Question count"
  echo "- Current: $CURRENT_QC"
  echo "- $BASELINE: $BASELINE_QC"
  echo "- Added: $((CURRENT_QC - BASELINE_QC))"
  echo ""
} >> "$OUT"
ok "questions: $CURRENT_QC (added $((CURRENT_QC - BASELINE_QC)))"

# 4. Notes coverage
NOTE_IDS=$(node -e "
  const a=JSON.parse(require('fs').readFileSync('data/notes.json','utf8'));
  const ids=new Set(a.map(n=>n.id));
  console.log(ids.size);
" 2>/dev/null || echo 0)
{
  echo "## Notes coverage"
  echo "- Unique topic IDs: $NOTE_IDS / 40"
  [ "$NOTE_IDS" = "40" ] && echo "- ✅ Complete" || echo "- ❌ MISSING TOPICS"
  echo ""
} >> "$OUT"

# 5. Drug currency (Beers-annotated)
DRUG_TOTAL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/drugs.json','utf8')).length)" 2>/dev/null || echo 0)
DRUG_ANNOTATED=$(node -e "
  const a=JSON.parse(require('fs').readFileSync('data/drugs.json','utf8'));
  console.log(a.filter(d => typeof d.beers === 'boolean').length);
" 2>/dev/null || echo 0)
{
  echo "## Drug database"
  echo "- Total drugs: $DRUG_TOTAL"
  echo "- Beers-annotated: $DRUG_ANNOTATED"
  echo ""
} >> "$OUT"

# 6. Syllabus drift
say "Syllabus drift scan"
GRS_HITS=$(grep -rniE '\bGRS\b|Geriatric Review Syllabus' data/*.json 2>/dev/null | wc -l | tr -d ' ')
# Range-aware Hazzard drift check — POSIX ERE cannot expand "Ch 33-34" or
# distinguish it from "Ch 11-12", so we delegate to the node helper.
if [ -r scripts/hooks/lib/hazzard-check.cjs ] && command -v node >/dev/null 2>&1; then
  HAZZARD_EXCL=$(node scripts/hooks/lib/hazzard-check.cjs data/*.json 2>/dev/null | wc -l | tr -d ' ')
else
  HAZZARD_EXCL=0
fi
{
  echo "## Syllabus drift"
  echo "- GRS references: $GRS_HITS (must be 0)"
  echo "- Excluded Hazzard citations: $HAZZARD_EXCL (must be 0)"
  echo ""
} >> "$OUT"

# 7. Dead PDF links
DEAD_PDFS=0
for pdf in $(grep -rohE '"[^"]*\.pdf"' data/*.json 2>/dev/null | sort -u | tr -d '"'); do
  [ -f "$pdf" ] || DEAD_PDFS=$((DEAD_PDFS + 1))
done
{
  echo "## Dead PDF links"
  echo "- Broken: $DEAD_PDFS"
  echo ""
} >> "$OUT"

# 8. Orphan images
if [ -d questions/images ]; then
  TOTAL_IMG=$(find questions/images -name '*.png' 2>/dev/null | wc -l | tr -d ' ')
  REF_IMG=0
  for img in questions/images/*.png; do
    [ -f "$img" ] || continue
    BASE=$(basename "$img")
    grep -q "$BASE" data/questions.json 2>/dev/null && REF_IMG=$((REF_IMG + 1))
  done
  {
    echo "## Question images"
    echo "- Total: $TOTAL_IMG"
    echo "- Referenced: $REF_IMG"
    echo "- Orphan: $((TOTAL_IMG - REF_IMG))"
    echo ""
  } >> "$OUT"
fi

# 9. Stale branches
if command -v git >/dev/null 2>&1; then
  STALE=$(git for-each-ref --format='%(refname:short) %(committerdate:iso8601)' refs/heads 2>/dev/null | awk -v cutoff="$(date -d '30 days ago' +%s 2>/dev/null || date -v-30d +%s)" '{
    cmd="date -d \"" $2 " " $3 "\" +%s 2>/dev/null || date -jf \"%Y-%m-%d\" \"" $2 "\" +%s 2>/dev/null";
    cmd | getline ts; close(cmd);
    if (ts+0 < cutoff+0 && $1 != "main") print $1
  }' | wc -l | tr -d ' ')
  {
    echo "## Stale branches (> 30 days)"
    echo "- Count: $STALE"
    echo ""
  } >> "$OUT"
fi

# 10. Large files
LARGE=$(find . -type f -size +500k ! -name '*.pdf' ! -name '*.png' ! -path './node_modules/*' ! -path './.git/*' 2>/dev/null | head -20)
{
  echo "## Large files (>500KB, non-PDF/PNG)"
  echo '```'
  echo "$LARGE"
  echo '```'
  echo ""
} >> "$OUT"

# 11. SW cache manifest
say "SW cache manifest integrity"
SW_BROKEN=0
if [ -f sw.js ]; then
  # Extract cached paths: things like '/data/questions.json' or 'shlav-a-mega.html'
  for path in $(grep -oE "['\"][^'\"]*\.(json|html|js|css|png|pdf)['\"]" sw.js | tr -d "'\"" | sort -u); do
    CLEAN=$(echo "$path" | sed 's|^/||')
    [ -f "$CLEAN" ] || SW_BROKEN=$((SW_BROKEN + 1))
  done
fi
{
  echo "## SW cache manifest"
  echo "- Missing files referenced in sw.js: $SW_BROKEN"
  echo ""
} >> "$OUT"

# 12. npm outdated
if [ "$NO_NETWORK" = "0" ] && command -v npm >/dev/null 2>&1; then
  OUTDATED=$(npm outdated --parseable 2>/dev/null | wc -l | tr -d ' ')
  {
    echo "## npm outdated"
    echo "- Outdated packages: $OUTDATED"
    echo ""
  } >> "$OUT"
fi

# 13. TODO/FIXME trend
TODO_NOW=$(grep -rnE '\b(TODO|FIXME|HACK|XXX)\b' --include='*.js' --include='*.cjs' --include='*.html' --include='*.sh' . 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
{
  echo "## TODO/FIXME"
  echo "- Current count: $TODO_NOW"
  echo ""
} >> "$OUT"

# --- Summary ---
{
  echo "## Summary verdict"
  [ "$GRS_HITS" = "0" ] && [ "$HAZZARD_EXCL" = "0" ] && [ "$DEAD_PDFS" = "0" ] && [ "$SW_BROKEN" = "0" ] \
    && echo "✅ Clean. No blocking drift detected." \
    || echo "⚠️  Drift detected. Review flagged sections above."
} >> "$OUT"

echo ""
echo "Report written to: $OUT"
tail -3 "$OUT"
