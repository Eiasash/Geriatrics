/* Mutations, each targeting a defect this project actually produced, each paired
   with the guard that must catch it. The suite runs with the page clock pinned (clock.mjs),
   so a result here does not depend on the day CI runs.

   A green suite and a blind suite look identical. Three times in this cycle a guard
   passed against a file with the bug reinstated — because it matched a string that
   survived the break, or because the mutation crashed the page before the guard ran and
   the absence of a FAIL meant nothing. This runs the suite against each broken file and
   insists the named guard goes red.

   node mutants.mjs [path-to-index.html]
*/
import fs from 'fs';
import { execFileSync } from 'child_process';

const SRC = process.argv.slice(2).find(a => !a.startsWith('--')) || '../index.html';
/* --static: only check that every mutation still has exactly one target. Seconds instead of
   minutes; run it before every commit — three pushes went red on a stale target */
const STATIC = process.argv.includes('--static');
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
   "sectionForChapter(p.ch) : '') : (PQSEC[p.bk] || '');",
   "sectionForChapter(p.ch) : '') : '';",
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

  ['the dashboard drill never finds the week\u2019s chapters',
   "  const hasChapters = VIEW && VIEW.items && VIEW.items.length;",
   "  const hasChapters = 0;",
   'still filters to the week when there are chapters'],

  ['the drill\u2019s week filter comes up empty',
   "  VIEW.items.forEach(x=>{ const c = chapInfo(x.t);",
   "  [].forEach(x=>{ const c = chapInfo(x.t);",
   'week-scoped drill has cards'],

  /* --- from the outside review, 15/09: fixes that had a guard but no mutation --- */
  ['backup misses a highlight queued on the save chain',
   "  try{ await saveChain; }catch(e){}",
   "  /* try{ await saveChain; }catch(e){} */",
   'waits for queued saves'],

  ['clearing the bookmark goes back to .delete, which the layer does not have',
   "    try{ window.storage.set(BMKEY, ''); }catch(e){}",
   "    try{ window.storage.delete(BMKEY); }catch(e){}",
   'layer has no delete'],

  ['restore leaves keys the backup does not carry',
   "    const val = (k in o) ? o[k] : '';",
   "    if(!(k in o)) continue; const val = o[k];",
   'clears the keys the backup does not carry'],

  ['teardown write fires even when the host supplies storage',
   "  if(!storageIsLocal) return false;",
   "  /* if(!storageIsLocal) return false; */",
   'stands down when the host supplies its own storage'],

  /* --- midnight rollover (TODAY conversion, 15/09) --- */
  ['rollover asks isCur after the date has already moved',
   "  const followed = VIEW === paintWeek;",
   "  const followed = isCur(VIEW);",
   'returning to the tab after Sunday midnight'],

  ['no date check when the tab is seen again',
   "document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkRollover(); });",
   "/* visibility hook removed */",
   'returning to the tab after Sunday midnight'],

  ['the timer stops checking the date',
   "  if(restoring) return;\n  checkRollover();\n",
   "  if(restoring) return;\n",
   'timer notices midnight'],

  ['a reading block past midnight credits the new day',
   "    const bd = T.d || today();",
   "    const bd = today();",
   'credited to the day it began'],

  /* only red in a timezone with daylight saving: CI runs in Asia/Jerusalem */
  ['countdown divides raw milliseconds again',
   "Math.round((exam - new Date().setHours(0,0,0,0))/86400000)",
   "Math.ceil((exam - new Date())/86400000)",
   'countdown counts calendar days'],

  ['a block finished yesterday carries over as already done',
   "    if(T.p >= PH.length){ T = {p:0, left:PH[0].s, run:false, ts:0, d:t}; tSave(); }",
   "    if(T.p >= PH.length){ T.d = t; tSave(); }",
   'finished yesterday starts fresh'],

  ['a paused block moves its credit to the new day',
   "    else if(!T.run && T.p === 0 && T.left === PH[0].s){ T.d = t; tSave(); }",
   "    else if(!T.run){ T.d = t; tSave(); }",
   'paused part-way across midnight'],

  ['midnight re-deals the drill round on screen',
   "  if(filter.mode === 'week' && !document.getElementById('drill').classList.contains('on'))",
   "  if(filter.mode === 'week')",
   'does not re-deal the drill round'],

  ['the drill\u2019s week toggle shows in the consolidation period again',
   "  const cwk = document.getElementById('cweek'); if(cwk) cwk.hidden = !w.items.length;",
   "  const cwk = document.getElementById('cweek');",
   'week toggle is hidden for a week with no chapters'],

  ['the bookmark is stamped in UTC again',
   "  BM = {sec: sec.id, t, i, d: nowStamp()};",
   "  BM = {sec: sec.id, t, i, d: new Date().toISOString().slice(0,16).replace('T',' ')};",
   'stamps are local time'],

  ['the midnight check writes during a restore',
   "  if(restoring) return false;\n  const t = today();",
   "  const t = today();",
   'while a restore runs'],

  ['the timer advances during a restore',
   "function tick(){\n  if(restoring) return;\n",
   "function tick(){\n",
   'while a restore runs'],

  ['undo clears its copy and reloads even when writes failed',
   "  if(!await bkApply(v, false, true)) return;",
   "  await bkApply(v, false, true);",
   'keeps the undo copy for another try'],

  ['the issue link carries the whole note again',
   "    if(encodeURIComponent(body).length > LINKMAX){",
   "    if(false){",
   'issue link fits'],

  ['a stale error is reported without its time',
   "window.addEventListener('unhandledrejection', e=>{ lastErr = '[' + nowStamp() + '] promise: ' +",
   "window.addEventListener('unhandledrejection', e=>{ lastErr = 'promise: ' +",
   'carries the time it happened'],

  ['the week scope matches earlier-edition chapter numbers again',
   "    if(chs.size) p = p.filter(x=>x.ch && chs.has(x.ch) && OLDED.indexOf(x.y) < 0);",
   "    if(chs.size) p = p.filter(x=>x.ch && chs.has(x.ch));",
   'never serves earlier-edition questions'],

  ['a single-chapter hold is not understood by the filter',
   "    const chs = /^ch:\\d+$/.test(pqChap) ? [+pqChap.slice(3)] : secChapters(pqChap);",
   "    const chs = secChapters(pqChap);",
   'single weak chapter holds'],

  ['an earlier-edition question jumps to a section by its old chapter number',
   "  const tsec = p.ch ? (OLDED.indexOf(p.y) < 0 ? sectionForChapter(p.ch) : '') : (PQSEC[p.bk] || '');",
   "  const tsec = p.ch ? sectionForChapter(p.ch) : (PQSEC[p.bk] || '');",
   'no jump to an 8th-edition section'],

  /* --- render-check round, 16/09 --- */
  ["a search hit restores the old scroll over the match",
   "    skipRestore = true;\n    show(x.sec);",
   "    show(x.sec);",
   "lands on the match"],

  ["the next drill card opens above the view",
   "  if(card.getBoundingClientRect().top < 0) seeEl(card);\n",
   "",
   "next card is brought into view"],

  ["a mock left part-way is discarded without asking",
   "  if(!mockOn && document.getElementById('mockResume') &&\n     !confirm('A mock you left part-way is still waiting. Start a new paper and discard it?')) return;\n",
   "",
   "asks before discarding"],

  ["blanks count as wrong in the chapter tally",
   "    if(r.p.ch && r.given){",
   "    if(r.p.ch){",
   "keeps blanks apart"],

  ["the source line is shown as extracted",
   "escHtml(srcSpaced(src))",
   "escHtml(src)",
   "spaces Hebrew and digits"],

  ["white text on bright accents in dark mode",
   "body.dark .secfoot button.mark.readon, body.dark .ch-actions summary.ebgo:hover{ color:var(--paper) !important }",
   "body.dark .secfoot button.mark.readon, body.dark .ch-actions summary.ebgo:hover{ }",
   "dark text on the bright accents"],

  ["dark text boxes stay browser-white",
   "body.dark #hlText, body.dark #rptNote, body.dark #bkText{ background:var(--surface);",
   "body.dark #hlTextX{ background:var(--surface);",
   "remark, report and backup text boxes"],
];

if(STATIC){
  let bad = 0;
  for(const [name, from] of M){
    const n = src.split(from).length - 1;
    if(n !== 1){ bad++; console.log((n ? 'AMBIG  ' : 'STALE  ') + name); }
  }
  console.log(M.length + ' mutations, ' + bad + ' stale or ambiguous');
  process.exit(bad ? 1 : 0);
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
