/* Checks the ledger's own claims, because "append-only" asserted in a comment is not a property.

   node ledger-check.mjs            — check the working copy against HEAD
   node ledger-check.mjs <base-ref> — check it against another ref

   Three things are verified:
     1. Every line parses. A ledger you cannot parse is a ledger you cannot trust, and a silently
        skipped bad line hides exactly the corruption worth knowing about.
     2. Line 1 is the charter, verbatim. If the charter drifts, every reading of the file after
        that point is a reading of something else.
     3. Nothing already committed was rewritten. Every line present in the base must still be
        present, byte for byte, in the same position.

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

/* 3. append-only against the base. A ledger that does not yet exist in the base is a first
      commit, not a rewrite — that case passes and says so, rather than being scored as clean. */
let baseText = null;
try{
  baseText = execFileSync('git', ['show', BASE + ':stage-a/build/ledger.jsonl'],
    /* stderr is piped rather than inherited: git prints "fatal: path ... exists on disk, but not
       in HEAD" for the first-commit case, which is the expected branch below, not a problem —
       letting it through prints an alarming line above a PASS. */
    { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}catch(e){ baseText = null; }

if(baseText === null){
  pass('no ledger at ' + BASE + ' — first commit of the file, nothing to rewrite');
}else{
  const v = appendOnlySince(baseText, fs.readFileSync(LEDGER, 'utf8'));
  if(!v.ok) fail('history was rewritten since ' + BASE + ': ' + v.reason +
    (v.was ? '\n      was: ' + v.was.slice(0, 120) + '\n      now: ' + v.now.slice(0, 120) : ''));
  else pass('append-only since ' + BASE + ' (+' + v.added + ' line' + (v.added === 1 ? '' : 's') + ')');
}

console.log(bad ? '\nFAIL: ' + bad + ' problem(s)' : '\nledger ok');
process.exit(bad ? 1 : 0);
