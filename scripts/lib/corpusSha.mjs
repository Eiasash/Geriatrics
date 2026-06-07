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
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function corpusCanonicalShaFromString(content) {
  return createHash('sha256').update(JSON.stringify(JSON.parse(content))).digest('hex');
}

export function corpusCanonicalSha(questionsPath) {
  return corpusCanonicalShaFromString(readFileSync(questionsPath, 'utf-8'));
}

// Record the DEPLOYED corpus fingerprint into `reportDir/corpus_sha256.txt` so the
// analyzer can verify corpus identity before trusting a captured data-qidx.
//
// CERT §CERT P5 (Codex P1 #342, 3rd round — "stale corpus hash reuse"): the stale
// token is cleared BEFORE the (re)write attempt. So a fetch/hash/write failure
// leaves NO token behind → the analyzer sees no record → recordedSha=null →
// fail-CLOSED (bucket join). Without this clear, a prior run's hash in a reused
// dir could match the local analysis corpus and falsely set qIdxTrusted=true while
// this run captured qIdx against a now-drifted deployed corpus. Both the clear and
// the write fail OPEN (returns null, never throws) so a transient fetch hiccup
// cannot abort a long run — the only consequence is fail-closed qIdx at analysis.
// `opts.fetchImpl` is injectable for tests; defaults to global fetch.
export async function recordDeployedCorpusSha(reportDir, corpusUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const shaPath = join(reportDir, 'corpus_sha256.txt');
  await rm(shaPath, { force: true }).catch(() => {}); // clear any stale trust token first
  try {
    const body = await (await fetchImpl(corpusUrl)).text();
    const sha = corpusCanonicalShaFromString(body);
    await writeFile(shaPath, sha);
    return sha;
  } catch {
    return null;
  }
}
