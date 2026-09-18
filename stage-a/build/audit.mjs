import { JSDOM } from 'jsdom'; import { pinClock } from './clock.mjs'; import fs from 'fs';
const html=fs.readFileSync(process.argv[2]||'geriatrics-stage-a.html','utf8'); const store={}; const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){pinClock(w);
  w.storage={get:async k=>{if(!(k in store))throw 0;return{key:k,value:store[k]}},set:async(k,v)=>{store[k]=v;return{key:k,value:v}}};
  w.addEventListener('error',e=>errs.push(e.message));
  /* ChatGPT third-model audit round 5: only the window 'error' event was wired, so a
     console.error call from the page (as opposed to an uncaught throw) never counted toward
     'runtime errors' below, same gap class as test.mjs's secondary windows */
  w.console.error=(...a)=>errs.push('console.error '+a.join(' '));
}});
const w=dom.window,d=w.document; await new Promise(r=>setTimeout(r,600));
/* PQ starts empty until pqLoad() parses #pqjson (normally deferred to when the user opens
   #papers). Auditing PQ without calling this first silently audits an empty array — every
   PQ-derived check below would report 0/vacuously-true no matter what the data actually
   contains. Load it, and refuse to trust an empty result. */
w.eval('pqLoad()');
const pqCount = w.eval('PQ.length');
if(!(pqCount > 0)){ console.log('FATAL: PQ is empty after pqLoad() — the questions bank did not load, every PQ check below would be vacuous'); process.exit(1); }
const p=[]; const fail=[];
// a check pushes [label, value, isBad] — isBad true fails the build; omit isBad (or pass
// false) only for genuinely informational counts, each with a comment saying why.
function check(label, value, isBad){ p.push([label, value]); if(isBad) fail.push(label); }
// duplicate ids
const ids={}; d.querySelectorAll('[id]').forEach(e=>{ids[e.id]=(ids[e.id]||0)+1});
{ const bad=Object.entries(ids).filter(([k,v])=>v>1).map(([k])=>k); check('duplicate ids', bad.join(',')||'none', bad.length>0); }
// dead chapter-index links
{ const dead=[...d.querySelectorAll('.chgo')].filter(b=>!d.getElementById(b.dataset.sec)).map(b=>b.dataset.sec);
  check('dead chapter links', dead.join(',')||'none', dead.length>0); }
// sections not in rail / rail not in sections
const secs=[...d.querySelectorAll('main section')].map(s=>s.id);
const rail=[...d.querySelectorAll('#rail button[data-t]')].map(b=>b.dataset.t);
{ const bad=secs.filter(s=>!rail.includes(s)); check('sections missing from rail', bad.join(',')||'none', bad.length>0); }
{ const bad=rail.filter(r=>!secs.includes(r)); check('rail entries with no section', bad.join(',')||'none', bad.length>0); }
// SECTAG targets that are not sections
const sectag=w.eval('Object.keys(SECTAG)');
{ const bad=sectag.filter(k=>!secs.includes(k)); check('SECTAG keys with no section', bad.join(',')||'none', bad.length>0); }
// tags with no cards
const tags=[...new Set(sectag.map(k=>w.eval('SECTAG["'+k+'"]')))];
{ const empty=tags.filter(t=>w.eval('countTag("'+t+'")')===0); check('section tags with zero cards', empty.join(',')||'none', empty.length>0); }
// TAGNAME coverage
const allTags=new Set(); w.eval('CARDTAG').forEach(t=>(t||'').split(' ').filter(Boolean).forEach(x=>allTags.add(x)));
{ const bad=[...allTags].filter(t=>!w.eval('TAGNAME["'+t+'"]')); check('card tags missing a display name', bad.join(',')||'none', bad.length>0); }
// chapter map targets
{ const bad=w.eval(`(function(){const o=[];ALLW.forEach(wk=>wk.items.forEach(x=>{const c=chapInfo(x.t);if(c.sec&&!document.getElementById(c.sec))o.push(x.t)}));return o.join('|')})()`);
  check('schedule links that 404', bad||'none', !!bad); }
// cards sanity
{ const n=w.eval('QS.filter(q=>!q[1]||q[1].length<10).length'); check('cards with empty answer', n+'', n>0); }
/* q.flag==='options' is a pre-existing, UI-disclosed marker (papers view shows "an option did
   not extract cleanly" for these — index.html:13003), set on records where an OCR/parse pass
   merged two options together and left the last slot blank. Those are known, not silent — only
   a blank option on a record WITHOUT that flag is a new, undisclosed defect worth failing on. */
{ const n=w.eval("PQ.filter(q=>q.o.some(o=>!o) && q.flag!=='options').length");
  const flagged=w.eval("PQ.filter(q=>q.o.some(o=>!o) && q.flag==='options').length");
  check('questions with a blank option (unflagged — new defect)', n+'', n>0);
  check('questions with a blank option (flag:"options" — already disclosed in-app)', flagged+''); }
{ const n=w.eval("PQ.filter(q=>[...q.a].some(c=>!'אבגד'.includes(c))).length"); check('questions whose key letter is impossible', n+'', n>0); }
// tables without captions
{ const n=d.querySelectorAll('.tscroll').length - d.querySelectorAll('.cap').length; check('tables lacking a caption', n+'', n>0); }
// storage keys used vs backed up — informational: a raw list to eyeball, not a pass/fail shape
// (some storage keys are read-only or write-only by design; a mismatch here isn't inherently a bug)
const used=[...html.matchAll(/window\.storage\.(?:get|set)\(\s*([A-Z]+KEY|'[^']+')/g)].map(m=>m[1]);
check('distinct storage call sites', [...new Set(used)].join(' '));
check('backup key list', w.eval('BKEYS.join(" ")'));
// sizes — informational counts with no "correct" target value
check('DOM elements', d.querySelectorAll('*').length+'');
check('search index entries', w.eval('INDEX.length')+'');
check('PQ loaded', pqCount+'');
check('runtime errors', errs.length+' '+errs.slice(0,3).join('|'), errs.length>0);
p.forEach(([k,v])=>console.log((k+':').padEnd(38), v));
if(fail.length){ console.log('FAIL:', fail.join(', ')); process.exit(1); }
process.exit(0);
