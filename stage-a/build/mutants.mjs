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

  /* --- second set: the areas the first ten left unprotected --- */
  ['consolidation week latches onto week 16 again',
   "if(!cw) return consolidationWeek();",
   "if(!cw) return ALLW[ALLW.length-1];",
   'not week 16 again'],

  ['abbreviation in the pop-out stops closing the dialog',
   "const inModal = a.closest('#tblModal');",
   "const inModal = false;",
   'finds its footnote and closes'],

  ['all-wrong small samples hidden again',
   "const weakEnough = t => (t.n >= 4 && (t.n - t.w) / t.n < 0.65) || (t.n >= 2 && t.w === t.n);",
   "const weakEnough = t => (t.n >= 4 && (t.n - t.w) / t.n < 0.65);",
   'every one wrong flags'],

  ['jump loses the chapterless third of the bank',
   "const tsec = p.ch ? sectionForChapter(p.ch) : (PQSEC[p.bk] || '');",
   "const tsec = p.ch ? sectionForChapter(p.ch) : '';",
   'third of the bank'],

  ['pre-paint script accepts any text size',
   "if(['s','m','l','xl'].indexOf(v.fs) >= 0) document.body.classList.add('fs-' + v.fs);",
   "if(v.fs) document.body.classList.add('fs-' + v.fs);",
   'only accepts a size it knows'],

  ['mock draws answered questions as unseen',
   "const fresh = pool.filter(p=>pqDone[pqKey(p)] === undefined);",
   "const fresh = pool;",
   'unseen-only draw really excludes'],

  ['mock stops saving as it goes',
   "  mockSaveRun();",
   "  /* mockSaveRun(); */",
   'saved as you go'],

  ['mock loses its source weighting',
   "const want = Math.round(share / 100 * n);",
   "const want = n;",
   'weighted to the source mix'],

  ['table pop-out swallows abbreviation taps again',
   "if(t.closest('mark.hl, abbr.abbr')) return;",
   "if(t.closest('mark.hl')) return;",
   'ignores highlights and abbreviations'],

  ['a card tag runs past the end of the deck',
   "tagR(231,232,'hf');",
   "tagR(231,236,'hf');",
   'every flashcard carries a tag'],
];

/* Baseline first: a mutation "caught" by a suite that was already red proves nothing. */
{
  let out = '';
  try{ out = execFileSync('node', ['test.mjs', SRC], {encoding:'utf8'}); }
  catch(e){ out = (e.stdout || '') + (e.stderr || ''); }
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
  if(fails.length || !/DONE/.test(out)){
    console.log('BASELINE IS NOT GREEN — nothing below can be trusted');
    fails.forEach(f => console.log('   ' + f));
    process.exit(1);
  }
  console.log('baseline green: ' + out.split('\n').filter(l => l.startsWith('PASS')).length + ' checks\n');
}

/* Baseline first: a mutation "caught" by a suite that was already red proves nothing. */
{
  let out = '';
  try{ out = execFileSync('node', ['test.mjs', SRC], {encoding:'utf8'}); }
  catch(e){ out = (e.stdout || '') + (e.stderr || ''); }
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
  if(fails.length || !/DONE/.test(out)){
    console.log('BASELINE IS NOT GREEN — nothing below can be trusted');
    fails.forEach(f => console.log('   ' + f));
    process.exit(1);
  }
  console.log('baseline green: ' + out.split('\n').filter(l => l.startsWith('PASS')).length + ' checks\n');
}

/* Baseline first: a mutation "caught" by a suite that was already red proves nothing. */
{
  let out = '';
  try{ out = execFileSync('node', ['test.mjs', SRC], {encoding:'utf8'}); }
  catch(e){ out = (e.stdout || '') + (e.stderr || ''); }
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
  if(fails.length || !/DONE/.test(out)){
    console.log('BASELINE IS NOT GREEN — nothing below means anything');
    fails.forEach(f => console.log('   ' + f));
    process.exit(1);
  }
  console.log('baseline green: ' + out.split('\n').filter(l => l.startsWith('PASS')).length + ' checks\n');
}

/* Baseline first: a mutation "caught" by a suite that was already red proves nothing. */
{
  let out=''; try{ out = execFileSync('node', ['test.mjs', SRC], {encoding:'utf8'}); }
  catch(e){ out = (e.stdout||'') + (e.stderr||''); }
  const fails = out.split('\n').filter(l=>l.startsWith('FAIL'));
  if(fails.length || !/DONE/.test(out)){
    console.log('BASELINE IS NOT GREEN — fix the suite before trusting anything below');
    fails.forEach(f=>console.log('   '+f));
    process.exit(1);
  }
  console.log('baseline green: ' + out.split('\n').filter(l=>l.startsWith('PASS')).length + ' checks\n');
}

let bad = 0;
for(const [name, from, to, needle] of M){
  const hits = src.split(from).length - 1;
  if(hits === 0){
    console.log('STALE  ' + name + '  — the code it mutates has moved; update this mutation');
    bad++; continue;
  }
  if(hits > 1){
    /* replace() takes the first occurrence only: with two, the mutation may land on dead
       text and leave the live code intact, which reports a blind suite that is not blind */
    console.log('AMBIG  ' + name + '  — target appears ' + hits + ' times; make it unique');
    bad++; continue;
  }
  fs.writeFileSync(TMP, src.replace(from, to));
  let out = '';
  try{ out = execFileSync('node', ['test.mjs', TMP], {encoding:'utf8'}); }
  catch(e){ out = (e.stdout || '') + (e.stderr || ''); }
  const lines = out.split('\n');
  const caught = lines.some(l => l.startsWith('FAIL') && l.includes(needle));
  const passes = lines.filter(l => l.startsWith('PASS')).length;
  if(caught && passes < 50){
    /* the file stopped parsing, so everything failed. That is not the guard biting. */
    console.log('BROKE  ' + name + '  — mutation broke the parse (' + passes + ' passed); it proves nothing');
    bad++; continue;
  }
  console.log((caught ? 'CAUGHT ' : 'MISSED ') + name);
  if(!caught) bad++;
}
fs.existsSync(TMP) && fs.unlinkSync(TMP);
console.log('\n' + (M.length - bad) + ' of ' + M.length + ' mutations caught');
process.exit(bad ? 1 : 0);
