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
   "  cardIntoView(card);\n",
   "",
   "next card is brought into view"],

  ["a mock left part-way is discarded without asking",
   "  if((mockOn || document.getElementById('mockResume')) &&\n     !confirm('An unfinished mock is still waiting. Start a new paper and discard it?')) return;\n",
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
  /* --- group 1: question flow, 16/09 --- */
  ["next/skip leaves the new question above the view",
   "function pqNext(){ pqIdx++; pqRender(); cardIntoView(document.getElementById('pqCard')); }",
   "function pqNext(){ pqIdx++; pqRender(); }",
   "next/skip brings the question card"],

  ["the mock stops keeping its question in view",
   "  cardIntoView(document.getElementById('mockCard'));\n",
   "",
   "each mock question is kept in view"],

  ["the mock header scrolls away",
   "#mockCard .pqhead{ position:sticky; top:var(--navh, 135px);",
   "#mockCard .pqhead{ top:var(--navh, 135px);",
   "mock header (question n of N, time left) sticks"],

  ["review loses your answer against the key",
   "    pqMockAns = new Map(rows.map(r => [pqKey(r.p), r.given || '']));\n",
   "",
   "your answer against the key"],

  ["the papers intro never folds",
   "  open(!seen);",
   "  open(true);",
   "folded behind a link"],
  /* --- group 2: mock timing, 16/09 --- */
  ["the home tile goes back to the daily 35 minutes",
   "  b.textContent = mockPerQ ? (50 * mockPerQ) + ' min' : 'untimed';",
   "  b.textContent = '35 min';",
   "home mock tile states the time"],
  /* --- Gemini round 4, 16/09 --- */
  ["a running mock is replaced without asking",
   "  if((mockOn || document.getElementById('mockResume')) &&",
   "  if((document.getElementById('mockResume')) &&",
   "while one is running asks first"],

  ["the mock report scrolls under the nav",
   "#pqCard, #mockCard, #mockReport, #dsum, #drill .card{",
   "#pqCard, #mockCard, #drill .card{",
   "report and drill summary land below"],
  /* --- group 3: less clutter at XL, 16/09 --- */
  ["the mini-timer shows even when the block is untouched",
   "  box.hidden = home || mtOff || !inUse || (typeof mockOn !== 'undefined' && mockOn);",
   "  box.hidden = home || mtOff || (typeof mockOn !== 'undefined' && mockOn);",
   "stays hidden on a section while the block is untouched"],


  ["tap targets back under 44px",
   "#miniT button, #mockPrev, #hlBar .sw, #hlModal .sw{ min-width:44px !important }",
   "#miniT button{ }",
   "tap targets are at least 44px"],

  ["the header title truncates again",
   ".topicbtn .glabel{ flex:0 100 auto;",
   ".topicbtn .glabel{ flex:0 1 auto;",
   "header title keeps its name"],
  /* --- group 4: fewer taps, 16/09 --- */
  ["Read ch N opens the week's first chapter even when it is read",
   "  const w = weekChapters(); return w.find(x => !(readSet && readSet.has(x.sec))) || w[0] || null;",
   "  const w = weekChapters(); return w[0] || null;",
   "first unread chapter"],

  ["the footer never offers the next chapter",
   "    b.hidden = !rb;",
   "    b.hidden = true;",
   "offers the next one this week"],

  ["the topics sheet loses the notes and bookmark row",
   "  SHBODY.appendChild(row);",
   "",
   "topics sheet carries all my notes"],

  ["the header shows the full label that clips",
   "    TNOW.textContent = b.dataset.short || b.firstChild.textContent.trim();",
   "    TNOW.textContent = b.firstChild.textContent.trim();",
   "short label where the full one clips"],

  ["first open ignores the phone's dark setting",
   "let disp = {dark: !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches), fs:'m'};",
   "let disp = {dark:false, fs:'m'};",
   "follows the phone"],

  ["the pre-paint script paints light first and snaps to dark",
   "    if(raw === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) v.dark = true;",
   "",
   "before the first paint"],
  /* --- group 5: extraction-garbled options, 16/09 --- */
  ["the COMBODEX option is garbled again",
   "\"COMBODEX (PARACETAMOL, IBUPROFEN)\"",
   "\"IBUPROFEN) (PARACETAMOL, COMBODEX\"",
   "COMBODEX option reads brand"],
  /* --- group 6: search and remembered place, 16/09 --- */
  ["search goes back to exact phrase only",
   "  for(const pass of [x => re.test(x.t), x => res.every(r => r.test(x.t))]){",
   "  for(const pass of [x => re.test(x.t)]){",
   "two words search as AND"],

  ["past-paper place is never saved",
   "  pqSavePos();\n",
   "",
   "come back after a reload"],

  ["the saved question is not put back on screen",
   "    const i = pqPool.findIndex(p => pqKey(p) === v.k); if(i >= 0) pqIdx = i;\n",
   "",
   "come back after a reload"],
  /* --- brackets and stylesheet junk, 16/09 --- */
  ["the MUSCOL option is garbled again",
   "\"MUSCOL (PARACETAMOL, ORPHENADRINE)\"",
   "\"PARACETAMOL, ORPHENADRINE) )MUSCOL\"",
   "MUSCOL option reads brand"],

  ["the external-beam bracket is mirrored again",
   "חיצוני (external beam radiation therapy)",
   "חיצוני external beam radiation therapy) )",
   "external-beam option has its bracket"],

  ["the FDA bracket is mirrored again",
   "האמריקאי (FDA) למצב המתואר",
   "האמריקאי FDA)) למצב המתואר",
   "FDA option has its bracket"],

  ["pasted prose back in the stylesheet",
   "/* (removed 16/09:",
   "- Viewport Budget & Geometry Verification\n/* (removed 16/09:",
   "no pasted prose left"],

  /* --- Group 8: Key Clinical Points recap tables, ch 43/44/46 (16/09) --- */
  ["falls Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">5</td><td>Tailored multifaceted and multifactorial interventions are the most effective for preventing falls in high-risk populations, including RACF residents.</td></tr>\n",
   "",
   "falls Key Clinical Points table"],

  ["sleep Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>Sleep-wake cycle disruption is common in nursing home patients and may improve with bright-light exposure, a regular day-night cycle and melatonin.</td></tr>\n",
   "",
   "sleep Key Clinical Points table"],

  ["pressure Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>Healing benchmarks: partial-thickness (stage 2) injuries should heal within 60 days maximum; full-thickness (stage 3/4/unstageable) injuries should show improvement every 2 to 4 weeks.</td></tr>\n",
   "",
   "pressure Key Clinical Points table"],

  ["incontinence Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">3</td><td>Treatment, particularly drug therapy, should factor in patient preferences and comorbid conditions.</td></tr>\n",
   "",
   "incontinence Key Clinical Points table"],

  ["rehab Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">5</td><td>Adaptive aids let people with physical limitations perform BADLs/IADLs with greater ease and less pain, spanning mobility aids, bathroom aids and self-care aids.</td></tr>\n",
   "",
   "rehab Key Clinical Points table"],

  ["delirium Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">8</td><td>Nonpharmacologic strategies are the preferred treatment; medications are reserved for more severe symptoms that threaten medical management or patient safety.</td></tr>\n",
   "",
   "delirium Key Clinical Points table"],

  ["bpsd ch 60 Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">7</td><td>If medication is started, titrate slowly, use the lowest effective dose, and reassess the risk/benefit ratio regularly.</td></tr>\n",
   "",
   "bpsd Key Clinical Points table for ch 60"],

  ["bpsd ch 63 Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>A history of falls and dysphagia with abnormal vertical gaze but a preserved oculocephalic reflex suggests progressive supranuclear palsy.</td></tr>\n",
   "",
   "bpsd Key Clinical Points table for ch 63"],

  ["parkinson Key Clinical Points table loses its last row",
   "    <tr><td class=\"n\">6</td><td>Deep brain stimulation is typically indicated for patients with difficult motor complications and medication-refractory tremor.</td></tr>\n",
   "",
   "parkinson Key Clinical Points table"],
  ['end and top buttons swap again instead of showing together',
   "if(en) en.hidden = scrollY + innerHeight > document.documentElement.scrollHeight - 400;",
   "if(en) en.hidden = !b.hidden;",
   'shown together while reading'],

  /* --- group 9: the jump row stops covering the text (16 Sep) --- */
  ['the jump row stacks again, so it covers three lines instead of one',
   "    z-index:45;flex-direction:row;align-items:center;gap:8px}",
   "    z-index:45;flex-direction:column;align-items:center;gap:8px}",
   'one horizontal row in the corner'],

  ['the jump buttons lose their 44px tap target',
   "    min-height:44px;min-width:44px;justify-content:center;\n",
   "",
   '44px tap target'],

  ['the jump row stays up on Past papers and the mock, over the answer options',
   "    if(row) row.classList.toggle('off', !!sec && sec.id === 'papers');",
   "    if(row) row.classList.toggle('off', false);",
   'hidden on Past papers and the mock'],

  ['hiding the row only makes it invisible, so it still swallows the tap',
   "  .jumprow.off{display:none!important}",
   "  .jumprow.off{opacity:0}",
   'swallow a tap on an answer'],

  ['main goes back to a hard-coded bottom gap that XL outgrows',
   "    main{padding-bottom:calc(var(--jumph, 66px) + var(--minih, 0px) + 26px + env(safe-area-inset-bottom))}",
   "    main{padding-bottom:calc(110px + env(safe-area-inset-bottom))}",
   'padded by the measured height'],

  ['the row is never measured, so the padding keeps its fallback',
   "    if(h > 0) document.documentElement.style.setProperty('--jumph', h + 'px');",
   "    if(h > 0) return;",
   'writes its height into --jumph'],

  ['the row is measured while hidden, so Past papers reports zero height',
   "    if(off) row.classList.remove('off');",
   "    if(off) void 0;",
   'still measured on Past papers'],

  /* --- the row gets out of the way while scrolling, 16 Sep --- */
  ['scrolling no longer fades the row out of the way',
   "  addEventListener('scroll', fadeJumpRow, {passive:true});",
   "  void fadeJumpRow;",
   'scrolling fades the jump row out'],

  ['the faded row is hidden by display, so it stops measuring mid-scroll',
   "  .jumprow.fade{opacity:0;pointer-events:none}",
   "  .jumprow.fade{display:none}",
   'never display:none'],

  ['the faded row stays tappable, so it swallows the tap it is hiding under',
   "{opacity:0;pointer-events:none}",
   "{opacity:0}",
   'stops it taking taps'],

  ['the row never comes back after the reader stops',
   "    settle = setTimeout(()=>{ row.classList.remove('fade'); faded = false; }, SETTLE);",
   "    settle = 0;",
   'the row comes back'],

  ['a focused jump button fades out from under the keyboard again',
   "    if(!faded && !row.contains(document.activeElement)){ row.classList.add('fade'); faded = true; }",
   "    if(!faded){ row.classList.add('fade'); faded = true; }",
   'already holds focus never fades'],

  ['reduced motion loses its carve-out',
   "  @media (prefers-reduced-motion: reduce){ .jumprow{transition:none} }",
   "",
   'reduced motion drops the transition'],

  /* --- icon-only jump buttons, 16 Sep --- */
  ['the back-to-top override sizes the button again, breaking the matched pair',
   "  border-radius: 24px !important;\n  font-weight: 700 !important;",
   "  border-radius: 24px !important;\n  padding: 12px 16px !important;\n  font-weight: 700 !important;",
   'no longer sizes the button'],

  ['the jump buttons get their words back, and cover the text again',
   '<button class="toend" id="toEnd" type="button" aria-label="Jump to end">&darr;</button>',
   '<button class="toend" id="toEnd" type="button" aria-label="Jump to end">&darr;<span>end</span></button>',
   'arrow and no words'],

  ['an icon-only button loses the name a screen reader reads',
   'aria-label="Back to top" hidden>&uarr;</button>',
   'hidden>&uarr;</button>',
   'name a screen reader reads'],

  ['the arrow stops scaling with the text-size control',
   "    font-family:var(--sans);font-size:calc(17px*var(--fs,1));line-height:1;padding:0;",
   "    font-family:var(--sans);font-size:17px;line-height:1;padding:0;",
   'arrow scales with the text-size control'],

  /* --- text size on body, and the row stepping over the timer, 16 Sep --- */
  ['--fs goes back to being scoped to main, leaving every overlay unscaled',
   "  body{--fs:1}",
   "  main{--fs:1}",
   'declared once, on body'],

  ['main multiplies an em by --fs again, so the reading text scales twice',
   "  body.fs-xl{--fs:1.4}",
   "  body.fs-xl{--fs:1.4}\n  main{font-size:calc(1em*var(--fs))}",
   'multiplies an em by --fs'],

  ['the jump row stops stepping over the timer and lands on it again',
   "    row.classList.toggle('above', up);",
   "    row.classList.toggle('above', false);",
   'steps above the floating timer'],

  ['the timer height is kept after it is hidden, so the row floats above nothing',
   "    const h = up ? Math.round(miniT.getBoundingClientRect().height) : 0;",
   "    const h = Math.round(miniT.getBoundingClientRect().height);",
   'drops back down when the timer goes away'],

  ['main stops leaving room for the timer under the jump row',
   "    main{padding-bottom:calc(var(--jumph, 66px) + var(--minih, 0px) + 26px + env(safe-area-inset-bottom))}",
   "    main{padding-bottom:calc(var(--jumph, 66px) + 16px + env(safe-area-inset-bottom))}",
   'of the timer under it'],

  /* --- Gemini round 5, 16 Sep --- */
  ['2023-06 q100 source picks up q101-104 again',
   "\u05d4\u05d6\u05d0\u05e8\u05d3 \u05e2\u05de\u05d5\u05d3620 \u05d8\u05d1\u05dc\u05d442-2\",",
   "\u05d4\u05d6\u05d0\u05e8\u05d3 \u05e2\u05de\u05d5\u05d3620 \u05d8\u05d1\u05dc\u05d442-2 101\u05d4\u05e8\u05d9\u05e1\u05d5\u05df357\",",
   'stops at its own table'],

  ['2020 q19 source loses the rest of the pocket-guide title',
   "\u05de\u05d0\u05de\u05e8POCKET GUIDE TO THE AGS BEERS 2019",
   "\u05de\u05d0\u05de\u05e8POCKET GUIDE TO THE",
   'whole pocket-guide title'],

  ['2020 q20 source takes back q19\u2019s bled tail',
   "\"src\": \"HAZZARD \u05e2\u05de\u05d5\u05d3\u05d9\u05dd702-703\"",
   "\"src\": \"19 AGS BEERS 20HAZZARD \u05e2\u05de\u05d5\u05d3\u05d9\u05dd702-703\"",
   'starts at HAZZARD'],

  ['a font size goes back to a bare px that the text-size control cannot reach',
   "  #miniT .mode{font-size:calc(11px*var(--fs,1));",
   "  #miniT .mode{font-size:11px;",
   'no font size is a bare px value'],

  ['focus arriving on a faded row no longer brings it back',
   "  if(row) row.addEventListener('focusin', ()=>{\n    clearTimeout(settle); row.classList.remove('fade'); faded = false;\n  });",
   "  void 0;",
   'focus arriving on a faded jump button'],

  /* --- bracket fixes read from the IMA papers, 16 Sep --- */
  ['2023-06 q72 option 4 loses the paper\u2019s bracket again',
   "\u05d1 - DPI (DRY POWDER INHALER)",
   "\u05d1 - DPI DRY POWDER INHALER))",
   'carries the paper\u2019s bracket: DPI'],

  ['2020 q90 option 1 loses the paper\u2019s bracket again',
   "METRONIDAZOLE (FLAGYL) \u05e4\u05d5\u05de\u05d9",
   "METRONIDAZOLE FLAGYL) )\u05e4\u05d5\u05de\u05d9",
   'carries the paper\u2019s bracket: METRONIDAZOLE'],

  /* --- outside review, 16 Sep --- */
  ['search highlighting goes back to one replace per word, marking its own markup',
   "    if(words.length) snip = snip.replace(\n      new RegExp(words.map(w=>esc(escHtml(w))).sort((a,b)=>b.length-a.length).join('|'), 'gi'),\n      m=>`<mark>${m}</mark>`);",
   "    for(const w of words) snip = snip.replace(new RegExp(esc(escHtml(w)), 'gi'), m=>`<mark>${m}</mark>`);",
   'survives a second word that matches the markup it injects'],
];

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
  const suite = fs.readFileSync('test.mjs', 'utf8')
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  for(const [name, , , needle] of M){
    if(!suite.includes(needle)){ bad++; console.log('NEEDLE ' + name + '  — no guard label contains "' + needle + '"'); }
  }
  console.log(M.length + ' mutations, ' + bad + ' stale, ambiguous or unmatched');
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

/* In parallel, one temp file per mutation. Sequentially the set had grown to ~30 minutes.
   The first attempt at this (965e9c8) was reverted after three false MISSED results; the cause
   was not contention itself but a quota test in test.mjs that refused background writes and
   let the rejection kill the run at ~329 checks, which only happened when the machine was
   slow. That is fixed in test.mjs, and a run that never reaches DONE is now INCOMPLETE here,
   never MISSED: an unfinished run proves nothing either way. */
const { execFile } = await import('child_process');
const os = await import('os');
const WORKERS = Math.max(1, Math.min(M.length, +(process.env.MUTANT_WORKERS || os.cpus().length)));
const runSuite = file => new Promise(res => execFile('node', ['test.mjs', file],
  {encoding:'utf8', maxBuffer: 64 * 1024 * 1024}, (err, stdout, stderr) => res((stdout || '') + (stderr || ''))));
const results = new Array(M.length);
let next = 0;
async function worker(){
  while(next < M.length){
    const i = next++; const [name, from, to, needle] = M[i];
    const hits = src.split(from).length - 1;
    if(hits === 0){ results[i] = 'STALE  ' + name + '  — the code it mutates has moved; update this mutation'; continue; }
    /* replace() takes the first occurrence only: with two, the mutation may land on dead
       text and leave the live code intact, which reports a blind suite that is not blind */
    if(hits > 1){ results[i] = 'AMBIG  ' + name + '  — target appears ' + hits + ' times; make it unique'; continue; }
    const tmp = '/tmp/mutant-' + process.pid + '-' + i + '.html';
    fs.writeFileSync(tmp, src.replace(from, to));
    const out = await runSuite(tmp);
    try{ fs.unlinkSync(tmp); }catch(e){}
    const lines = out.split('\n');
    const caught = lines.some(l => l.startsWith('FAIL') && l.includes(needle));
    const passes = lines.filter(l => l.startsWith('PASS')).length;
    const done = lines.some(l => l.startsWith('DONE'));
    /* the file stopped parsing, so everything failed. That is not the guard biting. */
    if(caught && passes < 50) results[i] = 'BROKE  ' + name + '  — mutation broke the parse (' + passes + ' passed); it proves nothing';
    else if(caught) results[i] = 'CAUGHT ' + name;
    else if(!done) results[i] = 'INCOMPLETE ' + name + '  — the suite stopped after ' + passes + ' checks without reaching DONE; not a verdict';
    else results[i] = 'MISSED ' + name;
  }
}
const t0 = Date.now();
await Promise.all(Array.from({length: WORKERS}, worker));
let bad = 0;
for(const r of results){ console.log(r); if(!r.startsWith('CAUGHT')) bad++; }
console.log('\n' + (M.length - bad) + ' of ' + M.length + ' mutations caught (' + WORKERS + ' workers, ' + Math.round((Date.now()-t0)/1000) + ' s)');
process.exit(bad ? 1 : 0);
