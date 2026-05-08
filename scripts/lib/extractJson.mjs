// Brace-balanced JSON extractor used by chaos-doctor-bot v4.
// Replaces v3's `match(/\{[^{}]*\}/)` which rejected nested objects and
// failed on multi-line / markdown-fenced model output (caused 352
// ai-parse-error events in v3 workers 1, 8, 10).
//
// Standalone module so unit tests don't pull in the bot's playwright dep.

export function extractJson(text) {
  if (!text) return null;
  let s = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(s); } catch (_) { /* fall */ }
  const start = s.indexOf('{');
  if (start === -1) return null;
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
        try { return JSON.parse(candidate); } catch (_) { return null; }
      }
    }
  }
  return null;
}
