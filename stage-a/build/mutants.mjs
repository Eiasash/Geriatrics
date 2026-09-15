/* Ten mutations, each targeting a defect this project actually produced, each paired
   with the guard that must catch it.

   A green suite and a blind suite look identical. Three times in this cycle a guard
   passed against a file with the bug reinstated — because it matched a string that
   survived the break, or because the mutation crashed the page before the guard ran and
   the absence of a FAIL meant nothing. This runs the suite against each broken file and
   insists the named guard goes red.

   node mutants.mjs [path-to-index.html]
*/
import fs from 'fs';
import { execFileSync } from 'child_process';

const SRC = process.argv[2] || '../index.html';
const src = fs.readFileSync(SRC, 'utf8');
const TMP = '/tmp/mutant.html';

const M = [
  ['teardown write goes back through the async layer',
   "  const put = urgent ? (k,v)=>{ if(!writeNow(k,v)) window.storage.set(k,v); }\n                     : (k,v)=>window.storage.set(k,v);",
   "  const put = (k,v)=>window.storage.set(k,v);",
   'writes synchronously'],

  ['merge returns this tab and forgets the other',
   "  return out;\n}\n/* section notes: one string per section",
   "  return mine;\n}\n/* section notes: one string per section",
   'other tab\u2019s addition'],

  ['merge resurrects a deletion made here',
   "      else if(!nSet.has(h.id)) list.push(h);",
   "      else list.push(h);",
   'respects a deletion made here'],

  ['merge reverts the other tab\u2019s edit',
   "        list.push(changedHere ? mineH : h);",
   "        list.push(mineH);",
   'unless this tab changed it'],

  ['SEEN advances on a write that never landed',
   "      landed = !!(back && back.value === blob);",
   "      landed = true;",
   'SEEN where it was'],

  ['rollback claims a restoration it did not make',
   "          if(back && back.value === want) rolled++; else failed.push(j);",
   "          rolled++;",
   'verifies its own writes'],

  ['selection offset counted the old way',
   "    if(n === r.startContainer){ start += r.startOffset; break; }",
   "    if(n === r.startContainer){ start += 0; break; }",
   'mid-text-node'],

  ['neighbour window narrowed again',
   "      const gotB = hlNorm(full.slice(Math.max(0, x.at - WIDE), x.at));",
   "      const gotB = hlNorm(full.slice(Math.max(0, x.at - HLCTX), x.at));",
   'survives whitespace'],

  ['tie between two occurrences guessed rather than dropped',
   "    if(best.s >= 2 && (!runner || runner.s < best.s)) pick = best.x;",
   "    if(best.s >= 2) pick = best.x;",
   'drops the highlight rather than guessing'],

  ['refresh assigns over foreground work again',
   "        const merged = mergeHL(v, seen, HL);",
   "        const merged = v;",
   'MERGES the disk copy'],
];

let bad = 0;
for(const [name, from, to, needle] of M){
  if(src.indexOf(from) < 0){
    console.log('STALE  ' + name + '  — the code it mutates has moved; update this mutation');
    bad++; continue;
  }
  fs.writeFileSync(TMP, src.replace(from, to));
  let out = '';
  try{ out = execFileSync('node', ['test.mjs', TMP], {encoding:'utf8'}); }
  catch(e){ out = (e.stdout || '') + (e.stderr || ''); }
  const caught = out.split('\n').some(l => l.startsWith('FAIL') && l.includes(needle));
  console.log((caught ? 'CAUGHT ' : 'MISSED ') + name);
  if(!caught) bad++;
}
fs.existsSync(TMP) && fs.unlinkSync(TMP);
console.log('\n' + (M.length - bad) + ' of ' + M.length + ' mutations caught');
process.exit(bad ? 1 : 0);
