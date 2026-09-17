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

  /* the target carries the line above it: bmAdvance clears the bookmark the same way when the
     week is done, so the bare set() line appears twice now */
  ['clearing the bookmark goes back to .delete, which the layer does not have',
   "    BM = null;\n    /* the storage layer has get and set only \u2014 .delete threw into the catch and the\n       bookmark stayed on disk. An empty value is what every loader treats as absent. */\n    try{ window.storage.set(BMKEY, ''); }catch(e){}",
   "    BM = null;\n    try{ window.storage.delete(BMKEY); }catch(e){}",
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
   "#miniT button, #mockPrev, #hlModal .sw{ min-width:44px !important }",
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

  ['a text-size change stops re-measuring nav, going stale at XL',
   "  setNavH();\n  document.querySelectorAll('.disprow button[data-dk]').forEach(dk=>{",
   "  document.querySelectorAll('.disprow button[data-dk]').forEach(dk=>{",
   'calls setNavH, so a text-size change'],

  /* --- regression, real phone: bottom-docked bar hidden by Chrome, and the empty nx, 16 Sep --- */
  ['the bar goes back to the bottom edge, under Chrome\u2019s own contextual sheet',
   "top:calc(var(--navh, 130px) + env(safe-area-inset-top));",
   "bottom:0;",
   'under nav, not at the bottom edge'],

  ['a second, redundant writer of --navh creeps back in',
   "if(nav) document.documentElement.style.setProperty('--navh', Math.round(nav.getBoundingClientRect().height) + 'px'); }",
   "if(nav) document.documentElement.style.setProperty('--navh', Math.round(nav.getBoundingClientRect().height) + 'px'); document.documentElement.style.setProperty('--navh', '999px'); }",
   'the one existing measurer, not a second one'],

  ['the next-chapter button loses its hidden guard, and shows empty again',
   "  .nx[hidden]{display:none}",
   "",
   'genuinely display:none'],

  /* --- less invasive chrome, and clean selection handling, 16 Sep --- */
  ['the selection bar goes back to a black fill in light mode',
   "  #hlBar{position:fixed;z-index:58;left:0;right:0;top:calc(var(--navh, 130px) + env(safe-area-inset-top));\n    display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:nowrap;\n    background:var(--paper);color:var(--ink);",
   "  #hlBar{position:fixed;z-index:58;left:0;right:0;top:calc(var(--navh, 130px) + env(safe-area-inset-top));\n    display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:nowrap;\n    background:var(--ink);color:var(--paper);",
   'not a fixed dark fill'],

  ['the floating timer goes back to a black pill',
   "  #miniT{position:fixed;left:10px;bottom:14px;z-index:56;font-family:var(--sans);background:var(--surface);color:var(--ink);",
   "  #miniT{position:fixed;left:10px;bottom:14px;z-index:56;font-family:var(--sans);background:var(--ink);color:var(--paper);",
   'takes its colour from the page too'],

  ['the two secondary actions get a second row again',
   "  <button type=\"button\" id=\"hlMore\" aria-haspopup=\"true\" aria-expanded=\"false\" aria-label=\"More highlight actions\">&#8943;</button>\n  <span class=\"hlmore\" hidden>\n    <button type=\"button\" id=\"hlNote\">+ note</button>\n    <button type=\"button\" id=\"hlHere\" title=\"Mark this as where you stopped reading\">stop here</button>\n  </span>",
   "  <button type=\"button\" id=\"hlNote\">+ note</button>\n  <button type=\"button\" id=\"hlHere\" title=\"Mark this as where you stopped reading\">stop here</button>\n  <button type=\"button\" id=\"hlMore\" aria-haspopup=\"true\" aria-expanded=\"false\" aria-label=\"More highlight actions\" hidden></button>\n  <span class=\"hlmore\" hidden></span>",
   'behind an overflow toggle'],

  ['the timer and jump row stop standing down for the selection bar',
   "    if(mt) mt.classList.toggle('hl-off', up);\n    if(row) row.classList.toggle('hl-off', up);",
   "    void up;",
   'stands the timer and the jump row down'],

  /* this line is reached from two paths: a real selectionchange clearing (place -> paintChrome)
     and a direct action inside the overflow (hlNote/hlHere's own click handlers call
     paintChrome() too). The click path is what the existing guard below already exercises. */
  ['the overflow menu no longer closes behind an action taken inside it',
   "    if(!up) more.hidden = true;",
   "    if(false) more.hidden = true;",
   'closes the whole bar, overflow included'],

  ['a selectionchange handler starts mutating the selection again',
   "  function paintChrome(){\n    const up = hlBarShown();",
   "  function paintChrome(){\n    window.getSelection().removeAllRanges();\n    const up = hlBarShown();",
   'mutates the DOM or the Selection while a selection is live'],

  /* --- the place follows progress, and the timer is one tap, 16 Sep --- */
  ['marking a chapter read leaves the place inside the chapter just finished',
   "  if(!was && typeof bmAdvance === 'function') bmAdvance();",
   "  void was;",
   'moves the place to the next unread chapter'],

  ['un-marking a chapter drags the place back into it',
   "  const was = readSet.has(id);\n  was ? readSet.delete(id) : readSet.add(id);",
   "  const was = false;\n  readSet.has(id) ? readSet.delete(id) : readSet.add(id);",
   'un-marking a chapter leaves the place'],

  /* the old fallback: firstUnread() returns w[0] when everything is read, which would park
     the place back on the first chapter instead of clearing it. Mutating the guard clause
     itself crashed the page on the undefined chapter and proved nothing. */
  ['the place parks on the first chapter instead of clearing when the week is done',
   "  const nx = w.find(x => !(readSet && readSet.has(x.sec)));",
   "  const nx = w.find(x => !(readSet && readSet.has(x.sec))) || w[0];",
   'the place clears, so resume goes home'],

  ['finishing a chapter\u2019s drill no longer moves the place',
   "  if(filter.mode === 'tag' && SECFORTAG[filter.tag] && typeof bmAdvance === 'function') bmAdvance();",
   "  void SECFORTAG;",
   'drill moves the place on too'],

  ['pause has to go through the menu again',
   "  function goTap(){ setMenuOpen(false); if(SW.on) swToggleRun(); else elGo.click(); }",
   "  function goTap(){ setMenuOpen(true); if(SW.on) swToggleRun(); else elGo.click(); }",
   'closes the menu rather than leaving it up'],

  ['a tap on the clock goes back to doing nothing, instead of pausing/resuming like the button',
   "    if(e.target.closest('#mtClock, .ph')) goTap();",
   "    void e;",
   'pauses/resumes the day, the same as the button'],

  ['hide stops shrinking the pill to the gear dot',
   "  document.getElementById('mtHide').addEventListener('click',()=>{ setMenuOpen(false); setDot(true); });",
   "  document.getElementById('mtHide').addEventListener('click',()=>{ setMenuOpen(false); });",
   'shrinks the pill to a gear dot'],

  ['tapping the gear dot no longer restores the pill',
   "    if(box.classList.contains('dot')){ setDot(false); return; }\n    if(e.target.closest('#mtClock, .ph')) goTap();",
   "    if(false){ setDot(false); return; }\n    if(e.target.closest('#mtClock, .ph')) goTap();",
   'restores the pill'],

  ['switching mode leaves the menu open',
   "  document.getElementById('mtMode').addEventListener('click',()=>{ swSetMode(!SW.on); setMenuOpen(false); });",
   "  document.getElementById('mtMode').addEventListener('click',()=>{ swSetMode(!SW.on); });",
   'action taken in the menu closes it'],

  ['tapping the page no longer closes the menu',
   "    if(!box.classList.contains('open') || box.contains(e.target)) return;\n    setMenuOpen(false);",
   "    return;",
   'tapping outside the menu closes it'],

  /* --- v27 pill-as-single-control, next round --- */
  ['the jump row stops standing down while the pill\u2019s menu is open',
   "    if(jumpRow) jumpRow.classList.toggle('hl-off', v);",
   "    void jumpRow;",
   'the jump row stands down while the pill\u2019s own menu is open'],

  ['the More sub-list stops toggling open',
   "  moreToggle.addEventListener('click', ()=>{\n    const open = moreSub.hidden; moreSub.hidden = !open;\n    moreToggle.setAttribute('aria-expanded', open ? 'true' : 'false');\n  });",
   "  moreToggle.addEventListener('click', ()=>{});",
   'tapping it opens the sub-list'],

  ['text size in the pill\u2019s menu no longer closes the menu behind it',
   "  document.getElementById('mtSize').addEventListener('click', ()=>setMenuOpen(false));",
   "",
   'text size'],

  ['theme in the pill\u2019s menu stops toggling dark mode',
   "  document.getElementById('mtTheme').addEventListener('click', ()=>{ disp.dark = !disp.dark; paintDisp(); setMenuOpen(false); });",
   "  document.getElementById('mtTheme').addEventListener('click', ()=>{ setMenuOpen(false); });",
   'theme in the pill'],

  ['mark my place in the pill\u2019s menu stops setting the bookmark',
   "  document.getElementById('mtMark').addEventListener('click', ()=>{ setTimeout(()=>bmSet(null), 0); setMenuOpen(false); });",
   "  document.getElementById('mtMark').addEventListener('click', ()=>{ setMenuOpen(false); });",
   'mark my place in the pill'],

  ['the drag threshold drops from 300ms, so a plain tap starts dragging',
   "    }, 300);",
   "    }, 0);",
   'a real long-press (300ms)'],

  ['the dragged pill snaps flush to the edge instead of the 24px + safe-area inset',
   "  const EDGE = 24;",
   "  const EDGE = 0;",
   '24px'],

  ['the pill\u2019s dragged position stops being saved to geri:timerpos',
   "      try{ window.storage.set('geri:timerpos', JSON.stringify(pos)); }catch(e){}",
   "",
   'geri:timerpos'],

  ['a long-press with no movement stops being swallowed, so it falls through and pauses/resumes the timer',
   "    if(armed){ armed = false; e.stopImmediatePropagation(); }",
   "    if(armed){ armed = false; }",
   'swallowed as a hold'],

  ['pointercancel stops tearing the drag down, so a system-cancelled press leaves the pill armed for the next touch',
   "    document.addEventListener('pointercancel', onPointerCancel);",
   "",
   'pointercancel tears the drag down'],

  ['closing the pill’s menu stops collapsing the nested More list behind it',
   "    if(!v && moreSub){ moreSub.hidden = true; moreToggle.setAttribute('aria-expanded','false'); }",
   "",
   'also collapses the nested More list'],

  ['the gear dot loses its drag carve-out, so it can never be long-pressed once hidden down to a dot',
   "    if(e.target.closest('button') && !box.classList.contains('dot')) return;",
   "    if(e.target.closest('button')) return;",
   'shrunk gear dot can still be long-pressed'],

  ['a fresh, never-dragged pill goes back to clamping from a zero-size hidden rect and gets pinned to the top edge',
   "applyPos(clampPos(...(pos ? [pos.left, pos.bottom] : Object.values(CSS_DEFAULT_POS))));",
   "applyPos(clampPos(...(pos ? [pos.left, pos.bottom] : Object.values(currentPos()))));",
   'pill lands near the bottom-left edge inset'],

  ['Start/Resume goes back to a solid near-black --ink slab in light mode',
   "#miniT button.pri{background:var(--surface);color:var(--ink);border-color:var(--ink);font-weight:600}",
   "#miniT button.pri{background:var(--ink);color:var(--paper);border-color:var(--ink);font-weight:600}",
   'not a solid near-black slab'],

  ['the gear dot stops updating mtMore’s accessible name, so it still announces "Settings and more" with a popup once dotted',
   "    moreBtn.setAttribute('aria-label', v ? 'Restore timer' : 'Settings and more');\n    moreBtn.setAttribute('aria-haspopup', v ? 'false' : 'true');",
   "",
   'accessible name says it restores the timer'],

  /* --- final Gemini round, 16 Sep --- */
  ['dark mode answer feedback loses to the plain-option rule again',
   "body.dark .pqo.right {\n  background: #1b2a25 !important;",
   "body.dark .pqo.right {\n  background: #1b2a25;",
   'answered option its own background'],

  ['the highlight save binds the object it was queued with, not the live one',
   "  saveChain = saveChain.then(async()=>{\n    const mine = getMine();",
   "  const mine = getMine();\n  saveChain = saveChain.then(async()=>{",
   'added between queueing and resolving survives'],

  ['the timer height stops being watched, so --minih goes stale on a wrap',
   "  if(miniT && typeof ResizeObserver === 'function') new ResizeObserver(measureTimer).observe(miniT);",
   "  void measureTimer;",
   'height is watched'],

  ['the timer is not re-measured when the section changes either',
   "  document.addEventListener('sectionshown', ()=>{ jumpRowFor(); measureJumpRow(); measureTimer(); });",
   "  document.addEventListener('sectionshown', ()=>{ jumpRowFor(); measureJumpRow(); });",
   'no attribute change still updates'],

  ['coming back to the tab stops re-reading the timer',
   "  try{ const r = await window.storage.get(TKEY); const v = JSON.parse(r.value);\n    if(v && v.d === today()){ T = v; if(T.run && tLeft() <= 0){ T.run = false; T.left = 0; } } }catch(e){}",
   "  void TKEY;",
   'another tab moved on is picked up'],

  ['a timer from another day is restored on refresh',
   "    if(v && v.d === today()){ T = v; if(T.run && tLeft() <= 0){ T.run = false; T.left = 0; } } }catch(e){}",
   "    if(v){ T = v; } }catch(e){}",
   'from another day is left where it is'],

  ['the mock writes the reader\u2019s log again',
   "    mlog[today()] = Math.round(right / rows.length * 50);\n    saveML(); paintQ();",
   "    qlog[today()] = Math.round(right / rows.length * 50);\n    saveQ(); paintQ();",
   'writes its own log'],

  ['the mock log is left out of the backup',
   "'geri:qlog','geri:mocklog',",
   "'geri:qlog',",
   'own key, loaded on boot'],

  ['a day with both scores plots the higher one',
   "  if(has(a) && has(b)) return Math.min(a, b);",
   "  if(has(a) && has(b)) return Math.max(a, b);",
   'plots the lower of them'],

  ['only one of the two day scores is shown again',
   "  if(mock != null) parts.push('mock: <b>'+mock+'/50</b>');",
   "  if(mock != null && mine == null) parts.push('mock: <b>'+mock+'/50</b>');",
   'both scores are shown'],

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

  /* --- v21 dark palette, 16 Sep --- */
  ['dark accent reverts to the too-bright pre-audit amber',
   '--c-now:#E59835 !important;',
   '--c-now:#FFA92E !important;',
   'dark palette hex values are pinned'],

  ['dark body text reverts to the pre-audit cream',
   '--ink:#E6E1DC !important;',
   '--ink:#F6EFE6 !important;',
   'dark palette hex values are pinned'],

  ['the v19 dossier override collapses dark --surface back onto --paper',
   '--surface: #2D2C2B !important;',
   '--surface: var(--paper) !important;',
   'the v19 dossier override no longer collapses dark --surface onto --paper'],

  ['the three dashboard tiles go back to near-black text in dark mode',
   'body.dark #week .today .acts .act,body.dark #week .today .acts .act b,body.dark #week .today .acts .act span{color:var(--ink)}',
   'body.dark #week .today .acts .act,body.dark #week .today .acts .act b,body.dark #week .today .acts .act span{color:#12161a}',
   'dark mode outlines the three dashboard tiles'],

  ['"Mark today done" loses its dark-mode outline and goes back to a solid amber fill',
   'body.dark #week #tdBtn:not([data-on="1"]) {\n  background: var(--surface) !important;\n  border-color: var(--c-now) !important;\n  color: var(--ink) !important;\n}',
   '',
   'dark mode outlines "Mark today done"'],

  /* --- v24 chapter-end stack, 16 Sep --- */
  ['the chapter footer stops wrapping drill/past-questions in the two-up row div',
   '\'<div class="secrow2">\' +',
   '\'\' +',
   'the chapter-end footer is one stack'],

  ['the chapter footer stops wrapping print/backup/home in the quiet-row div',
   '\'<div class="secquiet">\' +',
   '\'\' +',
   'quiet print/backup/home row'],

  ['"mark as read" goes back to a solid green fill once checked instead of a quiet outline',
   '.secfoot > button.mark.readon{ background:none !important; border-color:var(--start) !important;\n  color:var(--start) !important; }',
   '',
   'styled as a quiet outline once checked'],

  ['the drill/past-questions row loses its equal-width flex layout',
   '.secfoot .secrow2{ display:flex !important; gap:10px !important; }',
   '.secfoot .secrow2{ display:block !important; }',
   'equal two-up row'],

  ['"Next: <chapter>" loses its accent fill and reads as a plain box again',
   '.secfoot > button.nx{ width:100%; font-family:var(--sans) !important; font-weight:700 !important;\n  border-radius:4px !important; padding:12px 16px !important; min-height:48px !important;\n  background:var(--accent) !important; border-color:var(--accent) !important; color:var(--paper) !important;\n  letter-spacing:0 !important; text-transform:none !important; }',
   '.secfoot > button.nx{ width:100%; }',
   'full-width accent action'],

  ['the middot separator between print/backup/home disappears',
   '.secfoot .secquiet button + button::before{ content:\'\\00b7\'; margin-inline-end:8px; display:inline-block; text-decoration:none; }',
   '',
   'middot separators'],

  ['the next-chapter button reverts to the old "next this week:" wording',
   "b.dataset.go = nxt; b.textContent = 'Next: ' + (rb.dataset.short || rb.firstChild.textContent.trim()) + ' \\u2192'; }",
   "b.dataset.go = nxt; b.textContent = 'next this week: ' + (rb.dataset.short || rb.firstChild.textContent.trim()) + ' \\u2192'; }",
   'old "next this week:" wording'],

  /* --- v24 chapter-end stack, Codex review on #431 --- */
  ['the past-questions button carries the .pq card’s 26px bottom margin into the two-up row again',
   '.secfoot .secrow2 button{ flex:1 1 0; width:auto !important; margin:0 !important;',
   '.secfoot .secrow2 button{ flex:1 1 0; width:auto !important;',
   'Codex #431'],

  ['the next-chapter button loses its reset of the inherited "next up" grid layout',
   '.secfoot > button.nx:not([hidden]){ display:flex !important; align-items:center !important; justify-content:center !important; }',
   '',
   'resets the inherited "next up" grid layout'],

  ['the middot separator loses its own formatting context and inherits the button’s underline again',
   ".secfoot .secquiet button + button::before{ content:'\\00b7'; margin-inline-end:8px; display:inline-block; text-decoration:none; }",
   ".secfoot .secquiet button + button::before{ content:'\\00b7'; margin-inline-end:8px; text-decoration:none; }",
   'its own formatting context'],

  /* --- v25 dark leftovers, next round --- */
  ['the timer Start/Resume button reverts to a solid amber fill with near-black text in dark mode',
   'body.dark #week #tGo{ background:var(--surface) !important; border:1px solid var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines the timer Start/Resume button'],

  ['the quick-log button reverts to a solid amber fill with near-black text in dark mode',
   'body.dark #week #qLog{ background:var(--surface) !important; border:1px solid var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines the quick-log button'],

  ['the quick-log button’s dark outline goes back to border-color-only, invisible against its own border:none rule',
   'body.dark #week #qLog{ background:var(--surface) !important; border:1px solid var(--c-now) !important; color:var(--ink) !important; }',
   'body.dark #week #qLog{ background:var(--surface) !important; border-color:var(--c-now) !important; color:var(--ink) !important; }',
   'with a real border'],

  ['a pressed filter pill reverts to a solid amber fill with near-black text in dark mode',
   'body.dark .pf button[aria-pressed="true"]{ background:var(--surface) !important; border-color:var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines a pressed filter pill'],

  ['the mock’s start button reverts to a solid amber fill with near-black text in dark mode',
   'body.dark .pf button.mockgo{ background:var(--surface) !important; border-color:var(--c-now) !important; color:var(--ink) !important; }',
   '',
   'outlines the mock’s start button'],

  ['the down jump button (.toend) loses its dark outline and goes back to the broken ink-fill/near-black-text state',
   'body.dark .toend{ background:var(--surface) !important; color:var(--ink) !important; border:1px solid var(--rule) !important; }',
   '',
   'the same dark outline the up button'],

  /* --- v26 header, next round --- */
  ['a live selection no longer freezes the header’s auto-hide',
   "if(typeof hdrSetFrozen === 'function') hdrSetFrozen(up);",
   '',
   'freezes the header’s auto-hide'],

  ['the docked highlight bar stops re-anchoring to the top when the header is hidden',
   'body.hdr-hidden #hlBar{ top:env(safe-area-inset-top) !important; }',
   '',
   're-anchors to the very top'],

  ['the header stops sliding out of view on scroll-down',
   'body.hdr-hidden nav{ transform:translateY(-100%) !important; }',
   '',
   'slides out of view on scroll-down'],

  ['the chapter-top meta line loses its 44px/12px-gap tap targets',
   '.ch-actions{ gap:12px !important; }\n.ch-actions .ebgo{ min-height:44px !important; }',
   '',
   '44px tap targets with 12px gaps'],

  ['the header auto-hide threshold drops from 60px to 0, showing the header nowhere near the top',
   'if(y < 60) return false;',
   'if(y < 0) return false;',
   'near the top (<60px) the header always shows'],

  /* --- Gemini/Eias phone check of #432+#433, next round --- */
  ['the search icon SVG loses its explicit 24px sizing and falls back to the browser default',
   '.anchorbar .srchbtn svg{ width:24px; height:24px; flex:none; }',
   '',
   'an inline SVG stroked with currentColor'],

  ['the tappable title goes back to the monospace technical-ledger voice',
   '.topicbtn{ font-family:var(--sans) !important; letter-spacing:0 !important; text-transform:none !important; }',
   '',
   'the plain sans heading font'],

  ['the header freeze moves back into the debounced timeout, arriving 260ms late (Gemini review of #433)',
   "  document.addEventListener('selectionchange', ()=>{\n    /* the freeze itself cannot wait for the 260ms debounce below: an Android drag-handle\n       micro-scroll inside that window could still hide or show the header mid-selection,\n       before place()/paintChrome() ever runs. A non-collapsed selection freezes the header\n       synchronously, right here; the debounce still owns positioning the bar and unfreezing\n       once the selection actually clears (Gemini review of #433). */\n    const sel = window.getSelection();\n    if(sel && !sel.isCollapsed && typeof hdrSetFrozen === 'function') hdrSetFrozen(true);\n    clearTimeout(tmr); tmr = setTimeout(place, 260);\n  });",
   "  document.addEventListener('selectionchange', ()=>{ clearTimeout(tmr); tmr = setTimeout(place, 260); });",
   'freezes synchronously on selectionchange, before the 260ms debounce'],
];

/* MUTANT_ONLY=<comma-separated name substrings> restricts the full (non --static) run to the
   mutations named. --static already runs the whole list cheaply (seconds); the full run patches
   the source and re-runs the suite per mutation, which is what makes it slow, so local commits
   only need the mutations touched this round — CI runs the unfiltered full set. */
const ONLY = (process.env.MUTANT_ONLY || '').split(',').map(s=>s.trim()).filter(Boolean);
const M_FULL = M;
const M_RUN = (!STATIC && ONLY.length) ? M_FULL.filter(([name]) => ONLY.some(s => name.includes(s))) : M_FULL;
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
const WORKERS = Math.max(1, Math.min(M_RUN.length, +(process.env.MUTANT_WORKERS || os.cpus().length)));
const runSuite = file => new Promise(res => execFile('node', ['test.mjs', file],
  {encoding:'utf8', maxBuffer: 64 * 1024 * 1024}, (err, stdout, stderr) => res((stdout || '') + (stderr || ''))));
const results = new Array(M_RUN.length);
let next = 0;
async function worker(){
  while(next < M_RUN.length){
    const i = next++; const [name, from, to, needle] = M_RUN[i];
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
if(ONLY.length) console.log('\n(MUTANT_ONLY filter: ' + M_RUN.length + ' of ' + M_FULL.length + ' mutations ran locally; CI runs the full set)');
console.log('\n' + (M_RUN.length - bad) + ' of ' + M_RUN.length + ' mutations caught (' + WORKERS + ' workers, ' + Math.round((Date.now()-t0)/1000) + ' s)');
process.exit(bad ? 1 : 0);
