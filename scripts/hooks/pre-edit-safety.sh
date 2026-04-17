#!/usr/bin/env bash
# PreToolUse hook: safety rails for CI-fail-causing mistakes.
# Uses the ACTUAL schema (q/o/c/t/ti for questions; id/topic/ch/notes for notes).

set -u
FILES="${CLAUDE_FILE_PATHS:-}"
[ -z "$FILES" ] && exit 0

BLOCK=0

# Rule 1: warn on innerHTML template-literal patterns in shlav-a-mega.html
if echo "$FILES" | grep -q 'shlav-a-mega\.html'; then
  if [ -r shlav-a-mega.html ]; then
    HITS=$(grep -cE '\.innerHTML[[:space:]]*=[[:space:]]*[^;]*\$\{' shlav-a-mega.html 2>/dev/null || echo 0)
    if [ "$HITS" -gt 0 ]; then
      echo "⚠️  ${HITS} innerHTML template-literal pattern(s) in shlav-a-mega.html."
      echo "   CI integrity-guard flags these. Prefer textContent or sanitized DOM."
    fi
  fi
fi

# Rule 2: block GRS / excluded Hazzard chapters in data/*.json
# Hazzard excluded (P005-2026): 2, 3, 4, 5, 6, 34, 62
for f in $(echo "$FILES" | tr ' ' '\n' | grep -E '^data/.*\.json$'); do
  [ -r "$f" ] || continue

  # GRS absolute block
  if grep -iE '"(ch|source|citation|ref)"[[:space:]]*:[[:space:]]*"[^"]*\bGRS\b' "$f" >/dev/null 2>&1; then
    echo "❌ GRS reference present in $f. 2026 syllabus excludes GRS."
    BLOCK=1
  fi

  # Excluded Hazzard chapter warning
  if grep -iE '"ch"[[:space:]]*:[[:space:]]*"[^"]*Hazzard[^"]*(Ch|Chapter)?[[:space:]]*(2|3|4|5|6|34|62)\b' "$f" >/dev/null 2>&1; then
    echo "⚠️  $f: citation to a potentially excluded Hazzard chapter (2-6, 34, 62 are not on the 2026 syllabus)."
    echo "   Verify the chapter is on the allowed list or recategorize."
  fi
done

# Rule 3: schema reminders for questions.json
if echo "$FILES" | grep -q 'data/questions\.json'; then
  echo "ℹ️  questions.json schema: q (string), o (array of 4), c (0..3), t (STRING year), ti (0..39). No id/explanation fields."
fi

# Rule 4: schema reminders for notes.json
if echo "$FILES" | grep -q 'data/notes\.json'; then
  echo "ℹ️  notes.json: exactly 40 items, id 0..39, topic (string), ch (Hazzard/Harrison/Article), notes (prose)."
fi

# Rule 5: lockfile edits
if echo "$FILES" | grep -qE 'package-lock\.json|yarn\.lock'; then
  echo "⚠️  Editing lock file directly — prefer \`npm install <pkg>\`."
fi

[ "$BLOCK" = "1" ] && exit 2
exit 0
