// Audit-6 Option-0 (2026-05-18) — judge parse-failure bucketing RULE.
//
// THE rule, in one place (single source of truth; pinned by
// tests/chaosBotV4BucketRule.test.js). It was re-derived/corrected
// TWICE in review — the correction that matters:
//
//   TRUNCATION is a property of stop_reason, FULL STOP.
//   first_stop_reason === 'max_tokens'  <=> length-cut, for ANY branch.
//   The extractJson null-branch is NEVER a standalone truncation signal
//   (a model can finish naturally — end_turn — and still emit an
//   unmatched '{' => 'unbalanced'; that is malformed/prose, not a cut,
//   and a max_tokens bump won't touch it). Counting (end_turn,
//   unbalanced) as truncation inflates the exact number that decides
//   whether the cross-repo Toranot proxy gets touched.
//
// So: bucket on stop_reason first; branch only refines the
// NOT-max_tokens rows. Only 'genuine_prose' is a structured-output /
// Toranot conversation; 'truncation' and 'wrong_shape' are cheap
// zero-Toranot Geri-side fixes; 'ambiguous' (the two non-no_brace
// not-max_tokens cells) needs the bounded-sample raw-text eyeball.

export const EYEBALL_CATEGORY = 'ambiguous';

export const FIX_ROUTING = {
  truncation:
    "(a) length-cut. Fix: Geri-side judge max_tokens bump / verdict-schema trim. ZERO Toranot.",
  genuine_prose:
    '(b) model emitted prose, no JSON. The ONLY structured-output / Toranot conversation (then option 2 only — option 3 strictly dominated).',
  wrong_shape:
    'parseable JSON but failed validateJudgeShape (string-bool / missing-key). Fix: Geri-side prompt/schema. ZERO Toranot.',
  ambiguous:
    'malformed-JSON vs prose-with-incidental-braces — undecidable from (stop_reason,branch) alone. Resolve by bounded-sample raw-text eyeball of THIS bucket only.',
  empty:
    'no text at all — degenerate / throw-adjacent. Inspect the callClaude path, not the judge contract.',
  unknown:
    'pre-instrument or unrecognized row — predates (first_stop_reason, first_branch); not bucketable.',
};

// Pure. Input: one ai-parse-error/context=judge log entry (or just its
// {first_stop_reason, first_branch}). Output: a fix-routing category.
export function bucketJudgeFailure(entry) {
  const sr = entry && entry.first_stop_reason;
  const br = entry && entry.first_branch;
  if (sr === 'max_tokens') return 'truncation'; // any branch — stop_reason is the cut signal
  switch (br) {
    case 'no_brace': return 'genuine_prose';
    case 'parsed': return 'wrong_shape';
    case 'unbalanced': return 'ambiguous';
    case 'parse_threw': return 'ambiguous';
    case 'empty': return 'empty';
    default: return 'unknown';
  }
}

const ZERO = () => ({
  truncation: 0, genuine_prose: 0, wrong_shape: 0,
  ambiguous: 0, empty: 0, unknown: 0,
});

// rows: array of parsed JSONL ledger entries (bot's log.bugs). Filters to
// the judge parse-failure channel and applies the rule.
export function summarizeLedger(rows) {
  const counts = ZERO();
  const grid = {}; // `${stop_reason}|${branch}` -> n (operator convenience)
  let total = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.type !== 'ai-parse-error' || r.context !== 'judge') continue;
    total += 1;
    counts[bucketJudgeFailure(r)] += 1;
    const key = `${r.first_stop_reason ?? 'null'}|${r.first_branch ?? 'null'}`;
    grid[key] = (grid[key] || 0) + 1;
  }
  return {
    total,
    counts,
    grid,
    eyeball_total: counts[EYEBALL_CATEGORY],
    fix_routing: FIX_ROUTING,
  };
}
