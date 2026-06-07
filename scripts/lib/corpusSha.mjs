// Audit-8 CERT §CERT P5 — shared canonical corpus fingerprint.
//
// SINGLE SOURCE OF TRUTH for the bot writer (records the DEPLOYED corpus hash
// into the run dir) and the analyzer reader (recomputes it for the indexed
// corpus and trusts a captured data-qidx ONLY when they match). Parse +
// re-serialize so the hash is invariant to formatting / CRLF-vs-LF (Windows
// working tree) / indentation and depends ONLY on the question objects and
// their ORDER — which is exactly what member-level qIdx recovery requires
// (a reordered byte-identical-stem dup group changes the hash → qIdx voided).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function corpusCanonicalShaFromString(content) {
  return createHash('sha256').update(JSON.stringify(JSON.parse(content))).digest('hex');
}

export function corpusCanonicalSha(questionsPath) {
  return corpusCanonicalShaFromString(readFileSync(questionsPath, 'utf-8'));
}
