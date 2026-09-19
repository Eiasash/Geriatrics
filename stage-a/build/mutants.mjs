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
import { classifyMutant, baselineOk, guardRecords, resolveNeedle, resolveTargetId, classifyById } from './mutants-classify.mjs';
import { logRun } from './ledger.mjs';

/* The child runs are runs of a DELIBERATELY BROKEN file. Their verdicts say nothing about the
   tree, so they must never reach the ledger: one mutation set would otherwise write ~270 'fail'
   lines about an index.html that does not exist. STAGEA_LEDGER is stripped from every child. */
const CHILD_ENV = Object.assign({}, process.env);
delete CHILD_ENV.STAGEA_LEDGER;

const SRC = process.argv.slice(2).find(a => !a.startsWith('--')) || '../index.html';
/* --static: only check that every mutation still has exactly one target. Seconds instead of
   minutes; run it before every commit — three pushes went red on a stale target */
const STATIC = process.argv.includes('--static');
/* --needles: one green baseline, then resolve every needle against the labels that run
   actually emitted, and stop. About a minute, versus half an hour for the full set, and it
   answers the question --static cannot: does each needle name exactly ONE guard. */
const NEEDLES_ONLY = process.argv.includes('--needles');
const src = fs.readFileSync(SRC, 'utf8');

const M = [
  ['teardown write goes back through the async layer',
   "  const put = urgent ? (k,v)=>{ if(!writeNow(k,v)) window.storage.set(k,v); }\n                     : (k,v)=>window.storage.set(k,v);",
   "  const put = (k,v)=>window.storage.set(k,v);",
   'writes synchronously', undefined, {id:'m0001'}],

  ['merge returns this tab and forgets the other',
   "  return out;\n}\n/* section notes: one string per section",
   "  return mine;\n}\n/* section notes: one string per section",
   'other tab\u2019s addition', undefined, {id:'m0002'}],

  ['merge resurrects a deletion made here',
   "      else if(!nSet.has(h.id)) list.push(h);",
   "      else list.push(h);",
   'respects a deletion made here', undefined, {id:'m0003'}],

  ['merge reverts the other tab\u2019s edit',
   "        list.push(changedHere ? mineH : h);",
   "        list.push(mineH);",
   'unless this tab changed it', undefined, {id:'m0004'}],

  ['SEEN advances on a write that never landed',
   "      landed = !!(back && back.value === blob);",
   "      landed = true;",
   'a refused save leaves SEEN where it was', undefined, {id:'m0005'}],

  ['rollback claims a restoration it did not make',
   "          if(back && back.value === want) rolled++; else failed.push(j);",
   "          rolled++;",
   'verifies its own writes', undefined, {id:'m0006'}],

  ['selection offset counted the old way',
   "    if(n === r.startContainer){ start += r.startOffset; break; }",
   "    if(n === r.startContainer){ start += 0; break; }",
   'mid-text-node', undefined, {id:'m0007'}],

  ['neighbour window narrowed again',
   "      const gotB = hlNorm(full.slice(Math.max(0, x.at - WIDE), x.at));",
   "      const gotB = hlNorm(full.slice(Math.max(0, x.at - HLCTX), x.at));",
   'survives whitespace', undefined, {id:'m0008'}],

  ['tie between two occurrences guessed rather than dropped',
   "    if(best.s >= 2 && (!runner || runner.s < best.s)) pick = best.x;",
   "    if(best.s >= 2) pick = best.x;",
   'drops the highlight rather than guessing', undefined, {id:'m0009'}],

  ['refresh assigns over foreground work again',
   "        const merged = mergeHL(v, seen, HL);",
   "        const merged = v;",
   'MERGES the disk copy', undefined, {id:'m0010'}],

  /* --- second set: the areas the first ten left unprotected --- */
  ['consolidation week latches onto week 16 again',
   "if(!cw) return consolidationWeek();",
   "if(!cw) return ALLW[ALLW.length-1];",
   'not week 16 again', undefined, {id:'m0011'}],

  ['abbreviation in the pop-out stops closing the dialog',
   "const inModal = a.closest('#tblModal');",
   "const inModal = false;",
   'an abbreviation tapped inside the table pop-out closes the dialog and lands on its own footnote', undefined, {id:'m0012'}],

  ['all-wrong small samples hidden again',
   "const weakEnough = t => (t.n >= 4 && (t.n - t.w) / t.n < 0.65) || (t.n >= 2 && t.w === t.n);",
   "const weakEnough = t => (t.n >= 4 && (t.n - t.w) / t.n < 0.65);",
   'every one wrong flags', undefined, {id:'m0013'}],

  ['jump loses the chapterless third of the bank',
   "sectionForChapter(p.ch) : '') : (PQSEC[p.bk] || '');",
   "sectionForChapter(p.ch) : '') : '';",
   'third of the bank', undefined, {id:'m0014'}],

  ['pre-paint script accepts any text size',
   "if(['s','m','l','xl'].indexOf(v.fs) >= 0) document.body.classList.add('fs-' + v.fs);",
   "if(v.fs) document.body.classList.add('fs-' + v.fs);",
   'and refuses one it does not', undefined, {id:'m0015'}],

  ['mock draws answered questions as unseen',
   "const fresh = pool.filter(p=>pqDone[pqKey(p)] === undefined);",
   "const fresh = pool;",
   'unseen-only draw really excludes', undefined, {id:'m0016'}],

  ['mock stops saving as it goes',
   "  mockSaveRun();",
   "  /* mockSaveRun(); */",
   'saved as you go', undefined, {id:'m0017'}],

  ['mock loses its source weighting',
   "const want = Math.round(share / 100 * n);",
   "const want = n;",
   'weighted to the source mix', undefined, {id:'m0018'}],

  ['table pop-out swallows abbreviation taps again',
   "if(t.closest('mark.hl, abbr.abbr')) return;",
   "if(t.closest('mark.hl')) return;",
   'ignores highlights and abbreviations', undefined, {id:'m0019'}],

  ['a card tag runs past the end of the deck',
   "tagR(231,232,'hf');",
   "tagR(231,236,'hf');",
   'every flashcard carries a tag', undefined, {id:'m0020'}],

  ['the dashboard drill never finds the week\u2019s chapters',
   "  const hasChapters = VIEW && VIEW.items && VIEW.items.length;",
   "  const hasChapters = 0;",
   'still filters to the week when there are chapters', undefined, {id:'m0021'}],

  ['the drill\u2019s week filter comes up empty',
   "  VIEW.items.forEach(x=>{ const c = chapInfo(x.t);",
   "  [].forEach(x=>{ const c = chapInfo(x.t);",
   'week-scoped drill has cards', undefined, {id:'m0022'}],

  /* --- from the outside review, 15/09: fixes that had a guard but no mutation --- */
  ['backup misses a highlight queued on the save chain',
   "  try{ await saveChain; }catch(e){}",
   "  /* try{ await saveChain; }catch(e){} */",
   'waits for queued saves', undefined, {id:'m0023'}],

  /* the target carries the line above it: bmAdvance clears the bookmark the same way when the
     week is done, so the bare set() line appears twice now */
  ['clearing the bookmark goes back to .delete, which the layer does not have',
   "    BM = null;\n    /* the storage layer has get and set only \u2014 .delete threw into the catch and the\n       bookmark stayed on disk. An empty value is what every loader treats as absent. */\n    try{ window.storage.set(BMKEY, ''); }catch(e){}",
   "    BM = null;\n    try{ window.storage.delete(BMKEY); }catch(e){}",
   'layer has no delete', undefined, {id:'m0024'}],

  ['restore leaves keys the backup does not carry',
   "    const val = (k in o) ? o[k] : '';",
   "    if(!(k in o)) continue; const val = o[k];",
   'clears the keys the backup does not carry', undefined, {id:'m0025'}],

  ['teardown write fires even when the host supplies storage',
   "  if(!storageIsLocal) return false;",
   "  /* if(!storageIsLocal) return false; */",
   'stands down when the host supplies its own storage', undefined, {id:'m0026'}],

  /* --- midnight rollover (TODAY conversion, 15/09) --- */
  ['rollover asks isCur after the date has already moved',
   "  const followed = VIEW === paintWeek;",
   "  const followed = isCur(VIEW);",
   'returning to the tab after Sunday midnight', undefined, {id:'m0027'}],

  ['no date check when the tab is seen again',
   "document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkRollover(); });",
   "/* visibility hook removed */",
   'returning to the tab after Sunday midnight', undefined, {id:'m0028'}],

  ['the timer stops checking the date',
   "  if(restoring) return;\n  checkRollover();\n",
   "  if(restoring) return;\n",
   'timer notices midnight', undefined, {id:'m0029'}],

  ['a reading block past midnight credits the new day',
   "    const bd = T.d || today();",
   "    const bd = today();",
   'credited to the day it began', undefined, {id:'m0030'}],

  /* only red in a timezone with daylight saving: CI runs in Asia/Jerusalem */
  ['countdown divides raw milliseconds again',
   "Math.round((exam - new Date().setHours(0,0,0,0))/86400000)",
   "Math.ceil((exam - new Date())/86400000)",
   'countdown counts calendar days', undefined, {id:'m0031'}],

  ['a block finished yesterday carries over as already done',
   "    if(T.p >= PH.length){ T = {p:0, left:PH[0].s, run:false, ts:0, d:t}; tSave(); }",
   "    if(T.p >= PH.length){ T.d = t; tSave(); }",
   'finished yesterday starts fresh', undefined, {id:'m0032'}],

  ['a paused block moves its credit to the new day',
   "    else if(!T.run && T.p === 0 && T.left === PH[0].s){ T.d = t; tSave(); }",
   "    else if(!T.run){ T.d = t; tSave(); }",
   'paused part-way across midnight', undefined, {id:'m0033'}],

  ['midnight re-deals the drill round on screen',
   "  if(filter.mode === 'week' && !document.getElementById('drill').classList.contains('on'))",
   "  if(filter.mode === 'week')",
   'does not re-deal the drill round', undefined, {id:'m0034'}],

  ['the drill\u2019s week toggle shows in the consolidation period again',
   "  const cwk = document.getElementById('cweek'); if(cwk) cwk.hidden = !w.items.length;",
   "  const cwk = document.getElementById('cweek');",
   'week toggle is hidden for a week with no chapters', undefined, {id:'m0035'}],

  ['the bookmark is stamped in UTC again',
   "  BM = {sec: sec.id, t, i, d: nowStamp()};",
   "  BM = {sec: sec.id, t, i, d: new Date().toISOString().slice(0,16).replace('T',' ')};",
   'stamps are local time', undefined, {id:'m0036'}],

  ['the midnight check writes during a restore',
   "  if(restoring) return false;\n  const t = today();",
   "  const t = today();",
   'while a restore runs', undefined, {id:'m0037'}],

  ['the timer advances during a restore',
   "function tick(){\n  if(restoring) return;\n",
   "function tick(){\n",
   'while a restore runs', undefined, {id:'m0038'}],

  ['undo clears its copy and reloads even when writes failed',
   "  if(!await bkApply(v, false, true)) return;",
   "  await bkApply(v, false, true);",
   'keeps the undo copy for another try', undefined, {id:'m0039'}],

  ['the issue link carries the whole note again',
   "    if(encodeURIComponent(body).length > LINKMAX){",
   "    if(false){",
   'issue link fits', undefined, {id:'m0040'}],

  ['a stale error is reported without its time',
   "window.addEventListener('unhandledrejection', e=>{ lastErr = '[' + nowStamp() + '] promise: ' +",
   "window.addEventListener('unhandledrejection', e=>{ lastErr = 'promise: ' +",
   'carries the time it happened', undefined, {id:'m0041'}],

  ['the week scope matches earlier-edition chapter numbers again',
   "    if(chs.size) p = p.filter(x=>x.ch && x.bk==='Hazzard' && chs.has(x.ch) && OLDED.indexOf(x.y) < 0);",
   "    if(chs.size) p = p.filter(x=>x.ch && x.bk==='Hazzard' && chs.has(x.ch));",
   'never serves earlier-edition questions', undefined, {id:'m0042'}],

  ['a single-chapter hold is not understood by the filter',
   "    const chs = /^ch:\\d+$/.test(pqChap) ? [+pqChap.slice(3)] : secChapters(pqChap);",
   "    const chs = secChapters(pqChap);",
   'single weak chapter holds', undefined, {id:'m0043'}],

  ['an earlier-edition question jumps to a section by its old chapter number',
   "  const tsec = (p.ch && p.bk==='Hazzard') ? (OLDED.indexOf(p.y) < 0 ? sectionForChapter(p.ch) : '') : (PQSEC[p.bk] || '');",
   "  const tsec = (p.ch && p.bk==='Hazzard') ? sectionForChapter(p.ch) : (PQSEC[p.bk] || '');",
   'no jump to an 8th-edition section', undefined, {id:'m0044'}],

  /* --- render-check round, 16/09 --- */
  ["a search hit restores the old scroll over the match",
   "    skipRestore = true;\n    show(x.sec);",
   "    show(x.sec);",
   "lands on the match", undefined, {id:'m0045'}],

  ["the next drill card opens above the view",
   "  cardIntoView(card);\n",
   "",
   "next card is brought into view", undefined, {id:'m0046'}],

  ["a mock left part-way is discarded without asking",
   "  if(liveRun && !confirm('An unfinished mock is still waiting. Start a new paper and discard it?')) return;\n",
   "",
   "asks before discarding", undefined, {id:'m0047'}],

  ["blanks count as wrong in the chapter tally",
   "    if(r.p.ch && r.p.bk==='Hazzard' && r.given){",
   "    if(r.p.ch && r.p.bk==='Hazzard'){",
   "keeps blanks apart", undefined, {id:'m0048'}],

  ["the source line is shown as extracted",
   "escHtml(srcSpaced(src))",
   "escHtml(src)",
   "spaces Hebrew and digits", undefined, {id:'m0049'}],

  ["white text on bright accents in dark mode",
   "body.dark .secfoot button.mark.readon, body.dark .ch-actions summary.ebgo:hover{ color:var(--paper) !important }",
   "body.dark .secfoot button.mark.readon, body.dark .ch-actions summary.ebgo:hover{ }",
   "dark text on the bright accents", undefined, {id:'m0050'}],

  ["dark text boxes stay browser-white",
   "body.dark #hlText, body.dark #rptNote, body.dark #bkText{ background:var(--surface);",
   "body.dark #hlTextX{ background:var(--surface);",
   "remark, report and backup text boxes", undefined, {id:'m0051'}],
  /* --- group 1: question flow, 16/09 --- */
  ["next/skip leaves the new question above the view",
   "function pqNext(){ pqIdx++; pqRender(); cardIntoView(document.getElementById('pqCard')); }",
   "function pqNext(){ pqIdx++; pqRender(); }",
   "next/skip brings the question card", undefined, {id:'m0052'}],

  ["the mock stops keeping its question in view",
   "  cardIntoView(document.getElementById('mockCard'));\n",
   "",
   "each mock question is kept in view", undefined, {id:'m0053'}],

  ["the mock header scrolls away",
   "#mockCard .pqhead{ position:sticky; top:var(--navh, 135px);",
   "#mockCard .pqhead{ top:var(--navh, 135px);",
   "mock header (question n of N, time left) sticks", undefined, {id:'m0054'}],

  ["review loses your answer against the key",
   "    pqMockAns = new Map(rows.map(r => [pqKey(r.p), r.given || '']));\n",
   "",
   "your answer against the key", undefined, {id:'m0055'}],

  ["the papers intro never folds",
   "  open(!seen);",
   "  open(true);",
   "folded behind a link", undefined, {id:'m0056'}],
  /* --- group 2: mock timing, 16/09 --- */
  ["the home tile goes back to the daily 35 minutes",
   "  b.textContent = mockPerQ ? (50 * mockPerQ) + ' min' : 'untimed';",
   "  b.textContent = '35 min';",
   "home mock tile states the time", undefined, {id:'m0057'}],
  /* --- Gemini round 4, 16/09 --- */
  ["a running mock is replaced without asking",
   "  const liveRun = mockOn || !!document.getElementById('mockResume') || !!(stored && stored.q && stored.q.length);",
   "  const liveRun = !!document.getElementById('mockResume') || !!(stored && stored.q && stored.q.length);",
   "while one is running asks first", undefined, {id:'m0058'}],

  ["the mock report scrolls under the nav",
   "#pqCard, #mockCard, #mockReport, #dsum, #drill .card{",
   "#pqCard, #mockCard, #drill .card{",
   "report and drill summary land below", undefined, {id:'m0059'}],
  /* --- group 3: less clutter at XL, 16/09 --- */
  ["the mini-timer shows even when the block is untouched",
   "  box.hidden = home || mtOff || !inUse || (typeof mockOn !== 'undefined' && mockOn);",
   "  box.hidden = home || mtOff || (typeof mockOn !== 'undefined' && mockOn);",
   "stays hidden on a section while the block is untouched", undefined, {id:'m0060'}],


  ["tap targets back under 44px",
   "#miniT button, #mockPrev, #hlModal .sw{ min-width:44px !important }",
   "#miniT button{ }",
   "tap targets are at least 44px", undefined, {id:'m0061'}],

  ["the header title truncates again",
   ".topicbtn .glabel{ flex:0 100 auto;",
   ".topicbtn .glabel{ flex:0 1 auto;",
   "header title keeps its name", undefined, {id:'m0062'}],
  /* --- group 4: fewer taps, 16/09 --- */
  ["Read ch N opens the week's first chapter even when it is read",
   "  const w = weekChapters(); return w.find(x => !(readSet && readSet.has(x.sec))) || w[0] || null;",
   "  const w = weekChapters(); return w[0] || null;",
   "first unread chapter", undefined, {id:'m0063'}],

  ["the footer never offers the next chapter",
   "    b.hidden = !rb;",
   "    b.hidden = true;",
   "offers the next one this week", undefined, {id:'m0064'}],

  ["the topics sheet loses the notes and bookmark row",
   "  SHBODY.appendChild(row);",
   "",
   "topics sheet carries all my notes", undefined, {id:'m0065'}],

  ["the header shows the full label that clips",
   "    TNOW.textContent = b.dataset.short || b.firstChild.textContent.trim();",
   "    TNOW.textContent = b.firstChild.textContent.trim();",
   "short label where the full one clips", undefined, {id:'m0066'}],

  ["first open ignores the phone's dark setting",
   "let disp = {dark: !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches), fs:'m'};",
   "let disp = {dark:false, fs:'m'};",
   "follows the phone", undefined, {id:'m0067'}],

  ["the pre-paint script paints light first and snaps to dark",
   "    if(raw === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) v.dark = true;",
   "",
   "the phone’s dark setting is applied before the first paint, not after a light flash", undefined, {id:'m0068'}],
  /* --- group 5: extraction-garbled options, 16/09 --- */
  ["the COMBODEX option is garbled again",
   "\"COMBODEX (PARACETAMOL, IBUPROFEN)\"",
   "\"IBUPROFEN) (PARACETAMOL, COMBODEX\"",
   "COMBODEX option reads brand", undefined, {id:'m0069'}],
  /* --- group 6: search and remembered place, 16/09 --- */
  ["search goes back to exact phrase only",
   "  for(const pass of [x => re.test(x.t), x => res.every(r => r.test(x.t))]){",
   "  for(const pass of [x => re.test(x.t)]){",
   "two words search as AND", undefined, {id:'m0070'}],

  ["past-paper place is never saved",
   "  pqSavePos();\n",
   "",
   "come back after a reload", undefined, {id:'m0071'}],

  ["the saved question is not put back on screen",
   "    const i = pqPool.findIndex(p => pqKey(p) === v.k); if(i >= 0) pqIdx = i;\n",
   "",
   "come back after a reload", undefined, {id:'m0072'}],
  /* --- brackets and stylesheet junk, 16/09 --- */
  ["the MUSCOL option is garbled again",
   "\"MUSCOL (PARACETAMOL, ORPHENADRINE)\"",
   "\"PARACETAMOL, ORPHENADRINE) )MUSCOL\"",
   "MUSCOL option reads brand", undefined, {id:'m0073'}],

  ["the external-beam bracket is mirrored again",
   "חיצוני (external beam radiation therapy)",
   "חיצוני external beam radiation therapy) )",
   "external-beam option has its bracket", undefined, {id:'m0074'}],

  ["the FDA bracket is mirrored again",
   "האמריקאי (FDA) למצב המתואר",
   "האמריקאי FDA)) למצב המתואר",
   "FDA option has its bracket", undefined, {id:'m0075'}],

  ["pasted prose back in the stylesheet",
   "/* (removed 16/09:",
   "- Viewport Budget & Geometry Verification\n/* (removed 16/09:",
   "no pasted prose left", undefined, {id:'m0076'}],

  /* --- Group 8: Key Clinical Points recap tables, ch 43/44/46 (16/09) --- */
  ["falls Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">5</td><td>Tailored multifaceted and multifactorial interventions are the most effective for preventing falls in high-risk populations, including RACF residents.</td></tr>\n",
   "",
   "falls Key Clinical Points table", undefined, {id:'m0077'}],

  ["sleep Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>Sleep-wake cycle disruption is common in nursing home patients and may improve with bright-light exposure, a regular day-night cycle and melatonin.</td></tr>\n",
   "",
   "sleep Key Clinical Points table", undefined, {id:'m0078'}],

  ["pressure Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>Healing benchmarks: partial-thickness (stage 2) injuries should heal within 60 days maximum; full-thickness (stage 3/4/unstageable) injuries should show improvement every 2 to 4 weeks.</td></tr>\n",
   "",
   "pressure Key Clinical Points table", undefined, {id:'m0079'}],

  ["incontinence Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">3</td><td>Treatment, particularly drug therapy, should factor in patient preferences and comorbid conditions.</td></tr>\n",
   "",
   "incontinence Key Clinical Points table", undefined, {id:'m0080'}],

  ["rehab Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">5</td><td>Adaptive aids let people with physical limitations perform BADLs/IADLs with greater ease and less pain, spanning mobility aids, bathroom aids and self-care aids.</td></tr>\n",
   "",
   "rehab Key Clinical Points table", undefined, {id:'m0081'}],

  ["delirium Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">8</td><td>Nonpharmacologic strategies are the preferred treatment; medications are reserved for more severe symptoms that threaten medical management or patient safety.</td></tr>\n",
   "",
   "delirium Key Clinical Points table", undefined, {id:'m0082'}],

  ["bpsd ch 60 Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">7</td><td>If medication is started, titrate slowly, use the lowest effective dose, and reassess the risk/benefit ratio regularly.</td></tr>\n",
   "",
   "bpsd Key Clinical Points table for ch 60", undefined, {id:'m0083'}],

  ["bpsd ch 63 Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>A history of falls and dysphagia with abnormal vertical gaze but a preserved oculocephalic reflex suggests progressive supranuclear palsy.</td></tr>\n",
   "",
   "bpsd Key Clinical Points table for ch 63", undefined, {id:'m0084'}],

  ["parkinson Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>Deep brain stimulation is typically indicated for patients with difficult motor complications and medication-refractory tremor.</td></tr>\n",
   "",
   "parkinson Key Clinical Points table", undefined, {id:'m0085'}],
  ['end and top buttons swap again instead of showing together',
   "if(en) en.hidden = scrollY + innerHeight > document.documentElement.scrollHeight - 400;",
   "if(en) en.hidden = !b.hidden;",
   'shown together while reading', undefined, {id:'m0086'}],

  /* --- group 9: the jump row stops covering the text (16 Sep) --- */
  ['the jump row stacks again, so it covers three lines instead of one',
   "    z-index:45;flex-direction:row;align-items:center;gap:8px}",
   "    z-index:45;flex-direction:column;align-items:center;gap:8px}",
   'one horizontal row in the corner', undefined, {id:'m0087'}],

  ['the jump buttons lose their 44px tap target',
   "    min-height:44px;min-width:44px;justify-content:center;\n",
   "",
   'both jump buttons keep a 44px tap target', undefined, {id:'m0088'}],

  ['the jump row stays up on Past papers and the mock, over the answer options',
   "    if(row) row.classList.toggle('off', !!sec && sec.id === 'papers');",
   "    if(row) row.classList.toggle('off', false);",
   'hidden on Past papers and the mock', undefined, {id:'m0089'}],

  ['hiding the row only makes it invisible, so it still swallows the tap',
   "  .jumprow.off{display:none!important}",
   "  .jumprow.off{opacity:0}",
   'swallow a tap on an answer', undefined, {id:'m0090'}],

  ['main goes back to a hard-coded bottom gap that XL outgrows',
   "    main{padding-bottom:calc(var(--jumph, 66px) + var(--minih, 0px) + 26px + env(safe-area-inset-bottom))}",
   "    main{padding-bottom:calc(110px + env(safe-area-inset-bottom))}",
   'padded by the measured height', undefined, {id:'m0091'}],

  ['the row is never measured, so the padding keeps its fallback',
   "    if(h > 0) document.documentElement.style.setProperty('--jumph', h + 'px');",
   "    if(h > 0) return;",
   'writes its height into --jumph', undefined, {id:'m0092'}],

  ['the row is measured while hidden, so Past papers reports zero height',
   "    if(off) row.classList.remove('off');",
   "    if(off) void 0;",
   'still measured on Past papers', undefined, {id:'m0093'}],

  /* --- the row gets out of the way while scrolling, 16 Sep --- */
  ['scrolling no longer fades the row out of the way',
   "  addEventListener('scroll', fadeJumpRow, {passive:true});",
   "  void fadeJumpRow;",
   'scrolling fades the jump row out', undefined, {id:'m0094'}],

  ['the faded row is hidden by display, so it stops measuring mid-scroll',
   "  .jumprow.fade{opacity:0;pointer-events:none}",
   "  .jumprow.fade{display:none}",
   'never display:none', undefined, {id:'m0095'}],

  ['the faded row stays tappable, so it swallows the tap it is hiding under',
   "{opacity:0;pointer-events:none}",
   "{opacity:0}",
   'stops it taking taps', undefined, {id:'m0096'}],

  ['the row never comes back after the reader stops',
   "    settle = setTimeout(()=>{ row.classList.remove('fade'); faded = false; }, SETTLE);",
   "    settle = 0;",
   'the row comes back', undefined, {id:'m0097'}],

  ['a focused jump button fades out from under the keyboard again',
   "    if(!faded && !row.contains(document.activeElement)){ row.classList.add('fade'); faded = true; }",
   "    if(!faded){ row.classList.add('fade'); faded = true; }",
   'already holds focus never fades', undefined, {id:'m0098'}],

  ['reduced motion loses its carve-out',
   "  @media (prefers-reduced-motion: reduce){ .jumprow{transition:none} }",
   "",
   'reduced motion drops the transition', undefined, {id:'m0099'}],

  ['a text-size change stops re-measuring nav, going stale at XL',
   "  setNavH();\n  document.querySelectorAll('.disprow button[data-dk]').forEach(dk=>{",
   "  document.querySelectorAll('.disprow button[data-dk]').forEach(dk=>{",
   'calls setNavH, so a text-size change', undefined, {id:'m0100'}],

  /* ---- runner 'browser': real Chromium, not jsdom — see browser-check.mjs's own header for
     why. Found while building it, 3(3): a mutation that scales the #week .disp em multiplier
     down (.85em -> .5em) is invisible to every existing jsdom guard — nothing in test.mjs pins
     that literal — AND, on its own, invisible to a ratio-only real-browser check too (8.00px
     -> 11.20px is still exactly 1.40x; the ratio survives a uniform scale-down that collapses
     the actual reading size). Needed the floor check alongside the ratio check, not instead
     of it. ---- */
  ['the reading text at #week collapses toward unreadable at every text-size setting, and a ratio-only check alone would call it clean',
   "#week .sparklab, #week .weakmini, #week .disp{ font-size:.85em; line-height:1.55 }",
   "#week .sparklab, #week .weakmini, #week .disp{ font-size:.5em; line-height:1.55 }",
   'not collapsed toward unreadable', 'browser', {id:'m0101'}],

  /* Same code path as the jsdom mutation above ('the faded row stays tappable' / g0513) — this
     one is not jsdom-blind, jsdom's synchronous computed-style read already catches it. It is
     here because g0513's own model of the transition is itself wrong (jsdom jumps straight to
     the end CSS state; there is no transition in jsdom, so its "immediately opacity:0" read is
     not what a reader on a real phone sees — they see the row still visible for up to .18s
     while it is already untappable). A real second witness on the SAME regression, from an
     engine whose model of the transition is not fabricated, costs one more shard-run and closes
     the gap if g0513 or g0519's literal pin is ever loosened on its own. */
  ['the fading jump row stops being provably dead while still visible — only a real transition can show that window exists at all',
   "{opacity:0;pointer-events:none}",
   "{opacity:0}",
   'visible-but-dead mid-transition', 'browser', {id:'m0102'}],

  /* --- regression, real phone: bottom-docked bar hidden by Chrome, and the empty nx, 16 Sep --- */
  ['the bar goes back to the bottom edge, under Chrome\u2019s own contextual sheet',
   "top:calc(var(--navh, 130px) + env(safe-area-inset-top));",
   "bottom:0;",
   'under nav, not at the bottom edge', undefined, {id:'m0103'}],

  ['a second, redundant writer of --navh creeps back in',
   "if(nav) document.documentElement.style.setProperty('--navh', Math.round(nav.getBoundingClientRect().height) + 'px'); }",
   "if(nav) document.documentElement.style.setProperty('--navh', Math.round(nav.getBoundingClientRect().height) + 'px'); document.documentElement.style.setProperty('--navh', '999px'); }",
   'the one existing measurer, not a second one', undefined, {id:'m0104'}],

  ['the next-chapter button loses its hidden guard, and shows empty again',
   "  .nx[hidden]{display:none}",
   "",
   'genuinely display:none', undefined, {id:'m0105'}],

  /* --- less invasive chrome, and clean selection handling, 16 Sep --- */
  ['the selection bar goes back to a black fill in light mode',
   "  #hlBar{position:fixed;z-index:58;left:0;right:0;top:calc(var(--navh, 130px) + env(safe-area-inset-top));\n    display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:nowrap;\n    background:var(--paper);color:var(--ink);",
   "  #hlBar{position:fixed;z-index:58;left:0;right:0;top:calc(var(--navh, 130px) + env(safe-area-inset-top));\n    display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:nowrap;\n    background:var(--ink);color:var(--paper);",
   'not a fixed dark fill', undefined, {id:'m0106'}],

  ['the floating timer goes back to a black pill',
   "  #miniT{position:fixed;left:10px;bottom:14px;z-index:56;font-family:var(--sans);background:var(--surface);color:var(--ink);",
   "  #miniT{position:fixed;left:10px;bottom:14px;z-index:56;font-family:var(--sans);background:var(--ink);color:var(--paper);",
   'takes its colour from the page too', undefined, {id:'m0107'}],

  ['the two secondary actions get a second row again',
   "  <button type=\"button\" id=\"hlMore\" aria-haspopup=\"true\" aria-expanded=\"false\" aria-label=\"More highlight actions\">&#8943;</button>\n  <span class=\"hlmore\" hidden>\n    <button type=\"button\" id=\"hlNote\">+ note</button>\n    <button type=\"button\" id=\"hlHere\" title=\"Mark this as where you stopped reading\">stop here</button>\n  </span>",
   "  <button type=\"button\" id=\"hlNote\">+ note</button>\n  <button type=\"button\" id=\"hlHere\" title=\"Mark this as where you stopped reading\">stop here</button>\n  <button type=\"button\" id=\"hlMore\" aria-haspopup=\"true\" aria-expanded=\"false\" aria-label=\"More highlight actions\" hidden></button>\n  <span class=\"hlmore\" hidden></span>",
   'behind an overflow toggle', undefined, {id:'m0108'}],

  ['the timer and jump row stop standing down for the selection bar',
   "    if(mt) mt.classList.toggle('hl-off', up);\n    if(row) row.classList.toggle('hl-off', up);",
   "    void up;",
   'stands the timer and the jump row down', undefined, {id:'m0109'}],

  /* this line is reached from two paths: a real selectionchange clearing (place -> paintChrome)
     and a direct action inside the overflow (hlNote/hlHere's own click handlers call
     paintChrome() too). The click path is what the existing guard below already exercises. */
  ['the overflow menu no longer closes behind an action taken inside it',
   "    if(!up) more.hidden = true;",
   "    if(false) more.hidden = true;",
   'closes the whole bar, overflow included', undefined, {id:'m0110'}],

  ['a selectionchange handler starts mutating the selection again',
   "  function paintChrome(){\n    const up = hlBarShown();",
   "  function paintChrome(){\n    window.getSelection().removeAllRanges();\n    const up = hlBarShown();",
   'mutates the DOM or the Selection while a selection is live', undefined, {id:'m0111'}],

  /* --- the place follows progress, and the timer is one tap, 16 Sep --- */
  ['marking a chapter read leaves the place inside the chapter just finished',
   "  if(!was && typeof bmAdvance === 'function') bmAdvance();",
   "  void was;",
   'moves the place to the next unread chapter', undefined, {id:'m0112'}],

  ['un-marking a chapter drags the place back into it',
   "  const was = readSet.has(id);\n  was ? readSet.delete(id) : readSet.add(id);",
   "  const was = false;\n  readSet.has(id) ? readSet.delete(id) : readSet.add(id);",
   'un-marking a chapter leaves the place', undefined, {id:'m0113'}],

  /* the old fallback: firstUnread() returns w[0] when everything is read, which would park
     the place back on the first chapter instead of clearing it. Mutating the guard clause
     itself crashed the page on the undefined chapter and proved nothing. */
  ['the place parks on the first chapter instead of clearing when the week is done',
   "  const nx = w.find(x => !(readSet && readSet.has(x.sec)));",
   "  const nx = w.find(x => !(readSet && readSet.has(x.sec))) || w[0];",
   'the place clears, so resume goes home', undefined, {id:'m0114'}],

  ['finishing a chapter\u2019s drill no longer moves the place',
   "  if(filter.mode === 'tag' && SECFORTAG[filter.tag] && typeof bmAdvance === 'function') bmAdvance();",
   "  void SECFORTAG;",
   'drill moves the place on too', undefined, {id:'m0115'}],

  ['pause has to go through the menu again',
   "  function goTap(){ setMenuOpen(false); if(SW.on) swToggleRun(); else elGo.click(); }",
   "  function goTap(){ setMenuOpen(true); if(SW.on) swToggleRun(); else elGo.click(); }",
   'closes the menu rather than leaving it up', undefined, {id:'m0116'}],

  ['a tap on the clock goes back to doing nothing, instead of pausing/resuming like the button',
   "    if(e.target.closest('#mtClock, .ph')) goTap();",
   "    void e;",
   'pauses/resumes the day, the same as the button', undefined, {id:'m0117'}],

  ['hide stops shrinking the pill to the gear dot',
   "  document.getElementById('mtHide').addEventListener('click',()=>{ setMenuOpen(false); setDot(true); });",
   "  document.getElementById('mtHide').addEventListener('click',()=>{ setMenuOpen(false); });",
   'shrinks the pill to a gear dot', undefined, {id:'m0118'}],

  ['tapping the gear dot no longer restores the pill',
   "    if(box.classList.contains('dot')){ setDot(false); return; }\n    if(e.target.closest('#mtClock, .ph')) goTap();",
   "    if(false){ setDot(false); return; }\n    if(e.target.closest('#mtClock, .ph')) goTap();",
   'restores the pill', undefined, {id:'m0119'}],

  ['switching mode leaves the menu open',
   "  document.getElementById('mtMode').addEventListener('click',()=>{ swSetMode(!SW.on); setMenuOpen(false); });",
   "  document.getElementById('mtMode').addEventListener('click',()=>{ swSetMode(!SW.on); });",
   'action taken in the menu closes it', undefined, {id:'m0120'}],

  ['tapping the page no longer closes the menu',
   "    if(!box.classList.contains('open') || box.contains(e.target)) return;\n    setMenuOpen(false);",
   "    return;",
   'tapping outside the menu closes it', undefined, {id:'m0121'}],

  /* --- v27 pill-as-single-control, next round --- */
  ['the jump row stops standing down while the pill\u2019s menu is open',
   "    if(jumpRow) jumpRow.classList.toggle('hl-off', v);",
   "    void jumpRow;",
   'the jump row stands down while the pill\u2019s own menu is open', undefined, {id:'m0122'}],

  ['the More sub-list stops toggling open',
   "  moreToggle.addEventListener('click', ()=>{\n    const open = moreSub.hidden; moreSub.hidden = !open;\n    moreToggle.setAttribute('aria-expanded', open ? 'true' : 'false');\n  });",
   "  moreToggle.addEventListener('click', ()=>{});",
   'tapping it opens the sub-list', undefined, {id:'m0123'}],

  ['text size in the pill\u2019s menu no longer closes the menu behind it',
   "  document.getElementById('mtSize').addEventListener('click', ()=>setMenuOpen(false));",
   "",
   'text size in the pill’s menu joins the shared display-popover wiring, and closes the pill’s own menu behind it', undefined, {id:'m0124'}],

  ['theme in the pill\u2019s menu stops toggling dark mode',
   "  document.getElementById('mtTheme').addEventListener('click', ()=>{ disp.dark = !disp.dark; paintDisp(); setMenuOpen(false); });",
   "  document.getElementById('mtTheme').addEventListener('click', ()=>{ setMenuOpen(false); });",
   'theme in the pill', undefined, {id:'m0125'}],

  ['mark my place in the pill\u2019s menu stops setting the bookmark',
   "  document.getElementById('mtMark').addEventListener('click', ()=>{ setTimeout(()=>bmSet(null), 0); setMenuOpen(false); });",
   "  document.getElementById('mtMark').addEventListener('click', ()=>{ setMenuOpen(false); });",
   'mark my place in the pill', undefined, {id:'m0126'}],

  ['the drag threshold drops from 300ms, so a plain tap starts dragging',
   "    }, 300);",
   "    }, 0);",
   'a real long-press (300ms)', undefined, {id:'m0127'}],

  ['the dragged pill snaps flush to the edge instead of the 24px + safe-area inset',
   "  const EDGE = 24;",
   "  const EDGE = 0;",
   '24px', undefined, {id:'m0128'}],

  ['the pill\u2019s dragged position stops being saved to geri:timerpos',
   "      try{ window.storage.set('geri:timerpos', JSON.stringify(pos)); }catch(e){}",
   "",
   'geri:timerpos', undefined, {id:'m0129'}],

  ['a long-press with no movement stops being swallowed, so it falls through and pauses/resumes the timer',
   "    if(armed || (Date.now() - dragEndedAt < 400)){ armed = false; e.stopImmediatePropagation(); }",
   "    if(armed || (Date.now() - dragEndedAt < 400)){ }",
   'swallowed as a hold', undefined, {id:'m0130'}],

  ['pointercancel stops tearing the drag down, so a system-cancelled press leaves the pill armed for the next touch',
   "    document.addEventListener('pointercancel', onPointerCancel);",
   "",
   'pointercancel tears the drag down', undefined, {id:'m0131'}],

  ['closing the pill’s menu stops collapsing the nested More list behind it',
   "      if(moreSub){ moreSub.hidden = true; moreToggle.setAttribute('aria-expanded','false'); }",
   "",
   'also collapses the nested More list', undefined, {id:'m0132'}],

  ['the gear dot loses its drag carve-out, so it can never be long-pressed once hidden down to a dot',
   "    if(e.target.closest('button') && !box.classList.contains('dot')) return;",
   "    if(e.target.closest('button')) return;",
   'shrunk gear dot can still be long-pressed', undefined, {id:'m0133'}],

  ['a fresh, never-dragged pill goes back to clamping from a zero-size hidden rect and gets pinned to the top edge',
   "applyPos(clampPos(...Object.values(CSS_DEFAULT_POS)));",
   "applyPos(clampPos(...Object.values(currentPos())));",
   'pill lands near the bottom-left edge inset', undefined, {id:'m0134'}],

  ['Start/Resume goes back to a solid near-black --ink slab in light mode',
   "#miniT button.pri{background:var(--surface);color:var(--ink);border-color:var(--ink);font-weight:600}",
   "#miniT button.pri{background:var(--ink);color:var(--paper);border-color:var(--ink);font-weight:600}",
   'not a solid near-black slab', undefined, {id:'m0135'}],

  ['the gear dot stops updating mtMore’s accessible name, so it still announces "Settings and more" with a popup once dotted',
   "    moreBtn.setAttribute('aria-label', v ? 'Restore timer' : 'Settings and more');\n    moreBtn.setAttribute('aria-haspopup', v ? 'false' : 'true');",
   "",
   'accessible name says it restores the timer', undefined, {id:'m0136'}],

  ['a fresh desktop pill loses its CSS right-side default and gets dragged to the mobile left/bottom fallback',
   "} else if(!(window.matchMedia && window.matchMedia('(min-width:901px)').matches)){",
   "} else if(true){",
   'keeps its CSS right-side default', undefined, {id:'m0137'}],

  ['a second finger can hijack an in-progress pill drag',
   "  function onPointerMove(e){\n    if(e.pointerId !== activePointerId) return;",
   "  function onPointerMove(e){",
   'second finger cannot hijack an in-progress drag', undefined, {id:'m0138'}],

  ['the gear dot shrinks back to 40px, clipping mtMore’s 44px hit area down below the touch-target floor',
   "width:44px; height:44px; min-width:44px;",
   "width:40px; height:40px; min-width:40px;",
   'the gear dot is 44px, not 40', undefined, {id:'m0139'}],

  ['opening the menu stops re-clamping a top-pinned pill, so its taller open self can be pushed off the top of the viewport',
   "    if(v && collapsedPos){",
   "    if(false && collapsedPos){",
   're-clamps a top-pinned pill', undefined, {id:'m0140'}],

  ['closing the menu stops restoring the exact pre-open position, leaving the pill wherever the open-state clamp put it',
   "      if(collapsedPos){ applyPos(collapsedPos); collapsedPos = null; }",
   "",
   'restores the exact pre-open position', undefined, {id:'m0141'}],

  ['endDrag stops clearing armed and stamping dragEndedAt, so a real drag with no post-drag click leaves armed true forever',
   "    armed = false;\n    dragEndedAt = Date.now();\n    teardown();",
   "    teardown();",
   'not swallowed by a stale armed flag', undefined, {id:'m0142'}],

  ['the safe-area probe goes back to reading an unresolved custom property, so the inset is always 0',
   "    const v = getComputedStyle(safeProbe).getPropertyValue('padding-' + side);",
   "    const v = getComputedStyle(document.documentElement).getPropertyValue('--sai-' + side);",
   'measured off a resolved padding on a real probe element', undefined, {id:'m0143'}],

  ['entering dot mode stops moving focus off a hidden Hide button, stranding a keyboard user’s focus on it',
   "    if(v && document.activeElement && box.contains(document.activeElement) && document.activeElement !== moreBtn){\n      moreBtn.focus();\n    }",
   "",
   'moves focus to the restore dot', undefined, {id:'m0144'}],

  /* --- final Gemini round, 16 Sep --- */
  ['dark mode answer feedback loses to the plain-option rule again',
   "body.dark .pqo.right {\n  background: #1b2a25 !important;",
   "body.dark .pqo.right {\n  background: #1b2a25;",
   'answered option its own background', undefined, {id:'m0145'}],

  /* "the highlight save binds the object it was queued with, not the live one" (hoisting the
     mine capture out of saveChain.then()) is retired as of the round-4 Codex follow-up: with
     mergeSave's own moved-on detection and recursive resave in place (see the two mutations
     below), hoisting mine no longer produces an observably different outcome by the time the
     save (and its follow-up pass, if one fires) settles — the same live-object read that used
     to be this mutation's only safety net now happens again downstream regardless of where
     the first capture was taken, so this specific mutation is provably MISSED, not a live
     guard. The property it protected (a save reflects the live object it actually ran
     against) is now covered by the "mergeSave stops cloning its mine snapshot" and "stops
     queueing a follow-up save" mutations below instead. */

  ['the timer height stops being watched, so --minih goes stale on a wrap',
   "  if(miniT && typeof ResizeObserver === 'function') new ResizeObserver(measureTimer).observe(miniT);",
   "  void measureTimer;",
   'height is watched', undefined, {id:'m0146'}],

  ['the timer is not re-measured when the section changes either',
   "  document.addEventListener('sectionshown', ()=>{ jumpRowFor(); measureJumpRow(); measureTimer(); });",
   "  document.addEventListener('sectionshown', ()=>{ jumpRowFor(); measureJumpRow(); });",
   'no attribute change still updates', undefined, {id:'m0147'}],

  ['coming back to the tab stops re-reading the timer',
   "  try{ const r = await window.storage.get(TKEY); const v = JSON.parse(r.value);\n    if(v && v.d === today()){ T = v; if(T.run && tLeft() <= 0){ T.run = false; T.left = 0; } } }catch(e){}",
   "  void TKEY;",
   'another tab moved on is picked up', undefined, {id:'m0148'}],

  ['a timer from another day is restored on refresh',
   "    if(v && v.d === today()){ T = v; if(T.run && tLeft() <= 0){ T.run = false; T.left = 0; } } }catch(e){}",
   "    if(v){ T = v; } }catch(e){}",
   'from another day is left where it is', undefined, {id:'m0149'}],

  ['the mock writes the reader\u2019s log again',
   "    mlog[today()] = Math.round(right / rows.length * 50);\n    mlSaved = await saveML(); paintQ();",
   "    qlog[today()] = Math.round(right / rows.length * 50);\n    mlSaved = await saveQ(); paintQ();",
   'writes its own log', undefined, {id:'m0150'}],

  ['the mock log is left out of the backup',
   "'geri:qlog','geri:mocklog',",
   "'geri:qlog',",
   'own key, loaded on boot', undefined, {id:'m0151'}],

  ['a day with both scores plots the higher one',
   "  if(has(a) && has(b)) return Math.min(a, b);",
   "  if(has(a) && has(b)) return Math.max(a, b);",
   'plots the lower of them', undefined, {id:'m0152'}],

  ['only one of the two day scores is shown again',
   "  if(mock != null) parts.push('mock: <b>'+mock+'/50</b>');",
   "  if(mock != null && mine == null) parts.push('mock: <b>'+mock+'/50</b>');",
   'both scores are shown', undefined, {id:'m0153'}],

  /* --- icon-only jump buttons, 16 Sep --- */
  ['the back-to-top override sizes the button again, breaking the matched pair',
   "  border-radius: 24px !important;\n  font-weight: 700 !important;",
   "  border-radius: 24px !important;\n  padding: 12px 16px !important;\n  font-weight: 700 !important;",
   'no longer sizes the button', undefined, {id:'m0154'}],

  ['the jump buttons get their words back, and cover the text again',
   '<button class="toend" id="toEnd" type="button" aria-label="Jump to end">&darr;</button>',
   '<button class="toend" id="toEnd" type="button" aria-label="Jump to end">&darr;<span>end</span></button>',
   'arrow and no words', undefined, {id:'m0155'}],

  ['an icon-only button loses the name a screen reader reads',
   'aria-label="Back to top" hidden>&uarr;</button>',
   'hidden>&uarr;</button>',
   'name a screen reader reads', undefined, {id:'m0156'}],

  ['the arrow stops scaling with the text-size control',
   "    font-family:var(--sans);font-size:calc(17px*var(--fs,1));line-height:1;padding:0;",
   "    font-family:var(--sans);font-size:17px;line-height:1;padding:0;",
   'arrow scales with the text-size control', undefined, {id:'m0157'}],

  /* --- text size on body, and the row stepping over the timer, 16 Sep --- */
  ['--fs goes back to being scoped to main, leaving every overlay unscaled',
   "  body{--fs:1}",
   "  main{--fs:1}",
   'declared once, on body', undefined, {id:'m0158'}],

  ['main multiplies an em by --fs again, so the reading text scales twice',
   "  body.fs-xl{--fs:1.4}",
   "  body.fs-xl{--fs:1.4}\n  main{font-size:calc(1em*var(--fs))}",
   'multiplies an em by --fs', undefined, {id:'m0159'}],

  ['the jump row stops stepping over the timer and lands on it again',
   "    row.classList.toggle('above', up);",
   "    row.classList.toggle('above', false);",
   'steps above the floating timer', undefined, {id:'m0160'}],

  ['the timer height is kept after it is hidden, so the row floats above nothing',
   "    const h = up ? Math.round(miniT.getBoundingClientRect().height) : 0;",
   "    const h = Math.round(miniT.getBoundingClientRect().height);",
   'drops back down when the timer goes away', undefined, {id:'m0161'}],

  ['main stops leaving room for the timer under the jump row',
   "    main{padding-bottom:calc(var(--jumph, 66px) + var(--minih, 0px) + 26px + env(safe-area-inset-bottom))}",
   "    main{padding-bottom:calc(var(--jumph, 66px) + 16px + env(safe-area-inset-bottom))}",
   'of the timer under it', undefined, {id:'m0162'}],

  /* --- Gemini round 5, 16 Sep --- */
  ['2023-06 q100 source picks up q101-104 again',
   "\u05d4\u05d6\u05d0\u05e8\u05d3 \u05e2\u05de\u05d5\u05d3620 \u05d8\u05d1\u05dc\u05d442-2\",",
   "\u05d4\u05d6\u05d0\u05e8\u05d3 \u05e2\u05de\u05d5\u05d3620 \u05d8\u05d1\u05dc\u05d442-2 101\u05d4\u05e8\u05d9\u05e1\u05d5\u05df357\",",
   'stops at its own table', undefined, {id:'m0163'}],

  ['2020 q19 source loses the rest of the pocket-guide title',
   "\u05de\u05d0\u05de\u05e8POCKET GUIDE TO THE AGS BEERS 2019",
   "\u05de\u05d0\u05de\u05e8POCKET GUIDE TO THE",
   'whole pocket-guide title', undefined, {id:'m0164'}],

  ['2020 q20 source takes back q19\u2019s bled tail',
   "\"src\": \"HAZZARD \u05e2\u05de\u05d5\u05d3\u05d9\u05dd702-703\"",
   "\"src\": \"19 AGS BEERS 20HAZZARD \u05e2\u05de\u05d5\u05d3\u05d9\u05dd702-703\"",
   'starts at HAZZARD', undefined, {id:'m0165'}],

  ['a font size goes back to a bare px that the text-size control cannot reach',
   "  #miniT .mode{font-size:calc(11px*var(--fs,1));",
   "  #miniT .mode{font-size:11px;",
   'no font size is a bare px value', undefined, {id:'m0166'}],

  ['focus arriving on a faded row no longer brings it back',
   "  if(row) row.addEventListener('focusin', ()=>{\n    clearTimeout(settle); row.classList.remove('fade'); faded = false;\n  });",
   "  void 0;",
   'focus arriving on a faded jump button', undefined, {id:'m0167'}],

  /* --- bracket fixes read from the IMA papers, 16 Sep --- */
  ['2023-06 q72 option 4 loses the paper\u2019s bracket again',
   "\u05d1 - DPI (DRY POWDER INHALER)",
   "\u05d1 - DPI DRY POWDER INHALER))",
   'carries the paper\u2019s bracket: DPI', undefined, {id:'m0168'}],

  ['2020 q90 option 1 loses the paper\u2019s bracket again',
   "METRONIDAZOLE (FLAGYL) \u05e4\u05d5\u05de\u05d9",
   "METRONIDAZOLE FLAGYL) )\u05e4\u05d5\u05de\u05d9",
   'carries the paper\u2019s bracket: METRONIDAZOLE', undefined, {id:'m0169'}],

  /* --- outside review, 16 Sep --- */
  ['search highlighting goes back to one replace per word, marking its own markup',
   "    if(words.length) snip = snip.replace(\n      new RegExp(words.map(w=>esc(escHtml(w))).sort((a,b)=>b.length-a.length).join('|'), 'gi'),\n      m=>`<mark>${m}</mark>`);",
   "    for(const w of words) snip = snip.replace(new RegExp(esc(escHtml(w)), 'gi'), m=>`<mark>${m}</mark>`);",
   'search highlighting survives a second word that matches the markup it injects: "delirium mark"', undefined, {id:'m0170'}],

  /* --- v21 dark palette, 16 Sep --- */
  ['dark accent reverts to the too-bright pre-audit amber',
   '--c-now:#E59835 !important;',
   '--c-now:#FFA92E !important;',
   'dark palette hex values are pinned', undefined, {id:'m0171'}],

  ['dark body text reverts to the pre-audit cream',
   '--ink:#E6E1DC !important;',
   '--ink:#F6EFE6 !important;',
   'dark palette hex values are pinned', undefined, {id:'m0172'}],

  ['the v19 dossier override collapses dark --surface back onto --paper',
   '--surface: #2D2C2B !important;',
   '--surface: var(--paper) !important;',
   'the v19 dossier override no longer collapses dark --surface onto --paper', undefined, {id:'m0173'}],

  ['the three dashboard tiles go back to near-black text in dark mode',
   'body.dark #week .today .acts .act,body.dark #week .today .acts .act b,body.dark #week .today .acts .act span{color:var(--ink)}',
   'body.dark #week .today .acts .act,body.dark #week .today .acts .act b,body.dark #week .today .acts .act span{color:#12161a}',
   'dark mode outlines the three dashboard tiles', undefined, {id:'m0174'}],

  ['"Mark today done" loses its dark-mode outline and goes back to a solid amber fill',
   'body.dark #week #tdBtn:not([data-on="1"]) {\n  background: var(--surface) !important;\n  border-color: var(--c-now) !important;\n  color: var(--ink) !important;\n}',
   '',
   'dark mode outlines "Mark today done"', undefined, {id:'m0175'}],

  /* --- v24 chapter-end stack, 16 Sep --- */
  ['the chapter footer stops wrapping drill/past-questions in the two-up row div',
   '\'<div class="secrow2">\' +',
   '\'\' +',
   'the chapter-end footer is one stack', undefined, {id:'m0176'}],

  ['the chapter footer stops wrapping print/backup/home in the quiet-row div',
   '\'<div class="secquiet">\' +',
   '\'\' +',
   'quiet print/backup/home row', undefined, {id:'m0177'}],

  ['"mark as read" goes back to a solid green fill once checked instead of a quiet outline',
   '.secfoot > button.mark.readon{ background:none !important; border-color:var(--start) !important;\n  color:var(--start) !important; }',
   '',
   'styled as a quiet outline once checked', undefined, {id:'m0178'}],

  ['the drill/past-questions row loses its equal-width flex layout',
   '.secfoot .secrow2{ display:flex !important; gap:10px !important; }',
   '.secfoot .secrow2{ display:block !important; }',
   'equal two-up row', undefined, {id:'m0179'}],

  ['"Next: <chapter>" loses its accent fill and reads as a plain box again',
   '.secfoot > button.nx{ width:100%; font-family:var(--sans) !important; font-weight:700 !important;\n  border-radius:4px !important; padding:12px 16px !important; min-height:48px !important;\n  background:var(--accent) !important; border-color:var(--accent) !important; color:var(--paper) !important;\n  letter-spacing:0 !important; text-transform:none !important; }',
   '.secfoot > button.nx{ width:100%; }',
   'full-width accent action', undefined, {id:'m0180'}],

  ['the middot separator between print/backup/home disappears',
   '.secfoot .secquiet button + button::before{ content:\'\\00b7\'; margin-inline-end:8px; display:inline-block; text-decoration:none; }',
   '',
   'middot separators', undefined, {id:'m0181'}],

  ['the next-chapter button reverts to the old "next this week:" wording',
   "b.dataset.go = nxt; b.textContent = 'Next: ' + (rb.dataset.short || rb.firstChild.textContent.trim()) + ' \\u2192'; }",
   "b.dataset.go = nxt; b.textContent = 'next this week: ' + (rb.dataset.short || rb.firstChild.textContent.trim()) + ' \\u2192'; }",
   'old "next this week:" wording', undefined, {id:'m0182'}],

  /* --- v24 chapter-end stack, Codex review on #431 --- */
  ['the past-questions button carries the .pq card’s 26px bottom margin into the two-up row again',
   '.secfoot .secrow2 button{ flex:1 1 0; width:auto !important; margin:0 !important;',
   '.secfoot .secrow2 button{ flex:1 1 0; width:auto !important;',
   'Codex #431', undefined, {id:'m0183'}],

  ['the next-chapter button loses its reset of the inherited "next up" grid layout',
   '.secfoot > button.nx:not([hidden]){ display:flex !important; align-items:center !important; justify-content:center !important; }',
   '',
   'resets the inherited "next up" grid layout', undefined, {id:'m0184'}],

  ['the middot separator loses its own formatting context and inherits the button’s underline again',
   ".secfoot .secquiet button + button::before{ content:'\\00b7'; margin-inline-end:8px; display:inline-block; text-decoration:none; }",
   ".secfoot .secquiet button + button::before{ content:'\\00b7'; margin-inline-end:8px; text-decoration:none; }",
   'its own formatting context', undefined, {id:'m0185'}],

  /* --- v25 dark leftovers, next round --- */
  ['the timer Start/Resume button reverts to a solid amber fill with near-black text in dark mode',
   'body.dark #week #tGo{ background:var(--surface) !important; border:1px solid var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines the timer Start/Resume button', undefined, {id:'m0186'}],

  ['the quick-log button reverts to a solid amber fill with near-black text in dark mode',
   'body.dark #week #qLog{ background:var(--surface) !important; border:1px solid var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines the quick-log button', undefined, {id:'m0187'}],

  ['the quick-log button’s dark outline goes back to border-color-only, invisible against its own border:none rule',
   'body.dark #week #qLog{ background:var(--surface) !important; border:1px solid var(--c-now) !important; color:var(--ink) !important; }',
   'body.dark #week #qLog{ background:var(--surface) !important; border-color:var(--c-now) !important; color:var(--ink) !important; }',
   'dark mode outlines the quick-log button the same way, with a real border (its own rule sets border:none, so border-color alone would be invisible)', undefined, {id:'m0188'}],

  ['a pressed filter pill reverts to a solid amber fill with near-black text in dark mode',
   'body.dark .pf button[aria-pressed="true"]{ background:var(--surface) !important; border-color:var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines a pressed filter pill', undefined, {id:'m0189'}],

  ['the mock’s start button reverts to a solid amber fill with near-black text in dark mode',
   'body.dark .pf button.mockgo{ background:var(--surface) !important; border-color:var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines the mock’s start button', undefined, {id:'m0190'}],

  ['the down jump button (.toend) loses its dark outline and goes back to the broken ink-fill/near-black-text state',
   'body.dark .toend{ background:var(--surface) !important; color:var(--ink) !important; border:1px solid var(--rule) !important; }',
   '',
   'the same dark outline the up button', undefined, {id:'m0191'}],

  /* --- v26 header, next round --- */
  ['a live selection no longer freezes the header’s auto-hide',
   "if(typeof hdrSetFrozen === 'function') hdrSetFrozen(up);",
   '',
   'clearing the selection un-freezes the header’s auto-hide', undefined, {id:'m0192'}],

  ['the docked highlight bar stops re-anchoring to the top when the header is hidden',
   'body.hdr-hidden #hlBar{ top:env(safe-area-inset-top) !important; }',
   '',
   're-anchors to the very top', undefined, {id:'m0193'}],

  ['the header stops sliding out of view on scroll-down',
   'body.hdr-hidden nav{ transform:translateY(-100%) !important; }',
   '',
   'slides out of view on scroll-down', undefined, {id:'m0194'}],

  ['the chapter-top meta line loses its 44px/12px-gap tap targets',
   '.ch-actions{ gap:12px !important; }\n.ch-actions .ebgo{ min-height:44px !important; }',
   '',
   '44px tap targets with 12px gaps', undefined, {id:'m0195'}],

  ['the header auto-hide threshold drops from 60px to 0, showing the header nowhere near the top',
   'if(y < 60) return false;',
   'if(y < 0) return false;',
   'near the top (<60px) the header always shows', undefined, {id:'m0196'}],

  /* --- Gemini/Eias phone check of #432+#433, next round --- */
  ['the search icon SVG loses its explicit 24px sizing and falls back to the browser default',
   '.anchorbar .srchbtn svg{ width:24px; height:24px; flex:none; }',
   '',
   'an inline SVG stroked with currentColor', undefined, {id:'m0197'}],

  ['the tappable title goes back to the monospace technical-ledger voice',
   '.topicbtn{ font-family:var(--sans) !important; letter-spacing:0 !important; text-transform:none !important; }',
   '',
   'the plain sans heading font', undefined, {id:'m0198'}],

  ['the header freeze moves back into the debounced timeout, arriving 260ms late (Gemini review of #433)',
   "  document.addEventListener('selectionchange', ()=>{\n    /* the freeze itself cannot wait for the 260ms debounce below: an Android drag-handle\n       micro-scroll inside that window could still hide or show the header mid-selection,\n       before place()/paintChrome() ever runs. A non-collapsed selection freezes the header\n       synchronously, right here; the debounce still owns positioning the bar and unfreezing\n       once the selection actually clears (Gemini review of #433). */\n    const sel = window.getSelection();\n    if(sel && !sel.isCollapsed && typeof hdrSetFrozen === 'function') hdrSetFrozen(true);\n    clearTimeout(tmr); tmr = setTimeout(place, 260);\n  });",
   "  document.addEventListener('selectionchange', ()=>{ clearTimeout(tmr); tmr = setTimeout(place, 260); });",
   'freezes synchronously on selectionchange, before the 260ms debounce', undefined, {id:'m0199'}],

  ['the topics button’s aria-label comes back and hides its visible text from screen readers again (WCAG 2.5.3 label-in-name, Gemini review of #433)',
   '<button class="topicbtn" id="topicBtn" type="button" aria-haspopup="dialog" aria-describedby="topicBtnDesc">',
   '<button class="topicbtn" id="topicBtn" type="button" aria-haspopup="dialog" aria-describedby="topicBtnDesc" aria-label="Jump to topics">',
   'carries no aria-label that would hide its visible text', undefined, {id:'m0200'}],

  ['the header no longer makes the nav inert while hidden, so its buttons stay focusable off-screen (Gemini review of #433)',
   '    const nav = document.querySelector(\'nav\');\n    if(nav) nav.inert = hdrHidden;',
   '',
   'makes the nav inert, out of the tab order and the accessibility tree', undefined, {id:'m0201'}],

  ['the header hides even while focus sits inside it, dropping focus to <body> mid-navigation (Gemini review of #433)',
   "    if(next && !hdrHidden){\n      const nav = document.querySelector('nav');\n      if(nav && document.activeElement && nav.contains(document.activeElement)) return;\n    }",
   '',
   'never hides while focus is inside it', undefined, {id:'m0202'}],

  ['the nav stays inert forever when the viewport leaves the mobile breakpoint while the header is hidden, e.g. tablet rotation (Codex P1 review of #439)',
   '    if(!mq.matches && hdrHidden){ hdrHidden = false; apply(); }',
   '',
   'restores the shown, non-inert nav', undefined, {id:'m0203'}],
  ['lastY does not track the live scroll position while frozen or off the mobile breakpoint, so the first scroll after unfreezing can wrongly flip the header (Gemini review of #439/#440)',
   'if(hdrFrozen || !mq.matches){ lastY = y; return; }',
   'if(hdrFrozen || !mq.matches){ return; }',
   'wrongly flip the header', undefined, {id:'m0204'}],
  ['the topics button loses its aria-describedby, so a screen reader no longer hears what the control does (Gemini review of #439/#440)',
   ' aria-describedby="topicBtnDesc"',
   '',
   'aria-describedby pointing at hidden text', undefined, {id:'m0205'}],
  ['a mock running underneath the practice keydown listener also answers/advances the background practice question, polluting pqDone (Gemini site-wide audit)',
   "  if(mockOn) return;\n  /* the topic sheet",
   "  /* the topic sheet",
   'while a mock is running, pressing 1-4/n does not also answer or advance the background practice question', undefined, {id:'m0206'}],
  ['the drill summary injects a missed card’s text into innerHTML unescaped, so a raw < in the text starts an unintended tag (Gemini site-wide audit)',
   "rMissed.map(i=>'<li>'+escHtml(QS[i][0])+'</li>')",
   "rMissed.map(i=>'<li>'+QS[i][0]+'</li>')",
   'is escaped in the drill summary', undefined, {id:'m0207'}],
  ['the day dots stop repainting when a day is marked, so the last-14-days strip goes stale (Gemini site-wide audit — this guard used to assert NodeList.length >= 0, which cannot fail)',
   "document.getElementById('dots').innerHTML = w.map(d=>",
   "void 0; w.map(d=>",
   'repaints the dots strip', undefined, {id:'m0208'}],
  ['rememberScroll stops capturing the live scroll position for the shown section (Gemini site-wide audit — the old test referenced rememberScroll without calling it, so this was never exercised)',
   'scrollAt[cur.id] = window.scrollY;',
   'scrollAt[cur.id] = 0;',
   'rememberScroll captures the current scroll position', undefined, {id:'m0209'}],
  ['the fabricated "should heal within 50 days" clause comes back into the pressure-injury body text, contradicting the 60-day figure in the sentence right before it (SZMC chat correction, Hazzard ch 46)',
   '    only 17% of stage 3 or 4</b>. A full-thickness injury',
   '    only 17% of stage 3 or 4</b>. A stage 2 should heal within 50 days; a full-thickness injury',
   'no fabricated 50-day figure', undefined, {id:'m0210'}],
  ['an exam header/footer stamp is glued back onto a past-paper option — the general shape, not just the 2024-05 date already fixed (Gemini review of merged #449)',
   `"שיווי משקל לקוי"]`,
   `"שיווי משקל לקוי שלב א' בגריאטריה28/5/2024 100 שאלות– מסלול על"]`,
   'header/footer stamp', undefined, {id:'m0211'}],
  ['the Beers/STOPP conflict-table lede’s leading number stops matching the table’s actual row count (Gemini review of merged #449: the guard now tests the relationship, not a pinned "Six"/6 literal)',
   '<p class="lede">Six places the two tools give different answers.',
   '<p class="lede">Four places the two tools give different answers.',
   'Beers/STOPP table', undefined, {id:'m0212'}],
  ['the non-textbook-sources prose’s leading number stops matching the table’s distinct question count (Gemini review of merged #449: the guard now tests the relationship, not a pinned "19 of 100" literal)',
   '<p class="note">19 of 100 questions come from material no textbook contains.',
   '<p class="note">Fourteen of 100 questions come from material no textbook contains.',
   'distinct question count', undefined, {id:'m0213'}],
  ['1-4/n keys bleed through to the background practice question while the topic sheet (or any modal) is open over #papers (SZMC code audit)',
   "  if(!SHEET.hidden) return;\n  if(document.body.classList.contains('tm-open')) return;\n  if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;",
   "  if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;",
   'topic sheet is open over #papers', undefined, {id:'m0214'}],
  ['opening the topic sheet no longer moves focus into it, stranding a keyboard user on the page underneath (SZMC code audit)',
   `function openSheet(){ SHEET.hidden=false; document.body.style.overflow='hidden'; document.getElementById('sheetClose').focus(); }`,
   `function openSheet(){ SHEET.hidden=false; document.body.style.overflow='hidden'; }`,
   'opening the topic sheet moves focus into it', undefined, {id:'m0215'}],
  ['opening the backup/restore modal no longer moves focus into it (SZMC code audit)',
   "  document.getElementById('bkClose').focus();\n  await bkFill();",
   '  await bkFill();',
   'backup/restore modal moves focus', undefined, {id:'m0216'}],
  ['editing an EXISTING highlight note no longer moves focus into the modal, only a brand-new one does (SZMC code audit)',
   "  document.getElementById('hlModal').hidden = false; document.body.classList.add('tm-open');\n  /* focus used to move into the modal only for a brand-new note (!h.n) — editing an existing\n     one left focus behind on the page underneath, same bug as the other modals */\n  document.getElementById('hlText').focus();",
   "  document.getElementById('hlModal').hidden = false; document.body.classList.add('tm-open');\n  if(!h.n) document.getElementById('hlText').focus();",
   'existing highlight note', undefined, {id:'m0217'}],
  ['the chapter-index "notes" buttons lose their per-chapter aria-label and go back to sharing one indistinguishable name (SZMC code audit)',
   `<button type="button" class="chgo" data-sec="biology" aria-label="Biology of Aging and Longevity — notes">notes</button>`,
   `<button type="button" class="chgo" data-sec="biology">notes</button>`,
   'own aria-label naming the chapter', undefined, {id:'m0218'}],
  ['SVG <text> elements inside role="img" charts stop being aria-hidden, so a screen reader reads every axis tick alongside the chart’s own label (SZMC code audit)',
   `<text aria-hidden="true" x="118" y="50" font-size="11.5" fill="var(--stop)" font-family="sans-serif">`,
   `<text x="118" y="50" font-size="11.5" fill="var(--stop)" font-family="sans-serif">`,
   'is aria-hidden', undefined, {id:'m0219'}],
  ['the "v12 — dashboard redesign" CSS header comment is duplicated again, the way it used to be before the stale first copy was deleted (SZMC code audit)',
   `  /* ===================== v12 — dashboard redesign ===================== */`,
   `  /* ===================== v12 — dashboard redesign ===================== */\n  /* ===================== v12 — dashboard redesign ===================== */`,
   'CSS block is not duplicated', undefined, {id:'m0220'}],
  ['geri:mockrun drops back out of BKEYS, so a backup captures a finished mock but silently drops a half-finished one (ChatGPT third-model audit)',
   `'geri:pq','geri:mock','geri:mockrun','geri:hl'`,
   `'geri:pq','geri:mock','geri:hl'`,
   'in-progress mock key is in the backup set', undefined, {id:'m0221'}],
  ['paintLastMock stops escaping the stored right/n/when fields, so a crafted value renders as markup instead of text (ChatGPT third-model audit)',
   `el.innerHTML = 'Last mock: <b>' + escHtml(v.right) + ' / ' + escHtml(v.n) + '</b> (' +
      Math.round(v.right/v.n*100) + '%) on ' + escHtml(v.when) + '.';`,
   `el.innerHTML = 'Last mock: <b>' + v.right + ' / ' + v.n + '</b> (' +
      Math.round(v.right/v.n*100) + '%) on ' + v.when + '.';`,
   'crafted when/right value', undefined, {id:'m0222'}],
  ['the saved-tab restore stops checking for a deep-link hash first, so it races the hash router again and can land a reader on the wrong tab (ChatGPT third-model audit)',
   `    if(location.hash.slice(1)) return;\n    const r = await window.storage.get('geri:tab');`,
   `    const r = await window.storage.get('geri:tab');`,
   'wins over a saved tab', undefined, {id:'m0223'}],
  ['every content section’s header band is inserted into the first <main section> instead of its own, piling every band onto one section and leaving the rest with none (ChatGPT round-2 audit: the old total-count check could not see this — 40 bands, 40 sections, still true)',
   `      });\n    });\n    sec.insertBefore(e, sec.firstChild);\n  });\n  document.addEventListener('click', ev=>{`,
   `      });\n    });\n    document.querySelector('main section').insertBefore(e, document.querySelector('main section').firstChild);\n  });\n  document.addEventListener('click', ev=>{`,
   'owns exactly one header band', undefined, {id:'m0224'}],
  ['chapterPaperPool stops requiring the Hazzard book, so a Harrison/Article/other record whose chapter number collides with a Hazzard chapter joins that chapter’s past-paper pool (ChatGPT third-model audit round 3, reproduces the real 2024-09 Q69 finding)',
   `  return PQ.filter(p=>p.bk==='Hazzard' && p.ch && chs.indexOf(p.ch) >= 0 && OLDED.indexOf(p.y) < 0);`,
   `  return PQ.filter(p=>p.ch && chs.indexOf(p.ch) >= 0 && OLDED.indexOf(p.y) < 0);`,
   'does not enter that section’s past-paper pool', undefined, {id:'m0225'}],
  ['the past-paper chapter-constrained filter stops requiring the Hazzard book, so a colliding non-Hazzard record passes the chapter-index "open the notes" flow’s filter too (ChatGPT third-model audit round 3)',
   `    p = p.filter(x=>x.ch && x.bk==='Hazzard' && chs.indexOf(x.ch) >= 0 && OLDED.indexOf(x.y) < 0);`,
   `    p = p.filter(x=>x.ch && chs.indexOf(x.ch) >= 0 && OLDED.indexOf(x.y) < 0);`,
   'chapter-constrained filter', undefined, {id:'m0226'}],
  ['the pqStats weak-chapter aggregation goes back to keying by[] on any book’s chapter number, so a Harrison/Article record with a colliding chapter number is attributed to the wrong Hazzard chapter in the weak-chapters analytics (ChatGPT third-model audit round 3)',
   `    if(!x.ch || x.bk!=='Hazzard' || OLDED.indexOf(x.y) >= 0) return;`,
   `    if(!x.ch || OLDED.indexOf(x.y) >= 0) return;`,
   'weak-chapter aggregation only attributes', undefined, {id:'m0227'}],
  ['mergeSave goes back to applying its stale snapshot unconditionally, so a highlight/note edit made while an earlier save is still writing gets silently overwritten in memory (ChatGPT third-model audit round 4, data-loss cluster item 1)',
   `      movedOn = JSON.stringify(nowMine) !== JSON.stringify(mine);
      apply(movedOn ? mergeFn(merged, mine, nowMine) : merged);`,
   `      apply(merged);`,
   'a highlight added while an earlier save is still writing survives in both memory and on disk', undefined, {id:'m0228'}],
  ['mergeSave stops queueing a follow-up save when the live value moved on mid-write, so that edit reaches memory but is never actually persisted to disk (ChatGPT third-model audit round 4, data-loss cluster item 1)',
   `    if(movedOn) mergeSave(key, getMine, mergeFn, apply).then(resolveResult);
    else resolveResult(landed);`,
   `    resolveResult(landed);`,
   'a highlight added by mutating HL.falls in place (the real edit path, not a reassignment) while an earlier save is still writing survives in both memory and on disk, against pre-existing stored data', undefined, {id:'m0229'}],
  ['mergeSave stops re-checking storage right before it writes, so another tab’s confirmed write landing between our read and our write is silently overwritten (ChatGPT third-model audit round 4, data-loss cluster item 2, "two tabs")',
   `    try{
      const r2 = await window.storage.get(key);
      if(r2 && r2.value !== JSON.stringify(stored)){
        const fresh = JSON.parse(r2.value);
        if(fresh && typeof fresh === 'object'){ stored = fresh; merged = mergeFn(stored, seen, mine); }
      }
    }catch(e){}`,
   ``,
   'confirmed by another tab', undefined, {id:'m0230'}],
  ['pqSave goes back to a single-key full overwrite of the whole past-paper progress blob instead of merging, so two tabs answering different questions keep only whichever tab wrote last (ChatGPT third-model audit round 4, data-loss cluster item 7)',
   `function pqSave(){ return mergeSave(PKEY, ()=>pqDone, mergePQ, merged=>{ pqDone = merged; }); }`,
   `function pqSave(){ try{ window.storage.set(PKEY, JSON.stringify(pqDone)); }catch(e){} }`,
   'another tab is not overwritten', undefined, {id:'m0231'}],
  ['the mock Resume handler stops re-reading RUNKEY at click time, so it resumes from the boot-time snapshot again and can roll a run backward (ChatGPT third-model audit round 4, data-loss cluster item 3)',
   `    let fresh = v;
    try{ const r = await window.storage.get(RUNKEY); const f = JSON.parse(r.value); if(f && f.q && f.q.length) fresh = f; }catch(e){}`,
   `    let fresh = v;`,
   'not the boot-time snapshot', undefined, {id:'m0232'}],
  ['mockSaveRun stops rejecting a stale writer, so a checkpoint for a run another tab has already superseded overwrites that tab’s record instead of standing down (ChatGPT third-model audit round 4, data-loss cluster item 3)',
   `      const expected = mockRunClaimed ? mockRunId : mockRunObservedId;
      if(curId !== expected){ if(mockOn) mockRunSuperseded(); return; }`,
   `      const expected = mockRunClaimed ? mockRunId : mockRunObservedId;`,
   'superseded by another tab', undefined, {id:'m0233'}],
  /* "mockSaveRun stops serializing its checkpoint writes through mockRunChain" (de-chaining
     it to Promise.resolve().then(...) instead) is retired: with the per-write ownership
     re-check added for the Codex round-4 follow-up (mockRunClaimed flips true on whichever
     write actually lands, and that flip is read fresh by name — not cached — the next time
     any pending write's own turn comes up), de-serializing this no longer reproduces a
     dropped answer in the "cannot land after" scenario below; confirmed MISSED, not a live
     guard. Left documented rather than silently deleted so a future reader does not
     reintroduce a distinguishing test that no longer distinguishes anything. */

  ['mockFinish stops clearing RUNKEY through mockRunChain and fires the clear on its own instead, so a checkpoint write already queued ahead of it can land after and resurrect the just-finished run (ChatGPT third-model audit round 4, data-loss cluster item 6)',
   `    mockRunChain = mockRunChain.then(async()=>{
      /* the several awaits above (pqSave/saveML/MKKEY) leave a real window for another tab`,
   `    mockRunChain = Promise.resolve().then(async()=>{
      /* the several awaits above (pqSave/saveML/MKKEY) leave a real window for another tab`,
   'clears RUNKEY through mockRunChain', undefined, {id:'m0234'}],
  ['the mock-exam weak-chapter report goes back to keying byCh on any book’s chapter number (ChatGPT third-model audit round 3)',
   `    if(r.p.ch && r.p.bk==='Hazzard' && r.given){ byCh[r.p.ch] = byCh[r.p.ch] || [0,0]; byCh[r.p.ch][1]++; if(r.ok) byCh[r.p.ch][0]++; }`,
   `    if(r.p.ch && r.given){ byCh[r.p.ch] = byCh[r.p.ch] || [0,0]; byCh[r.p.ch][1]++; if(r.ok) byCh[r.p.ch][0]++; }`,
   'mock-exam weak-chapter report only attributes', undefined, {id:'m0235'}],
  ['mergeSave stops cloning its "mine" snapshot, so an in-place mutation of the live HL/SN object (the real edit path — hlNote’s h.n=text, hlAdd’s array push, notesPaint’s SN[id]=...) during an in-flight save is invisible to the moved-on check, comparing the live object to itself (Codex review of #456)',
   `    const mine = JSON.parse(JSON.stringify(getMine()));`,
   `    const mine = getMine();`,
   'mutating HL.falls in place', undefined, {id:'m0236'}],
  ['mockFinish stops checking run ownership before clearing RUNKEY, so a brand-new run started (and checkpointed) while this finish was still awaiting its own writes gets its record erased instead of the run this call actually finished (Codex review of #456)',
   `          if(!cur || cur.id !== finishingId) return;
          await window.storage.set(RUNKEY, '');`,
   `          await window.storage.set(RUNKEY, '');`,
   'does not clear a different run', undefined, {id:'m0237'}],
  ['refreshBody stops advancing PQSEEN when it reloads past-paper progress, so every entry the refresh introduces looks like a local addition forever and the next save reasserts it over whatever another tab wrote afterward (Codex review of #456)',
   `      let seen = {}; try{ seen = JSON.parse(PQSEEN); }catch(e){}
      pqDone = mergePQ(v, seen, pqDone); PQSEEN = JSON.stringify(v);`,
   `      pqDone = v;`,
   'advances PQSEEN to the value it just read', undefined, {id:'m0238'}],
  ['the mock Resume handler stops reapplying the expired-run normalisation to its own fresh re-read, so clicking Resume on an already-expired run immediately auto-grades and clears it instead of resuming untimed as the banner promised (Codex review of #456)',
   `    if(fresh.e && fresh.e < Date.now()){ fresh = Object.assign({}, fresh, {e: 0, t: 0}); }`,
   ``,
   'does not immediately auto-grade', undefined, {id:'m0239'}],
  ['sectionForChapter stops coercing its argument to a number, so a string chapter key (Object.keys() of a tally object always hands back strings) misses every real SECCH match and silently falls back to the wrong, one-chapter-per-section CHFALLBACK mapping (ChatGPT third-model audit round 5)',
   `  n = Number(n);
  if(!Number.isInteger(n) || n <= 0) return '';
  secChapters('');`,
   `  secChapters('');`,
   'agrees on a string and a number form', undefined, {id:'m0240'}],
  ['chapter 22\'s chapter-index row goes back to the wrong section (data-sec="beers" instead of "pharm"), so once sectionForChapter\'s numeric lookup works it routes straight to the guideline-only Beers section instead of chapter 22\'s real home (Codex review of #457)',
   `Medication Prescribing and De-Prescribing <button type="button" class="chgo" data-sec="pharm"`,
   `Medication Prescribing and De-Prescribing <button type="button" class="chgo" data-sec="beers"`,
   'routes to pharm, not the guideline-only beers section', undefined, {id:'m0241'}],
  ['withLock stops actually taking a cross-tab lock and always runs its callback directly, so another tab\'s write landing in the gap between a re-check and the actual set() is silently overwritten instead of queued behind it (ChatGPT audit of #456/#457/#458 against ACCEPTANCE-round5.md, XANN, STALE3/STALE4)',
   `function withLock(name, fn){
  if(typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) return navigator.locks.request(name, fn);
  return fn();
}`,
   `function withLock(name, fn){
  return fn();
}`,
   'two genuinely concurrent tabs saving different sections', undefined, {id:'m0242'}],
  ['mockSaveRun stops merging its own changed answers/flags onto whatever is on disk, and goes back to sending its whole local snapshot as an unconditional overwrite, so a second tab\'s answers to different questions on the same run are erased instead of merged (ChatGPT audit against ACCEPTANCE-round5.md, STALE6)',
   /* re-anchored after the Codex-review-of-#459 fixes rewrote these two lines (ownership-scoped
      merge, and a cursor that is no longer a high-water mark). Same property guarded, same
      needle — only the text it attaches to moved. */
   `      const mergedAF = mergeMockAnswers(sameRun ? cur : null, seen, mineAns, mineFlag);`,
   `      const mergedAF = {a: mineAns, f: mineFlag};`,
   'two-tabs-both-resumed', undefined, {id:'m0243'}],
  ['newRunId stops trying crypto.randomUUID and goes straight back to Date.now()+Math.random(), which is not collision-proof under a frozen clock and a repeated RNG sequence (ChatGPT audit against ACCEPTANCE-round5.md, ID2)',
   `function newRunId(){
  if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now() + '-' + Math.random().toString(36).slice(2);
}`,
   `function newRunId(){
  return Date.now() + '-' + Math.random().toString(36).slice(2);
}`,
   'still get different ids', undefined, {id:'m0244'}],
  ['mockFinish stops gating the RUNKEY clear on pqSave\'s own result, so a refused geri:pq write still gets the recoverable run cleared right alongside it (Codex CLI\'s independent blind re-audit of main 522d4cf against ACCEPTANCE-round5.md, FIN2/FIN3)',
   `  if(!mlSaved || !mkSaved || !pqSaved) notSaved();`,
   `  if(!mlSaved || !mkSaved) notSaved();`,
   'does not clear RUNKEY when the practice-result', undefined, {id:'m0245'}],
  ['the mock Resume handler goes back to claiming an id-less legacy checkpoint under a freshly minted id, so the first checkpoint reads curId "" against that id and closes the resumed mock as superseded (Codex review of #459)',
   `    mockRunClaimed = !!fresh.id; mockRunObservedId = fresh.id || '';`,
   `    mockRunClaimed = true; mockRunObservedId = mockRunId;`,
   'resumes and migrates instead of being declared superseded', undefined, {id:'m0246'}],
  ['mockSaveRun goes back to merging against whatever record is on disk regardless of whose run it is, so a new mock started over a discarded one inherits that run\'s index-keyed answers onto a different question list (Codex review of #459)',
   `      const mergedAF = mergeMockAnswers(sameRun ? cur : null, seen, mineAns, mineFlag);`,
   `      const mergedAF = mergeMockAnswers(cur, seen, mineAns, mineFlag);`,
   'does not inherit that run’s answers or flags', undefined, {id:'m0247'}],
  ['the checkpoint cursor goes back to being a high-water mark, so walking back through the paper keeps writing the furthest question reached and the next resume opens past where the reader actually was (Codex review of #459)',
   `      const mergedI = mineI;`,
   `      const mergedI = Math.max(mineI, (cur && cur.i) || 0);`,
   'moves the saved cursor back too', undefined, {id:'m0248'}],

  /* ---- red tests for the weak-check rewrites (ChatGPT audit of the SUITE, not the app: ~234
     of 618 checks were weaker than their labels). Each mutation below breaks the behaviour the
     label promises and was confirmed MISSED by the check as it stood and CAUGHT by the rewrite.
     Without these entries the rewrites would be unguarded themselves — a later "simplification"
     could put the tautology back and nothing would notice. ---- */
  ['flushPending goes back to writing section notes on teardown whether or not this tab changed anything, so a background tab holding a stale copy overwrites the note another tab just wrote (class 6: the check that should catch this ended in `return true`)',
   `    if(changed){`,
   `    if(true){`,
   'writes nothing on teardown', undefined, {id:'m0249'}],
  ['bmSet stops recording the text of the block that was marked, so the place has nothing to re-find after the page re-renders and only the section id survives (class 4: the check hand-assigned BM and then read it back, so no app code ran between write and assert)',
   `  BM = {sec: sec.id, t, i, d: nowStamp()};`,
   `  BM = {sec: sec.id, t: '', i, d: nowStamp()};`,
   'a place marked by hand through bmSet is kept', undefined, {id:'m0250'}],
  ['the week-note debounce writes every note under one fixed key instead of the week being viewed, so last week\'s note is what loads next week and the real note is gone (class 2: the check only asked whether the text appeared somewhere in the blob)',
   `  nTmr = setTimeout(async()=>{
    notes[VIEW.k] = nBox.value;`,
   `  nTmr = setTimeout(async()=>{
    notes['week'] = nBox.value;`,
   'note persisted against the week key', undefined, {id:'m0251'}],
  /* the obvious mutation here — loosening the marking itself to `indexOf(...) >= -1` — is no
     good as a red test: it also empties the weak-chapter tally and the blanks breakdown, and the
     suite dies before DONE, which classifyMutant correctly refuses to read as a verdict. This
     one moves ONLY the reported numerator, leaving every other number in the report intact, so
     what it proves is exactly that the numerator is now checked. */
  ['the mock report\'s score counts every question that was answered rather than every one answered right, so a reader who answered all 25 is told they scored 25 (class 2: the check parsed the fraction but accepted any numerator from 0 to 25)',
   `  const right = rows.filter(r=>r.ok).length;`,
   `  const right = rows.filter(r=>r.given).length;`,
   'mock report scores out of the right total', undefined, {id:'m0252'}],
  /* deliberately shaped so the whitelist ARRAY is still there, verbatim, for the structural
     guard to find: the `|| v.fs` after it is what actually decides, so any size a stale phone
     carries is applied again. This is the mutation the file could not see before — the source
     text the old check searched for is untouched. */
  ['the pre-paint script applies whatever size string is in storage, whitelist or not, so a value from a build that is not this one becomes a body class that matches no rule (class 1b: a structural guard whose label promised behaviour, with nothing else in the file covering it)',
   `    if(['s','m','l','xl'].indexOf(v.fs) >= 0) document.body.classList.add('fs-' + v.fs);`,
   `    if(['s','m','l','xl'].indexOf(v.fs) >= 0 || v.fs) document.body.classList.add('fs-' + v.fs);`,
   'refuses one it does not', undefined, {id:'m0253'}],
  /* also invisible to the structural guard beside it: the three regexes that guard this handler
     pin the inModal lookup, the section fallback and the dropped way-back, none of which this
     touches. Only driving the tap sees it. */
  ['an abbreviation tapped inside the table pop-out no longer closes the pop-out first, so the footnote it jumps to scrolls into view behind a full-screen dialog and the reader sees nothing happen (class 1b: a structural guard whose label promised behaviour, with nothing else in the file covering it)',
   `      if(inModal){`,
   `      if(false){`,
   'pop-out closes the dialog', undefined, {id:'m0254'}],

  /* ---- audit.mjs's own gates (runner 'audit'): each break below is one a reviewer verified
     the OLD gate waved through. They are the red tests for those gates as much as they are
     mutations — for a guard file whose whole job is to reject a bad index.html, "feed it a
     deliberately broken input and require the right gate to fail" IS the red test. Each was
     confirmed to pass the pre-fix audit.mjs and fail the fixed one. ---- */
  ['a chapter-index button points at an element that exists but is not a <main section>, which the old getElementById test waved through even though it cannot open as a chapter',
   `data-sec="biology" aria-label="Biology of Aging and Longevity`,
   `data-sec="rail" aria-label="Biology of Aging and Longevity`,
   'dead chapter links', 'audit', {id:'m0255'}],
  ['a schedule item routes to an element id that exists but is not a section — same getElementById blindness as the chapter-index gate, one layer further in',
   `[/ch 43/,'falls','falls']`,
   `[/ch 43/,'rail','falls']`,
   'schedule links that 404', 'audit', {id:'m0256'}],
  ['a card tag is given a display name of a single space: truthy, so the old !TAGNAME[t] gate passed it while the reader saw an unlabelled tag',
   `falls:'43 Falls'`,
   `falls:' '`,
   'card tags missing a display name', 'audit', {id:'m0257'}],
  ['a card answer is ten spaces: length 10, so it cleared the old <10 test and counted as real content',
   `const QS = [`,
   `const QS = [\n ["probe: an answer that is nothing but whitespace", "          "],`,
   'cards with an answer under 10 characters', 'audit', {id:'m0258'}],
  ['a past-paper option is whitespace only: truthy, so the old some(o=>!o) gate read it as real content and never reported the empty tap target',
   `id="pqjson">[{"y": "2020", "n": 1,`,
   `id="pqjson">[{"y": "9999", "n": 1, "q": "probe", "o": ["a", "b", "c", "   "], "a": "\\u05d0", "src": "probe", "bk": "Hazzard"}, {"y": "2020", "n": 1,`,
   'questions with a blank option (unflagged', 'audit', {id:'m0259'}],
  ['a caption and a table that do not belong to each other, in balanced numbers — the exact shape the old count-minus-count gate could not see, since 101 tables minus 101 captions is still 0',
   `</body>`,
   `<div class="cap">Table 999</div><p>not a table</p><div class="tscroll"><table><tbody><tr><td>x</td></tr></tbody></table></div></body>`,
   'tables lacking a caption of their own', 'audit', {id:'m0260'}],
  ['the in-app "an option did not extract cleanly" disclosure is removed, while audit.mjs keeps printing a flagged-option count under a label promising the reader was told',
   `an option did not extract cleanly`,
   `an option did not parse`,
   'the in-app blank-option disclosure still exists', 'audit', {id:'m0261'}],
];

/* MUTANT_ONLY=<comma-separated name substrings> restricts the full (non --static) run to the
   mutations named. --static already runs the whole list cheaply (seconds); the full run patches
   the source and re-runs the suite per mutation, which is what makes it slow, so local commits
   only need the mutations touched this round — CI runs the unfiltered full set. */
const ONLY = (process.env.MUTANT_ONLY || '').split(',').map(s=>s.trim()).filter(Boolean);
const M_FULL = M;
const M_SEL = (!STATIC && ONLY.length) ? M_FULL.filter(([name]) => ONLY.some(s => name.includes(s))) : M_FULL;
/* MUTANT_SHARD=i/N runs every Nth mutation starting at index i, so CI can split the full set
   across N parallel jobs (each on its own runner) instead of one job running all of them.
   Index modulo N partitions the list exactly: shards 0..N-1 together run every mutation once.
   A malformed value fails loudly rather than silently running everything or nothing. */
const SHARD = process.env.MUTANT_SHARD || '';
let M_RUN = M_SEL;
if(!STATIC && SHARD){
  const m = /^(\d+)\/(\d+)$/.exec(SHARD);
  if(!m || +m[2] < 1 || +m[1] >= +m[2]){ console.log('MUTANT_SHARD must be i/N with 0 <= i < N, got ' + JSON.stringify(SHARD)); process.exit(1); }
  M_RUN = M_SEL.filter((_, k) => k % +m[2] === +m[1]);
}
/* a mistyped or renamed selector should fail loudly, not silently run zero mutations and
   report "0 of 0 caught" as a clean exit — that would certify a run that tested nothing (Codex #431) */
if(!STATIC && ONLY.length){
  const unmatched = ONLY.filter(s => !M_FULL.some(([name]) => name.includes(s)));
  if(unmatched.length){
    console.log('MUTANT_ONLY selector(s) matched no mutation: ' + JSON.stringify(unmatched));
    process.exit(1);
  }
  if(!M_RUN.length){ console.log('MUTANT_ONLY matched zero mutations'); process.exit(1); }
}

if(STATIC){
  let bad = 0;
  for(const [name, from] of M){
    const n = src.split(from).length - 1;
    if(n !== 1){ bad++; console.log((n ? 'AMBIG  ' : 'STALE  ') + name); }
  }
  /* A needle that matches no guard label can never be reported as CAUGHT, so the mutation is
     dead weight and the suite is blind where it claims cover. Run 65 lost 17 minutes to
     exactly this: a guard was reworded here and its mutation kept pointing at the old label.
     The target check above would not have noticed — the code it mutates was untouched. */
  /* the suite writes non-ASCII in guard labels as \uXXXX escapes, so decode before comparing
     or every needle holding a real curly apostrophe reports a false miss */
  const decode = s => s.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const suite = decode(fs.readFileSync('test.mjs', 'utf8'));
  /* a mutation whose runner is 'audit' is caught by a gate label in audit.mjs, not by a guard
     label in test.mjs — look its needle up in the file that actually has to catch it, or every
     such entry reports a false NEEDLE against a suite that was never going to contain it. Same
     reasoning for 'browser': its needle lives in browser-check.mjs's own gate labels, not in
     either of the other two files — real-browser checks (real CSS transitions, real computed
     font sizes at a real viewport) that jsdom cannot evaluate at all, so they run separately. */
  const auditSrc = decode(fs.readFileSync('audit.mjs', 'utf8'));
  const browserSrc = decode(fs.readFileSync('browser-check.mjs', 'utf8'));
  const HAY = { audit: { src: auditSrc, file: 'audit.mjs' }, browser: { src: browserSrc, file: 'browser-check.mjs' } };
  for(const [name, , , needle, runner] of M){
    const h = HAY[runner];
    const hay = h ? h.src : suite;
    if(!hay.includes(needle)){ bad++; console.log('NEEDLE ' + name + '  — no ' + (h ? h.file + ' gate' : 'guard') + ' label contains "' + needle + '"'); }
  }
  console.log(M.length + ' mutations, ' + bad + ' stale, ambiguous or unmatched');
  logRun('mutants.mjs --static', { file: SRC, mutations: M.length, unmatched: bad,
    verdict: bad ? 'fail' : 'pass', completed: true });
  process.exit(bad ? 1 : 0);
}
/* Baseline first: a mutation "caught" by a suite that was already red proves nothing. Declared
   here, outside the block below, because the worker loop that classifies each mutation needs
   it too — assigned once, read many times, never recomputed per mutation. */
let BASELINE_PASSES = 0;
/* the id each non-audit/browser mutation resolves to, ONCE, against the baseline — read by
   the worker below, never recomputed per mutant run (see the P1 fix comment inside the block) */
const TARGETS = new Map();
{
  let out = '', status = 0;
  try{ out = execFileSync('node', ['test.mjs', SRC], {encoding:'utf8', env: CHILD_ENV}); status = 0; }
  catch(e){ out = (e.stdout || '') + (e.stderr || ''); status = e.status == null ? 1 : e.status; }
  const base = baselineOk(out, status);
  if(!base.ok){
    console.log('BASELINE IS NOT GREEN — nothing below can be trusted');
    if(status !== 0) console.log('   exit status ' + status + (base.fails.length ? '' : ' (no FAIL line printed — see test.mjs’s own exit code)'));
    base.fails.forEach(f => console.log('   ' + f));
    if(!base.hasDone) console.log('   the run never reached DONE');
    /* recorded as 'incomplete', never 'fail': a red baseline means no mutation was judged at
       all, which is a different thing from mutations having escaped. */
    logRun('mutants.mjs', { file: SRC, verdict: 'incomplete', completed: false,
      reason: 'baseline not green', shard: SHARD || null });
    process.exit(1);
  }
  /* the exact number a mutant's own passes are later judged against — never re-derived per
     mutation, always this one baseline reading, so every mutation in the run is held to the
     same relative bar */
  BASELINE_PASSES = out.split('\n').filter(l => l.startsWith('PASS')).length;
  console.log('baseline green: ' + BASELINE_PASSES + ' checks\n');

  /* Every needle, resolved against the labels the GREEN baseline actually emitted, before a
     single mutation runs.

     `--static` greps the source for a needle and is satisfied when some label contains it.
     That cannot see the worse half of the defect: a needle whose text appears in TWO different
     guards' labels resolves fine statically and then certifies whichever one happened to fail,
     which may not be the guard the mutation was written to exercise. Here the universe of
     labels is the run's own, so "names exactly one guard" is checkable, and a needle that
     names none or names several is reported as what it is — a mutation that can produce no
     verdict — rather than being quietly counted as a pass or a miss for 259 runs.

     test.mjs-run mutations only: the audit runner prints no guard records.

     Review-lane P1 fix: this used to resolve each needle against the baseline ONLY to decide
     whether the preflight passes, then throw the resolved identity away — the worker re-resolved
     from scratch against each MUTANT run's own labels, which is exactly the bug (a mutation that
     makes its own intended guard vanish entirely can resolve UNIQUELY against the survivors,
     and gets credited CAUGHT via a guard that never had anything to do with it). resolveTargetId
     is called ONCE here, per mutation, against this green baseline, and its result — the
     resolved guard's stable ALLOCATED ID, not its label — is what TARGETS below carries into
     the worker. classifyById never re-resolves against the mutant run; it only asks whether a
     record bearing that exact id exists there, and what it says. */
  if(guardRecords(out).guards.length){
    const unresolvable = [];
    for(let i = 0; i < M_RUN.length; i++){
      const [name, , , needle, runner] = M_RUN[i];
      if(runner === 'audit' || runner === 'browser') continue;
      const target = resolveTargetId(out, needle);
      TARGETS.set(i, target);
      if(!target.ok) unresolvable.push({ name, needle, target });
    }
    if(unresolvable.length){
      console.log('NEEDLES THAT NAME NO SINGLE, PROPERLY-IDENTIFIED GUARD — these mutations can produce no verdict:');
      for(const u of unresolvable){
        console.log('  ' + u.target.reason + '  — needle "' + u.needle + '"');
        (u.target.matches || []).slice(0, 3).forEach(m => console.log('      also: "' + m + '"'));
        console.log('      on: ' + u.name.slice(0, 110));
      }
      console.log('\n' + unresolvable.length + ' of ' + M_RUN.length + ' mutations cannot be certified. Nothing below would mean anything.');
      logRun('mutants.mjs', { file: SRC, verdict: 'incomplete', completed: false,
        reason: 'unresolvable needles', unresolvable: unresolvable.length, shard: SHARD || null });
      process.exit(1);
    }
    const viaSubstring = [...TARGETS.values()].filter(t => t.ok && t.how === 'unique substring').length;
    console.log('every needle names exactly one properly-identified guard (' + TARGETS.size + ' checked, ' +
      viaSubstring + ' by unique substring rather than by the full label)\n');
    if(NEEDLES_ONLY){
      logRun('mutants.mjs --needles', { file: SRC, mutations: M_RUN.length,
        via_substring: viaSubstring, verdict: 'pass', completed: true });
      process.exit(0);
    }
  }else if(NEEDLES_ONLY){
    console.log('the baseline emitted no guard records — nothing to resolve needles against');
    process.exit(1);
  }
}

/* In parallel, one temp file per mutation. Sequentially the set had grown to ~30 minutes.
   The first attempt at this (965e9c8) was reverted after three false MISSED results; the cause
   was not contention itself but a quota test in test.mjs that refused background writes and
   let the rejection kill the run at ~329 checks, which only happened when the machine was
   slow. That is fixed in test.mjs, and a run that never reaches DONE is classified
   INCOMPLETE by classifyMutant() (mutants-classify.mjs) before it ever looks at whether a
   FAIL line happened to match — never MISSED, and, since the ChatGPT audit of main ee44f96,
   never CAUGHT either: an unfinished run proves nothing either way. */
const { execFile } = await import('child_process');
const os = await import('os');
const WORKERS = Math.max(1, Math.min(M_RUN.length, +(process.env.MUTANT_WORKERS || os.cpus().length)));
/* Exit status is captured alongside output, mirroring runAudit below — it used to be discarded
   entirely here (`res((stdout||'')+(stderr||''))`, `err` unused), which meant a child that
   printed a clean DONE and ##RUN record but then exited non-zero for a reason those never saw
   (test.mjs's own unhandledRejection handler sets `process.exitCode` without touching FAILS,
   precisely so a late rejection still fails the run) had no way to be caught here — `done` was
   the only completion signal, and it does not know about the exit code. classifyMutant's own
   INCONSISTENT check is what actually uses this; capturing it here is what makes that possible. */
const runSuite = file => new Promise(res => execFile('node', ['test.mjs', file],
  {encoding:'utf8', maxBuffer: 64 * 1024 * 1024, env: CHILD_ENV}, (err, stdout, stderr) =>
    res({ out: (stdout || '') + (stderr || ''), status: err ? (err.code == null ? 1 : err.code) : 0 })));
/* audit.mjs is a guard file too, and its gates exist to catch defects in index.html — exactly
   what a mutation is. But it reports differently from test.mjs: no PASS lines, no DONE line, one
   "FAIL: label, label" summary and a non-zero exit. classifyMutant() requires an exact DONE line,
   so an audit run through it would report INCOMPLETE every time. An entry may therefore carry a
   fifth element, the runner: omit it for the test.mjs default, or pass 'audit' to have the
   mutated file judged by audit.mjs instead. Its exit status is what says whether the gate fired,
   so unlike runSuite this keeps it. */
const runAudit = file => new Promise(res => execFile('node', ['audit.mjs', file],
  {encoding:'utf8', maxBuffer: 64 * 1024 * 1024, env: CHILD_ENV}, (err, stdout, stderr) =>
    res({ out: (stdout || '') + (stderr || ''), status: err ? (err.code == null ? 1 : err.code) : 0 })));
/* browser-check.mjs shares audit.mjs's gate contract (check(), one "FAIL: a, b" summary line,
   non-zero exit) precisely so it can reuse this same dispatch — real Chromium instead of
   jsdom underneath, nothing else different about how a verdict is read. Its own timeout is
   generous: a real browser launch is slower than a jsdom parse, and a mutation that hangs the
   page (rather than erroring it) must still resolve to a verdict, not stall the whole shard. */
const runBrowser = file => new Promise(res => execFile('node', ['browser-check.mjs', file],
  {encoding:'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000, env: CHILD_ENV}, (err, stdout, stderr) =>
    res({ out: (stdout || '') + (stderr || ''), status: err ? (err.code == null ? 1 : err.code) : 0 })));
function classifyAudit(name, needle, r){
  /* the empty-PQ preflight exits 1 before any gate runs; that is a broken fixture, not a verdict */
  if(/^FATAL/m.test(r.out)) return 'INCOMPLETE  ' + name + '  — audit.mjs stopped at its own preflight before reaching any gate; not a verdict';
  if(r.status === 0) return 'MISSED  ' + name;
  const failLine = r.out.split('\n').find(l => l.startsWith('FAIL:')) || '';
  /* a non-zero exit alone is not enough: the mutation has to trip THIS gate, not some unrelated
     one it happened to break on the way past */
  if(!failLine.includes(needle)) return 'MISSED  ' + name + '  — audit.mjs failed, but on "' + failLine.trim() + '", not the gate this mutation targets';
  return 'CAUGHT  ' + name;
}
const results = new Array(M_RUN.length);
let next = 0;
async function worker(){
  while(next < M_RUN.length){
    const i = next++; const [name, from, to, needle, runner] = M_RUN[i];
    const hits = src.split(from).length - 1;
    if(hits === 0){ results[i] = 'STALE  ' + name + '  — the code it mutates has moved; update this mutation'; continue; }
    /* replace() takes the first occurrence only: with two, the mutation may land on dead
       text and leave the live code intact, which reports a blind suite that is not blind */
    if(hits > 1){ results[i] = 'AMBIG  ' + name + '  — target appears ' + hits + ' times; make it unique'; continue; }
    const tmp = '/tmp/mutant-' + process.pid + '-' + i + '.html';
    fs.writeFileSync(tmp, src.replace(from, to));
    if(runner === 'audit'){
      const r = await runAudit(tmp);
      try{ fs.unlinkSync(tmp); }catch(e){}
      results[i] = classifyAudit(name, needle, r);
      continue;
    }
    if(runner === 'browser'){
      const r = await runBrowser(tmp);
      try{ fs.unlinkSync(tmp); }catch(e){}
      results[i] = classifyAudit(name, needle, r);
      continue;
    }
    const { out, status } = await runSuite(tmp);
    try{ fs.unlinkSync(tmp); }catch(e){}
    /* id-keyed, not label-keyed — see the P1 fix comment above the preflight block. TARGETS
       was resolved once against the baseline; classifyMutant (label-keyed, still exported and
       still covered by its own harness-selftest.mjs suite) is no longer the production path. */
    results[i] = classifyById(name, TARGETS.get(i), out, BASELINE_PASSES, status);
  }
}
const t0 = Date.now();
await Promise.all(Array.from({length: WORKERS}, worker));
let bad = 0;
for(const r of results){ console.log(r); if(!r.startsWith('CAUGHT')) bad++; }
if(SHARD) console.log('\n(MUTANT_SHARD ' + SHARD + ': ' + M_RUN.length + ' of ' + M_SEL.length + ' mutations in this shard)');
if(ONLY.length) console.log('\n(MUTANT_ONLY filter: ' + M_RUN.length + ' of ' + M_FULL.length + ' mutations ran locally; CI runs the full set)');
console.log('\n' + (M_RUN.length - bad) + ' of ' + M_RUN.length + ' mutations caught (' + WORKERS + ' workers, ' + Math.round((Date.now()-t0)/1000) + ' s)');
/* `not_caught` counts every non-CAUGHT line — MISSED, INCOMPLETE and any other class alike.
   It is not a MISSED count, and the ledger must not imply it is: an INCOMPLETE is an
   uninterpretable verdict, not an escaped mutation, and collapsing the two is the reading
   this field exists to prevent. The lines themselves are kept so the split is recoverable. */
logRun('mutants.mjs', { file: SRC, mutations: M_RUN.length, not_caught: bad,
  not_caught_lines: results.filter(r => r && !r.startsWith('CAUGHT')),
  verdict: bad ? 'fail' : 'pass', completed: true, shard: SHARD || null,
  ms: Date.now() - t0 });
process.exit(bad ? 1 : 0);
