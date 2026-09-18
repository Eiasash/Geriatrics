/* The defect ledger — append-only record of what the guards did, and of every defect found by
   any means, guard or otherwise.

   Read the charter on the first line of ledger.jsonl before drawing any conclusion from it. The
   short version: this file can tell you what the guards CAUGHT and what they MISSED among the
   defects somebody found. It cannot tell you how much is still out there, because nobody knows
   the size of that set. Counting hits against an unbounded denominator produces a ratio that
   looks like a rate and is not one.

   Two kinds of line, both objects, one per line, never rewritten:

     {"type":"run",    ...}  one per invocation of a guard
     {"type":"defect", ...}  one per defect, however it was found

   A defect line is written when the defect is IDENTIFIED, not when it is fixed, and it records
   whether the guard that should have caught it did. That "no" is the load-bearing field: a
   ledger that only recorded guard hits would show a perfect record for a suite that never
   fired.

   GUARD_STATE is an inert token, bumped by hand when the guard configuration changes in a way
   that makes earlier verdicts non-comparable. It is never derived from file contents, a hash or
   a date, because a derived value silently changes the meaning of past lines. */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

export const GUARD_STATE = 'gs-001';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LEDGER = path.join(HERE, 'ledger.jsonl');

/* verbatim, and load-bearing: it is the reason this file is evidence about the guards and not
   evidence about the app */
export const CHARTER =
  'this log establishes sensitivity and incorporation bias on the defects it captures; ' +
  'it cannot establish specificity or negative predictive value, because the true defect ' +
  'population is unbounded.';

/* The commit a verdict was produced from. A verdict with no commit is not a verdict about
   anything — "the suite passed" is meaningless without saying passed on what. Read from git
   rather than passed in, so it cannot drift from the tree that was actually tested; a dirty
   tree is reported as such rather than silently attributed to the last commit. */
export function commitPin(){
  const git = args => {
    /* stderr piped, not inherited: outside a git checkout rev-parse prints a fatal line, which is
       the case handled below rather than a failure worth shouting about. */
    try{ return execFileSync('git', args,
      { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
    catch(e){ return null; }
  };
  const sha = git(['rev-parse', 'HEAD']);
  if(sha === null) return { sha: null, dirty: null, note: 'not a git checkout' };
  /* Only the console and its guards matter here. A dirty tree is reported, never folded into
     the sha: "passed at 522d4cf" about a tree that is not 522d4cf is the exact claim this
     field exists to stop. */
  const status = git(['status', '--porcelain', '--', path.join(HERE, '..')]);
  return { sha, dirty: status === null ? null : status !== '' };
}

/* Append one line. Never rewrites, never reorders, never deletes. The caller decides what the
   line says; this only guarantees it lands whole and last. */
export function append(entry){
  const line = JSON.stringify(Object.assign({ ts: new Date().toISOString(), guard_state: GUARD_STATE }, entry));
  fs.appendFileSync(LEDGER, line + '\n', 'utf8');
  return line;
}

/* One line per guard run.

   Gated on STAGEA_LEDGER because of a property of the format rather than a preference: an
   append-only JSONL that every local iteration writes to is a file where every branch adds lines
   at the same place, so every PR conflicts with every other PR at the last line. A ledger nobody
   can merge stops being a record. CI sets STAGEA_LEDGER=1, so the committed ledger holds the
   verdicts anyone actually relies on; a developer who wants a local line sets it too.

   THIS IS A NARROWING OF "one line per guard run" AND IT IS EIAS'S CALL TO REVERSE. Flip the
   default here and every local run is recorded, at the cost above.

   A guard must never fail because the ledger failed: logging is wrapped, and a write error is
   printed rather than thrown. The verdict is the guard's, not the bookkeeping's. */
export function logRun(guard, fields){
  if(!process.env.STAGEA_LEDGER) return null;
  try{
    const pin = commitPin();
    return append(Object.assign({ type: 'run', guard, commit: pin.sha, tree_dirty: pin.dirty }, fields));
  }catch(e){
    console.log('ledger: could not record this run — ' + e.message);
    return null;
  }
}

/* Read the ledger as objects. A malformed line is surfaced, not skipped: a ledger you cannot
   parse is a ledger you cannot trust, and quietly dropping the bad line hides exactly the
   corruption worth knowing about. */
export function read(file = LEDGER){
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = raw.split('\n').filter(l => l.trim() !== '');
  return lines.map((l, i) => {
    try{ return { ok: true, n: i + 1, entry: JSON.parse(l) }; }
    catch(e){ return { ok: false, n: i + 1, raw: l, error: e.message }; }
  });
}

/* Append-only is a claim, so it gets checked rather than asserted. Every line that existed in
   `before` must still be present, byte for byte, in the same position. Anything else — an edit,
   a reorder, a deletion, a truncation — is a rewritten history and is reported with the first
   line at which the two diverge. */
export function appendOnlySince(beforeText, afterText){
  const a = beforeText.split('\n').filter(l => l.trim() !== '');
  const b = afterText.split('\n').filter(l => l.trim() !== '');
  if(b.length < a.length) return { ok: false, reason: 'shorter: ' + a.length + ' lines became ' + b.length };
  for(let i = 0; i < a.length; i++){
    if(a[i] !== b[i]) return { ok: false, reason: 'line ' + (i + 1) + ' was rewritten', was: a[i], now: b[i] };
  }
  return { ok: true, added: b.length - a.length };
}
