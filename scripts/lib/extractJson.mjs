// Brace-balanced JSON extractor used by chaos-doctor-bot v4.
// Replaces v3's `match(/\{[^{}]*\}/)` which rejected nested objects and
// failed on multi-line / markdown-fenced model output (caused 352
// ai-parse-error events in v3 workers 1, 8, 10).
//
// Standalone module so unit tests don't pull in the bot's playwright dep.
//
// Audit-6 Option-0 (2026-05-18): the scan is factored into `_scan`, which
// returns BOTH the parsed value AND which branch produced it. `extractJson`
// is preserved as a thin `_scan(t).value` wrapper — its return value is
// byte-identical for every input (the audit-5 floor; do not change it).
// `classifyExtractFailure` exposes `_scan(t).branch` so the next bounded
// chaos run can bucket judge JSON-parse failures into the ternary the
// audit-6 STEP-0 doc requires — WITHOUT a duplicated parser (DRY /
// grep-existing-utility) and WITHOUT raw-text retention. Branches:
//   'parsed'      extractJson returned a value (whole-string OR recovered
//                 candidate parsed) — not a failure
//   'empty'       no text at all
//   'no_brace'    text present, no '{'              -> (b) genuine prose
//   'unbalanced'  '{' opened, never balanced/closed -> (a) truncated
//   'parse_threw' balanced candidate, JSON.parse threw -> (c) malformed-
//                 but-complete (AND the ambiguous bucket: prose with an
//                 incidental balanced '{...}' also lands here — resolved
//                 by the bounded-sample raw-text eyeball, audit-6 doc)

function _scan(text) {
  if (!text) return { value: null, branch: 'empty' };
  let s = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return { value: JSON.parse(s), branch: 'parsed' }; } catch (_) { /* fall */ }
  const start = s.indexOf('{');
  if (start === -1) return { value: null, branch: 'no_brace' };
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        try { return { value: JSON.parse(candidate), branch: 'parsed' }; }
        catch (_) { return { value: null, branch: 'parse_threw' }; }
      }
    }
  }
  return { value: null, branch: 'unbalanced' };
}

export function extractJson(text) {
  return _scan(text).value;
}

// Audit-6 Option-0 diagnostic. Returns which `_scan` branch fired:
// 'parsed' | 'empty' | 'no_brace' | 'unbalanced' | 'parse_threw'.
// Pure, no side effects, zero raw-text retention.
export function classifyExtractFailure(text) {
  return _scan(text).branch;
}
