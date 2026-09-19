/* Checks the ledger's own claims, because "append-only" asserted in a comment is not a property.

   node ledger-check.mjs            — check the working copy against HEAD
   node ledger-check.mjs <base-ref> — check it against another ref

   Four things are verified:
     1. Every line parses. A ledger you cannot parse is a ledger you cannot trust, and a silently
        skipped bad line hides exactly the corruption worth knowing about.
     2. Line 1 is the charter, verbatim. If the charter drifts, every reading of the file after
        that point is a reading of something else.
     3. Every 'run' entry carries a real commit pin. ledger.mjs's own comment says it plainly —
        "a verdict with no commit is not a verdict about anything" — but nothing enforced it: a
        checkout without git available makes commitPin() return {sha: null, ...}, logRun writes
        that null straight into the entry, and this file used to never look. A 'run' line with
        commit: null or no commit field at all reads as if it belongs to SOME commit; it does
        not, and pretending otherwise is exactly the ambiguity the field exists to close.
     4. Nothing already committed was rewritten. Every line present in the base must still be
        present, byte for byte, in the same position. A git failure that is NOT "the file didn't
        exist at that ref yet" (git not installed, a bad ref, a permissions problem) is reported
        as a failure of this check, not silently folded into the same "first commit" pass the
        genuine case gets — those are different claims and used to be indistinguishable here.

   Exits non-zero on any of them. */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { read, appendOnlySince, CHARTER, LEDGER } from './ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'HEAD';
let bad = 0;
const fail = m => { bad++; console.log('FAIL  ' + m); };
const pass = m => console.log('PASS  ' + m);

if(!fs.existsSync(LEDGER)){ console.log('FAIL  no ledger at ' + LEDGER); process.exit(1); }

/* 1. parses */
const rows = read();
const malformed = rows.filter(r => !r.ok);
if(malformed.length) malformed.forEach(r => fail('line ' + r.n + ' does not parse: ' + r.error));
else pass('every line parses (' + rows.length + ')');

/* 2. the charter is line 1 and is verbatim */
const first = rows[0];
if(!first || !first.ok || first.entry.type !== 'charter') fail('line 1 is not a charter entry');
else if(first.entry.charter !== CHARTER) fail('the charter text has drifted from ledger.mjs CHARTER');
else pass('line 1 carries the charter, verbatim');

/* 3. every 'run' entry carries a real commit pin — see the file header. A missing entry (older
      lines predating this check, or a future direct append() that forgot the field) reads the
      same as an explicit null for this purpose: either way there is no commit to trust the
      verdict against. */
const runsWithNoCommit = rows.filter(r => r.ok && r.entry.type === 'run' &&
  (r.entry.commit === null || r.entry.commit === undefined));
if(runsWithNoCommit.length) runsWithNoCommit.forEach(r => fail('line ' + r.n +
  ' is a run entry with no commit pin (guard: ' + (r.entry.guard || '?') + ') — not a verdict about anything'));
else pass('every run entry carries a commit pin (' + rows.filter(r => r.ok && r.entry.type === 'run').length + ' checked)');

/* 4. append-only against the base. A ledger that does not yet exist in the base is a first
      commit, not a rewrite — that case passes and says so, rather than being scored as clean.
      Distinguished from every OTHER way `git show` can fail (git missing, a bad ref, a
      permissions problem): those are failures of this check, not silently folded into the
      same "nothing to rewrite" pass the genuine first-commit case gets. */
let baseText = null, baseLookupFailed = false, baseLookupError = '';
try{
  baseText = execFileSync('git', ['show', BASE + ':stage-a/build/ledger.jsonl'],
    /* stderr is piped rather than inherited: git prints "fatal: path ... exists on disk, but not
       in HEAD" for the first-commit case, which is the expected branch below, not a problem —
       letting it through prints an alarming line above a PASS. */
    { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}catch(e){
  const stderr = (e.stderr || '').toString();
  /* the one error shape that legitimately means "first commit of the file" — the path is not
     an error in the base tree, it simply was not there yet. Anything else (unknown revision,
     git not on PATH, a permissions problem, a corrupt repo) is a failure of the check itself,
     not evidence the ledger is clean. */
  if(/exists on disk, but not in/.test(stderr) || /does not exist in/.test(stderr)){
    baseText = null;
  }else{
    baseLookupFailed = true;
    baseLookupError = stderr.trim() || e.message || 'unknown git failure';
  }
}

if(baseLookupFailed){
  fail('could not determine whether the ledger existed at ' + BASE + ': ' + baseLookupError.split('\n')[0] +
    ' — this is NOT the same as "first commit"; the check could not run, so nothing below is verified');
}else if(baseText === null){
  pass('no ledger at ' + BASE + ' — first commit of the file, nothing to rewrite');
}else{
  const v = appendOnlySince(baseText, fs.readFileSync(LEDGER, 'utf8'));
  if(!v.ok) fail('history was rewritten since ' + BASE + ': ' + v.reason +
    (v.was ? '\n      was: ' + v.was.slice(0, 120) + '\n      now: ' + v.now.slice(0, 120) : ''));
  else pass('append-only since ' + BASE + ' (+' + v.added + ' line' + (v.added === 1 ? '' : 's') + ')');
}

console.log(bad ? '\nFAIL: ' + bad + ' problem(s)' : '\nledger ok');
process.exit(bad ? 1 : 0);
