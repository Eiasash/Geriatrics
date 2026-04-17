#!/usr/bin/env bash
# PostToolUse hook: validate data/*.json edits against the ACTUAL schema
# (q, o, c, t, ti for questions; id/topic/ch/notes for notes; name/heb/acb/beers for drugs).
# Non-blocking: reports issues, lets the user decide.

set -u
FILES="${CLAUDE_FILE_PATHS:-}"
[ -z "$FILES" ] && exit 0

if ! echo "$FILES" | grep -qE '(^|[[:space:]])data/[^[:space:]]+\.json'; then
  exit 0
fi

echo "🔍 data/*.json edited — running schema checks…"

# 1. JSON parse gate
for f in $(echo "$FILES" | tr ' ' '\n' | grep -E '^data/.*\.json$'); do
  if ! node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null; then
    echo "❌ Invalid JSON: $f"
    exit 2
  fi
done

# 2. questions.json schema check: q, o (len 4), c (0..3), t (string), ti (0..39)
if echo "$FILES" | grep -q 'data/questions\.json'; then
  node -e "
    const arr = JSON.parse(require('fs').readFileSync('data/questions.json','utf8'));
    let bad = { missing_q: 0, wrong_o_len: 0, bad_c: 0, bad_t_type: 0, bad_ti: 0 };
    for (const [i, it] of arr.entries()) {
      if (!it.q || typeof it.q !== 'string') bad.missing_q++;
      if (!Array.isArray(it.o) || it.o.length !== 4) bad.wrong_o_len++;
      if (typeof it.c !== 'number' || it.c < 0 || it.c > 3) bad.bad_c++;
      if (typeof it.t !== 'string') bad.bad_t_type++;
      if (typeof it.ti !== 'number' || it.ti < 0 || it.ti > 39) bad.bad_ti++;
    }
    const problems = Object.entries(bad).filter(([,n]) => n > 0);
    if (problems.length) {
      console.log('⚠️  questions.json schema drift:');
      for (const [k,n] of problems) console.log('   ' + k + ': ' + n);
    } else {
      console.log('✓ questions.json schema clean (' + arr.length + ' items)');
    }
  " 2>/dev/null || echo '⚠️  questions.json: could not validate'
fi

# 3. notes.json schema check: id (0..39), topic (string), ch (string), notes (string)
if echo "$FILES" | grep -q 'data/notes\.json'; then
  node -e "
    const arr = JSON.parse(require('fs').readFileSync('data/notes.json','utf8'));
    let bad = { bad_id: 0, missing_topic: 0, missing_ch: 0, missing_notes: 0, grs_hits: 0 };
    const ids = new Set();
    for (const it of arr) {
      if (typeof it.id !== 'number' || it.id < 0 || it.id > 39) bad.bad_id++;
      else ids.add(it.id);
      if (!it.topic || typeof it.topic !== 'string') bad.missing_topic++;
      if (!it.ch || typeof it.ch !== 'string') bad.missing_ch++;
      if (!it.notes || typeof it.notes !== 'string') bad.missing_notes++;
      if ((it.ch && /\\bGRS\\b|Geriatric Review Syllabus/i.test(it.ch)) ||
          (it.notes && /\\bGRS\\b|Geriatric Review Syllabus/i.test(it.notes))) bad.grs_hits++;
    }
    const problems = Object.entries(bad).filter(([,n]) => n > 0);
    if (problems.length) {
      console.log('⚠️  notes.json issues:');
      for (const [k,n] of problems) console.log('   ' + k + ': ' + n);
    }
    if (ids.size !== 40) console.log('⚠️  notes.json: expected 40 unique topic IDs, got ' + ids.size);
    if (!problems.length && ids.size === 40) console.log('✓ notes.json schema clean (40 topics)');
  " 2>/dev/null || echo '⚠️  notes.json: could not validate'
fi

# 4. drugs.json schema check: name, heb, acb (0..3), beers (boolean), cat, risk
if echo "$FILES" | grep -q 'data/drugs\.json'; then
  node -e "
    const arr = JSON.parse(require('fs').readFileSync('data/drugs.json','utf8'));
    let bad = { missing_name: 0, bad_acb: 0, bad_beers: 0, missing_cat: 0 };
    for (const it of arr) {
      if (!it.name) bad.missing_name++;
      if (typeof it.acb !== 'number' || it.acb < 0 || it.acb > 3) bad.bad_acb++;
      if (typeof it.beers !== 'boolean') bad.bad_beers++;
      if (!it.cat) bad.missing_cat++;
    }
    const problems = Object.entries(bad).filter(([,n]) => n > 0);
    if (problems.length) {
      console.log('⚠️  drugs.json schema drift:');
      for (const [k,n] of problems) console.log('   ' + k + ': ' + n);
    } else {
      console.log('✓ drugs.json schema clean (' + arr.length + ' drugs)');
    }
  " 2>/dev/null || echo '⚠️  drugs.json: could not validate'
fi

# 5. Run Vitest (short reporter)
if [ -d tests ] && command -v npx >/dev/null 2>&1; then
  npx vitest run --reporter=dot 2>&1 | tail -20 || true
fi

exit 0
