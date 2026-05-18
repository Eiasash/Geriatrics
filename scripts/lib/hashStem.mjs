// Stem hash + normalization — SINGLE SOURCE OF TRUTH.
// scripts/chaos-doctor-bot-v4.mjs (runtime) and the offline audit-8 join
// (scripts/build_stemhash_index.mjs, supplied as a Phase-2 input) both
// import this. Do NOT inline a second copy of djb2 — two copies drift
// silently and break the stemHash join the AUDIT8 representativeness run
// depends on (docs/AUDIT8_PRESTEP_INSTRUMENT_GATE.md).
//
// Why normStem: the bot hashes a DOM-scraped stem (extractQuestion ->
// `.heb` innerText, which collapses whitespace and drops markup); the
// offline index hashes the dataset `q` string. A raw djb2 of the two
// will NOT match, so both sides hash a NORMALIZED stem. Whitespace
// collapse only for now; if the PRE-STEP / bounded-run join match-rate
// is low, strengthen this (e.g. strip markdown) and rebuild the index —
// never weaken the gate.

export function normStem(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

// djb2 — deterministic across workers, no crypto cost. Returns a string
// so it round-trips through JSON ledgers without precision loss.
export function hashStem(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}
