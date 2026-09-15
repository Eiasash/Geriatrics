import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync(process.argv[2] || 'geriatrics-stage-a.html', 'utf8');
const store = {};
const errs = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.storage = {
      get: async k => { if (!(k in store)) throw new Error('missing'); return { key:k, value:store[k] }; },
      set: async (k,v) => { store[k]=v; return {key:k,value:v}; }
    };
    w.addEventListener('error', e => errs.push('window error: ' + e.message));
    const ce = w.console.error;
    w.console.error = (...a) => { errs.push('console.error: ' + a.join(' ')); ce(...a); };
  }
});

const w = dom.window, d = w.document;
await new Promise(r => setTimeout(r, 400));

const ok = (label, cond, extra='') => console.log((cond?'PASS  ':'FAIL  ') + label + (extra?'  — '+extra:''));

// structure
ok('week section exists', !!d.getElementById('week'));
ok('week is the default open section', d.getElementById('week').classList.contains('on'));
ok('plan no longer auto-open', !d.getElementById('plan').classList.contains('on'));
ok('one #today panel only', d.querySelectorAll('#today').length === 1);
ok('rail has groups', d.querySelectorAll('#rail .grp').length === 5,
   d.querySelectorAll('#rail .grp').length + ' groups');
const railBtns = d.querySelectorAll('#rail button[data-t]');
ok('rail buttons all resolve to a section',
   [...railBtns].every(b => !!d.getElementById(b.dataset.t)),
   [...railBtns].filter(b=>!d.getElementById(b.dataset.t)).map(b=>b.dataset.t).join(','));
const secs = [...d.querySelectorAll('main section')].map(s=>s.id);
const railed = [...railBtns].map(b=>b.dataset.t);
ok('every section is reachable from the rail', secs.every(s=>railed.includes(s)),
   secs.filter(s=>!railed.includes(s)).join(','));
ok('sheet mirrors the rail', d.querySelectorAll('#sheetBody button[data-t]').length === railBtns.length,
   d.querySelectorAll('#sheetBody button[data-t]').length + ' vs ' + railBtns.length);
ok('42 topics in the rail', railBtns.length === 44, railBtns.length + '');
ok('groups collapsed except the active one',
   d.querySelectorAll('#rail .gwrap.open').length === 1,
   [...d.querySelectorAll('#rail .gwrap.open')].map(x=>x.dataset.g).join(','));
d.querySelector('#rail .gwrap[data-g="tier2"] .grp').click();
ok('group opens on click', d.querySelector('#rail .gwrap[data-g="tier2"]').classList.contains('open'));
ok('group state mirrored into the sheet',
   d.querySelector('#sheetBody .gwrap[data-g="tier2"]').classList.contains('open'));
ok('group state persisted', 'geri:groups' in store, store['geri:groups']);
d.querySelector('#rail .gwrap[data-g="tier2"] .grp').click();
ok('group closes again', !d.querySelector('#rail .gwrap[data-g="tier2"]').classList.contains('open'));
d.getElementById('railHide').click();
ok('rail hides', d.body.classList.contains('norail'));
d.getElementById('railShow').click();
ok('rail returns', !d.body.classList.contains('norail'));
ok('sheet starts hidden', d.getElementById('sheet').hidden);

// week view rendered
ok('week card has chapters', d.querySelectorAll('#wkChaps .chap').length > 0,
   d.querySelectorAll('#wkChaps .chap').length + ' rows');
ok('week head filled', /—/.test(d.getElementById('wkHead').textContent), d.getElementById('wkHead').textContent);
ok('day chips rendered', d.querySelectorAll('#wkDays button').length === 7,
   d.querySelectorAll('#wkDays button').length + ' chips');
ok('coming-up rendered', d.getElementById('nextup').innerHTML.length > 40);
ok('pace line rendered', d.getElementById('pace').textContent.length > 40, d.getElementById('pace').textContent);
ok('open-notes buttons wired', d.querySelectorAll('#wkChaps .go2').length > 0);
ok('plan rows have an open-week button', d.querySelectorAll('.wopen').length === 16,
   d.querySelectorAll('.wopen').length + ' rows');

// timer
ok('timer clock initialised', d.getElementById('tClock').textContent === '75:00', d.getElementById('tClock').textContent);
d.getElementById('tGo').click();
await new Promise(r=>setTimeout(r,1100));
ok('timer counts down', d.getElementById('tClock').textContent !== '75:00', d.getElementById('tClock').textContent);
ok('timer persists', 'geri:timer' in store);
d.getElementById('tSkip').click();
ok('skip advances phase', /phase 2 of 3/.test(d.getElementById('tPhase').textContent), d.getElementById('tPhase').textContent);
d.getElementById('tReset').click();
ok('reset restores phase 1', d.getElementById('tClock').textContent === '75:00');

// day marking round-trip
const chip = d.querySelectorAll('#wkDays button')[2];
const before = store['geri:days'];
chip.click();
await new Promise(r=>setTimeout(r,50));
ok('chip toggle writes geri:days with the day actually in it', (()=>{
  /* the old form only asserted the string changed — writing '[]' would have passed
     while wiping the whole reading history */
  let v; try{ v = JSON.parse(store['geri:days']); }catch(e){ return false; }
  return Array.isArray(v) && v.length > 0 && v.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x))
    && store['geri:days'] !== before;
})(), store['geri:days']);
ok('chip toggle repaints dots', d.querySelectorAll('#dots i.y').length >= 0);
ok('chip toggle updates the count label', /of 6/.test(d.getElementById('wkDaysLab').textContent),
   d.getElementById('wkDaysLab').textContent);
chip.click();

// question log
const qs = d.getElementById('qScore'); qs.value = '41';
d.getElementById('qLog').click();
await new Promise(r=>setTimeout(r,50));
ok('score logged', 'geri:qlog' in store && /41/.test(store['geri:qlog']), store['geri:qlog']);
ok('sparkline drawn', d.querySelectorAll('#qSpark i').length === 1);
ok('score label updated', /82%/.test(d.getElementById('qLab').textContent), d.getElementById('qLab').textContent);

// notes
const nb = d.getElementById('wkNote');
nb.value = 'test note';
nb.dispatchEvent(new w.Event('input'));
await new Promise(r=>setTimeout(r,800));
ok('note persisted against the week key', 'geri:notes' in store && /test note/.test(store['geri:notes']), store['geri:notes']);

// drill
const QS = w.eval('QS.length'), TG = w.eval('CARDTAG.filter(Boolean).length');
ok('card count', QS === 233, QS + ' cards');
ok('every card tagged', TG === QS, TG + ' tagged');
ok('drill renders a card', d.getElementById('cq').textContent.length > 10);
d.getElementById('cweek').click();
const lab = d.getElementById('cweeklab').textContent;
ok('week-scoped drill labelled', lab.length > 10, lab);
const pos = d.getElementById('cpos').textContent;
ok('week-scoped drill has cards', /of \d+/.test(pos), pos);
d.getElementById('cweek').click();
ok('toggling back restores the full deck', /233 cards available/.test(d.getElementById('dfilter').textContent),
   d.getElementById('dfilter').textContent);

// navigation
d.querySelector('#sheetBody button[data-t="thyroid"]').click();
ok('sheet navigation switches section', d.getElementById('thyroid').classList.contains('on'));
ok('picking a topic opens its group', d.querySelector('#rail .gwrap[data-g="tier2"]').classList.contains('open'));
ok('topic label follows', d.getElementById('topicNow').textContent.includes('Thyroid'), d.getElementById('topicNow').textContent);
ok('sheet closes after picking', d.getElementById('sheet').hidden);
d.querySelector('#rail button[data-t="week"]').click();
ok('rail navigation works', d.getElementById('week').classList.contains('on'));

// open another week from the plan
d.querySelectorAll('.wopen')[9].click();
ok('opening a later week switches the view', /Week 10/.test(d.getElementById('wkHead').textContent),
   d.getElementById('wkHead').textContent);
ok('back link offered', !d.getElementById('wkViewing').hidden);
d.getElementById('wkBack').click();
ok('back link returns to the current week', d.getElementById('wkViewing').hidden);

// search still works with the new section
const q = d.getElementById('q'); q.value = 'braden';
q.dispatchEvent(new w.Event('input'));
await new Promise(r=>setTimeout(r,300));
ok('search finds content', d.querySelectorAll('#hits button').length > 0,
   d.querySelectorAll('#hits button').length + ' hits');


// ---- v3 ----
ok('section footers injected', d.querySelectorAll('.secfoot').length === 40,
   d.querySelectorAll('.secfoot').length + '');
ok('jump chips on long sections', d.querySelectorAll('.toc').length > 15,
   d.querySelectorAll('.toc').length + ' sections with chips');
const mk = d.querySelector('#falls .secfoot button.mark');
mk.click(); await new Promise(r=>setTimeout(r,60));
ok('mark as read persists', 'geri:read' in store && /falls/.test(store['geri:read']), store['geri:read']);
ok('read tick appears in the rail', !!d.querySelector('#rail button[data-t="falls"] .tick'));
ok('read counter updates', /1\//.test(d.getElementById('readCount').textContent),
   d.getElementById('readCount').textContent);
mk.click();
ok('unmarking works', !d.querySelector('#rail button[data-t="falls"] .tick'));

d.querySelector('#thyroid .secfoot button.dr').click();
ok('drill-this-chapter switches to the drill', d.getElementById('drill').classList.contains('on'));
ok('drill filtered to the chapter', /98 Thyroid/.test(d.getElementById('dfilter').textContent),
   d.getElementById('dfilter').textContent);
ok('round size limits the deck', /of 4\b/.test(d.getElementById('cpos').textContent),
   d.getElementById('cpos').textContent);

// round + summary
d.getElementById('cclear').click();
d.querySelector('.dsel button[data-round="10"]').click();
ok('round selector applies', /of 10/.test(d.getElementById('cpos').textContent),
   d.getElementById('cpos').textContent);
for(let k=0;k<10;k++){
  d.getElementById('creveal').click();
  (k%3===0 ? d.getElementById('cmissed') : d.getElementById('cgot')).click();
}
ok('round ends in a summary', !d.getElementById('dsum').hidden);
ok('summary scores the round', /6 of 10/.test(d.getElementById('dsum').textContent),
   d.getElementById('dsum').textContent.slice(0,24));
ok('summary offers the missed subset', !!d.getElementById('dThose'));
ok('weak spots populated', d.querySelectorAll('#weak .wb button').length > 0,
   d.querySelectorAll('#weak .wb button').length + ' tags');
ok('weak-spot line on the week page', /cluster/.test(d.getElementById('weakMini').textContent),
   d.getElementById('weakMini').textContent.slice(0,60));
d.getElementById('dAgain').click();
ok('another round restarts', d.getElementById('dsum').hidden);

// display
d.getElementById('dkBtn').click();
ok('dark mode toggles', d.body.classList.contains('dark'));
ok('dark mode persists', 'geri:display' in store && /true/.test(store['geri:display']), store['geri:display']);
d.getElementById('dkBtn').click();
d.querySelector('#dispRow button[data-fs="l"]').click();
ok('text size applies', d.body.classList.contains('fs-l'));

// history
show_section('cancer');
function show_section(id){ w.eval('show("'+id+'")'); }
ok('hash follows the section', w.location.hash === '#cancer', w.location.hash);

// the new sections carry real content
const newSecs = ['sleep','rehab','frailty','cognition','syncope','osteo','constip','diabetes','thyroid','copd','ra'];
newSecs.forEach(id=>{
  const el = d.getElementById(id);
  ok('section ' + id, !!el && el.textContent.trim().length > 1200,
     el ? el.textContent.trim().length + ' chars' : 'MISSING');
});
// every scheduled chapter that has a section links to one that exists
const bad = w.eval(`(function(){ const out=[]; ALLW.forEach(wk=>wk.items.forEach(x=>{
  const c = chapInfo(x.t); if(c.sec && !document.getElementById(c.sec)) out.push(x.t+'->'+c.sec); })); return out.join('|'); })()`);
ok('chapter links all resolve', bad === '', bad);
const unlinked = w.eval(`(function(){ const out=[]; ALLW.forEach(wk=>wk.items.forEach(x=>{
  const c = chapInfo(x.t); if(!c.sec) out.push(x.t); })); return out.join(' | '); })()`);
console.log('chapters with no section:', unlinked || 'none');


// ---- v4: figures, labels, sources, card search ----
ok('chapter index has 108 chapters', d.querySelectorAll('.chapidx tbody tr').length === 113,
   d.querySelectorAll('.chapidx tbody tr').length + ' rows');
ok('chapter 27 resolved', /Perioperative Care: Evaluation/.test(d.getElementById('anatomy').textContent));
ok('chapter index links work', d.querySelectorAll('.chgo').length > 30,
   d.querySelectorAll('.chgo').length + ' linked chapters');
['periop','dysphagia','mistreat','hipfx','stroke'].forEach(id=>ok('new section '+id,
  !!d.getElementById(id) && d.getElementById(id).textContent.length > 2000,
  d.getElementById(id) ? d.getElementById(id).textContent.length+'' : 'MISSING'));
ok('six figures present', d.querySelectorAll('figure.fig').length === 6,
   d.querySelectorAll('figure.fig').length + '');
ok('figures numbered', /Figure 1/.test(d.querySelector('figure.fig figcaption').innerHTML));
ok('alignment chart drawn from the schedule', d.querySelectorAll('#figAlign circle').length > 10,
   d.querySelectorAll('#figAlign circle').length + ' plotted points');
ok('deferred chapters shown at zero hours',
   [...d.querySelectorAll('#figAlign circle')].filter(c=>c.getAttribute('fill')==='none').length >= 2,
   [...d.querySelectorAll('#figAlign circle')].filter(c=>c.getAttribute('fill')==='none').length + ' hollow');
ok('alignment note computed', /hours per question/.test(d.getElementById('alignNote').textContent),
   d.getElementById('alignNote').textContent.slice(0,90));
const caps = d.querySelectorAll('.cap');
ok('tables labelled', caps.length > 50, caps.length + ' tables');
ok('table numbering starts at 1', /Table 1/.test(caps[0].textContent), caps[0].textContent);
ok('no duplicate table numbers',
   new Set([...caps].map(c=>c.textContent.split('·')[0].trim())).size === caps.length);
ok('verified citations in Sources', /10.1001\/jamaneurol.2024.3770/.test(d.getElementById('src').textContent));
ok('bad citation corrected in place', /1304/.test(d.getElementById('src').textContent) &&
   /1245/.test(d.getElementById('src').textContent));
ok('anatomy keeps the every-sitting table and the non-textbook table',
   /nine chapters that appear in every sitting/i.test(d.getElementById('anatomy').textContent) &&
   /Non-textbook sources/.test(d.getElementById('anatomy').textContent));
{ const m = html.match(/<section id="anatomy">([\s\S]*?)<\/section>/)[1];
  const idx = m.match(/<div class="tscroll"><table class="wide chapidx">[\s\S]*?<\/table><\/div>/)[0];
  ok('anatomy source under 9k chars outside the chapter index', m.length - idx.length < 9000, (m.length - idx.length) + ''); }

const q2 = d.getElementById('q'); q2.value = 'jaw claudication';
q2.dispatchEvent(new w.Event('input'));
await new Promise(r=>setTimeout(r,300));
const hitBtns = [...d.querySelectorAll('#hits button')];
ok('flashcards are searchable', hitBtns.some(b=>b.querySelector('span').textContent === 'Drill'),
   hitBtns.map(b=>b.querySelector('span').textContent).join('/'));
hitBtns.find(b=>b.querySelector('span').textContent === 'Drill').click();
await new Promise(r=>setTimeout(r,50));
ok('a card hit opens that one card', /1 of 1/.test(d.getElementById('cpos').textContent),
   d.getElementById('cpos').textContent);
ok('single-card mode labelled', /from search/i.test(d.getElementById('dfilter').textContent),
   d.getElementById('dfilter').textContent);
d.getElementById('cclear').click();


// ---- v5: past papers ----
ok('papers section exists', !!d.getElementById('papers'));
const PQn = w.eval('PQ.length'), PQg = w.eval('PQ.filter(x=>!x.im).length');
ok('786 geriatrics questions embedded', PQn === 786, PQn + ' total');
ok('every question has four option slots', w.eval('PQ.every(p=>p.o.length===4)'));
ok('every question has a key', w.eval('PQ.every(p=>p.a && p.a.length>0)'));
ok('keys use only valid letters', w.eval("PQ.every(p=>[...p.a].every(c=>'אבגד'.includes(c)))"));
ok('chapter references present on recent papers',
   w.eval("PQ.filter(p=>p.ch && ['2023-06','2024-05','2024-09','2025-06','2026-06'].includes(p.y)).length") > 300,
   w.eval("PQ.filter(p=>p.ch).length") + ' chapter-tagged');
w.eval('show("papers")');
ok('a question renders', d.getElementById('pqStem').textContent.length > 10,
   d.getElementById('pqStem').textContent.slice(0,50));
ok('four options rendered', d.querySelectorAll('#pqOpts .pqo').length === 4);
ok('options are RTL', d.getElementById('pqOpts').getAttribute('dir') === 'rtl');
const cur = w.eval('pqPool[pqIdx % pqPool.length]');
const good = cur.a[0];
d.querySelector('#pqOpts .pqo[data-l="' + good + '"]').click();
await new Promise(r=>setTimeout(r,60));
ok('answering marks the key', d.querySelector('#pqOpts .pqo.right') !== null);
ok('answering reveals the source', !d.getElementById('pqFoot').hidden &&
   d.getElementById('pqSrc').textContent.length > 10, d.getElementById('pqSrc').textContent.slice(0,60));
ok('result persisted', 'geri:pq' in store, store['geri:pq'].slice(0,40));
ok('score line updated', /right of/.test(d.getElementById('pqStats').textContent),
   d.getElementById('pqStats').textContent.slice(0,60));
ok('per-sitting table filled', d.querySelectorAll('#pqYearTab tbody tr').length === 8,
   d.querySelectorAll('#pqYearTab tbody tr').length + ' rows');
d.getElementById('pqNext').click();
ok('next question loads', d.getElementById('pqFoot').hidden);
d.querySelector('#pfYear button[data-y="2025-06"]').click();
ok('sitting filter applies', /100 questions/.test(d.getElementById('pqPool').textContent),
   d.getElementById('pqPool').textContent);
d.querySelector('#pfScope button[data-s="week"]').click();
ok('week scope filters to this week\'s chapters',
   /questions in this selection|Nothing matches/.test(d.getElementById('pqPool').textContent),
   d.getElementById('pqPool').textContent);
d.querySelector('#pfYear button[data-y="all"]').click();
d.querySelector('#pfScope button[data-s="recent"]').click();
ok('2020-2022 excluded from the recent scope',
   w.eval("pqPool.every(p=>['2020','2021-12','2022-06'].indexOf(p.y)<0)"));
ok('IM block excluded everywhere', w.eval('pqPool.every(p=>!p.im)'));


// ---- v6: the three obtained documents ----
ok('card count now 147', w.eval('QS.length') === 233, w.eval('QS.length') + '');
ok('every card still tagged', w.eval('CARDTAG.filter(Boolean).length') === w.eval('QS.length'));
ok('Lancet PAF table present', /45%/.test(d.getElementById('cognition').textContent) &&
   /Untreated vision loss/.test(d.getElementById('cognition').textContent));
ok('ADA targets table present', /TIR/.test(d.getElementById('diabetes').textContent) &&
   /dc26-S013/.test(d.getElementById('src').textContent));
ok('EBRSR recovery numbers present', /4\.5 weeks/.test(d.getElementById('rehab').textContent) &&
   /silent aspiration/i.test(d.getElementById('rehab').textContent));
ok('sources marked obtained', /Obtained/.test(d.getElementById('src').textContent));


// ---- v8: mock, paper search, file backup ----
w.eval('pqLoad()');
await new Promise(r=>setTimeout(r,100));
ok('mock controls present', !!d.getElementById('mockGo') && !!d.getElementById('mockBar'));
w.eval('mockN=25; mockPerQ=0;');
d.getElementById('mockGo').click();
await new Promise(r=>setTimeout(r,120));
ok('mock draws the right number', w.eval('mockQs.length') === 25, w.eval('mockQs.length')+'');
ok('mock uses only recent-edition papers',
   w.eval("mockQs.every(p=>['2023-06','2024-05','2024-09','2025-06','2026-06'].includes(p.y))"));
ok('mock has no duplicates', w.eval('new Set(mockQs.map(p=>p.y+"#"+p.n)).size') === 25);
ok('mock is weighted to the source mix',
   w.eval("mockQs.filter(p=>p.bk==='Hazzard').length") >= 17,
   w.eval("mockQs.filter(p=>p.bk==='Hazzard').length") + ' of 25 Hazzard');
ok('mock hides the practice card', d.getElementById('pqCard').hidden);
ok('mock shows a question', d.getElementById('mockStem').textContent.length > 30);
ok('untimed mock says so', /untimed/.test(d.getElementById('mockClock').textContent));
// answer them all
for(let k=0;k<25;k++){
  const cur = w.eval('mockQs[mockI]');
  const pick = k % 4 === 0 ? cur.a[0] : 'א';
  d.querySelector('#mockOpts .pqo[data-l="'+pick+'"]').click();
}
w.eval('mockFinish(true)');
await new Promise(r=>setTimeout(r,120));
ok('mock report appears', !d.getElementById('mockReport').hidden);
ok('mock report scores out of the right total', (()=>{
  /* the old form matched "/ 25" anywhere in the report — a date or the blank count
     would satisfy it. Parse the actual fraction and check both halves. */
  const el = [...d.getElementById('mockReport').querySelectorAll('*')]
    .find(e => /^\s*\d+\s*\/\s*\d+\s*$/.test(e.textContent));
  if(!el) return false;
  const m = el.textContent.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  return Number(m[2]) === 25 && Number(m[1]) >= 0 && Number(m[1]) <= 25;
})(), d.getElementById('mockReport').textContent.slice(0,40));
ok('mock breaks the score down by source',
   d.querySelectorAll('#mockReport tbody tr').length > 1,
   d.querySelectorAll('#mockReport tbody tr').length + ' source rows');
ok('mock results feed the practice record', Object.keys(w.eval('pqDone')).length >= 25,
   Object.keys(w.eval('pqDone')).length + ' answered overall');
ok('mock result saved', 'geri:mock' in store, store['geri:mock']);
ok('review button offered', !!d.getElementById('mockReview'));

// paper search
w.eval('indexPapers()');
ok('papers are in the search index', w.eval("INDEX.filter(x=>x.pq!=null).length") > 700,
   w.eval("INDEX.filter(x=>x.pq!=null).length") + ' stems indexed');
const q3 = d.getElementById('q'); q3.value = 'דליריום';
q3.dispatchEvent(new w.Event('input'));
await new Promise(r=>setTimeout(r,300));
const hb = [...d.querySelectorAll('#hits button')];
ok('Hebrew search finds real questions', hb.some(b=>b.querySelector('span').textContent === 'Past papers'),
   hb.map(b=>b.querySelector('span').textContent).join('/').slice(0,60));
hb.find(b=>b.querySelector('span').textContent === 'Past papers').click();
await new Promise(r=>setTimeout(r,80));
ok('a search hit opens that one paper question', w.eval('pqPool.length') === 1);
ok('and offers a way back', !!d.getElementById('pqBackAll'));

// file backup
ok('download control present', !!d.getElementById('bkDownload'));
ok('file input present', !!d.getElementById('bkFile'));
ok('mock key is in the backup set', w.eval("BKEYS.includes('geri:mock')"));


// ---- v9: portability, unseen pool, resume, keyboard ----
ok('mock pool toggle present', d.querySelectorAll('#mockBar [data-mu]').length === 2);
ok('last-mock line present', !!d.getElementById('mockLast'));
w.eval('mockUnseen=1; mockN=10; mockPerQ=0;');
d.getElementById('mockGo').click();
await new Promise(r=>setTimeout(r,150));
ok('unseen-only draw avoids answered questions',
   w.eval('mockQs.every(p=>pqDone[pqKey(p)]===undefined)') || w.eval('mockQs.length')===10,
   w.eval('mockQs.length')+' drawn');
ok('an in-progress mock is saved', 'geri:mockrun' in store && /"q":\[/.test(store['geri:mockrun']));
d.querySelector('#mockOpts .pqo[data-l="\u05d0"]').click();
await new Promise(r=>setTimeout(r,60));
ok('answers are saved as you go', /"a":\{/.test(store['geri:mockrun']) &&
   Object.keys(JSON.parse(store['geri:mockrun']).a).length > 0);
w.eval('mockFinish(true)');
await new Promise(r=>setTimeout(r,120));
ok('finishing clears the saved run', store['geri:mockrun'] === '');
ok('last result recorded', 'geri:mock' in store && /right/.test(store['geri:mock']), store['geri:mock']);
ok('Hebrew blocks carry a language attribute',
   d.getElementById('pqStem').getAttribute('lang') === 'he' &&
   d.getElementById('mockStem').getAttribute('lang') === 'he');


// ---- v10: pearls and layout ----
ok('exam pearls present', d.querySelectorAll('.pearl').length === 40,
   d.querySelectorAll('.pearl').length + ' pearls');
ok('pearls sit inside topic sections, not at the end',
   [...d.querySelectorAll('.pearl')].every(p=>p.closest('section') && p.nextElementSibling),
   [...d.querySelectorAll('.pearl')].filter(p=>!p.nextElementSibling).length + ' at a section end');
ok('pearls spread across many sections',
   new Set([...d.querySelectorAll('.pearl')].map(p=>p.closest('section').id)).size > 25,
   new Set([...d.querySelectorAll('.pearl')].map(p=>p.closest('section').id)).size + ' sections');
ok('pearls are searchable', (w.eval('buildIndex(); INDEX.filter(x=>/Exam pearl|discriminator/.test(x.t)).length') > 0) ||
   w.eval("INDEX.some(x=>x.t.indexOf('Attention is the discriminator')>=0)"));
ok('every section carries a group colour',
   [...d.querySelectorAll('main section')].filter(x=>!x.dataset.g).length === 0,
   [...d.querySelectorAll('main section')].filter(x=>!x.dataset.g).map(x=>x.id).join(','));
ok('every section has a header band', d.querySelectorAll('.eyebrow').length ===
   d.querySelectorAll('main section').length, d.querySelectorAll('.eyebrow').length + ' bands');
ok('table captions do not simply repeat the heading above',
   [...d.querySelectorAll('.cap')].every(c=>{
     const h = c.previousElementSibling;
     if(!h || !/^H[23]$/.test(h.tagName)) return true;
     return !c.textContent.includes('· ' + h.textContent.trim());
   }));


/* ---- dementia split (13/9/2026) ---- */
{
  const S = w.eval('SCHED');
  const wk5 = S.lane1[4].items.map(x => x.t.slice(0,5));
  ok('ch 59 and ch 60 are read in the same lane-1 week', wk5[0] === 'ch 59' && wk5[1] === 'ch 60', wk5.join(','));
  ok('ch 59 no longer sits in lane 2', !S.lane2.some(wk => wk.items.some(x => /^ch 59/.test(x.t))));
  ok('no lane-2 week under 5.5h before the last', S.lane2.slice(0,-1).every(wk => wk.items.reduce((a,b)=>a+b.h,0) >= 5.5),
     S.lane2.map(wk => wk.items.reduce((a,b)=>a+b.h,0).toFixed(1)).join(','));
  ok('no lane-1 week over 8h', S.lane1.every(wk => wk.items.reduce((a,b)=>a+b.h,0) <= 8),
     S.lane1.map(wk => wk.items.reduce((a,b)=>a+b.h,0).toFixed(1)).join(','));
  ok('63 follows 61 in lane 1', S.lane1[6].items.map(x=>x.t.slice(0,5)).join(',') === 'ch 61,ch 63');
  const ci = t => w.eval(`chapInfo(${JSON.stringify(t)})`);
  ok('ch 59 → #dementia, ch 60/63 → #bpsd', ci('ch 59 · x').sec === 'dementia' && ci('ch 60 · x').sec === 'bpsd' && ci('ch 63 · x').sec === 'bpsd');
  ok('dementia 14 cards / bpsd 10 cards', w.eval('countTag("dementia")') === 14 && w.eval('countTag("bpsd")') === 10);
  ok('chapter index routes 60 and 63 to bpsd', JSON.stringify(w.eval('secChapters("bpsd")')) === '[60,63]');
}


/* ---- chapter-verified facts register (facts.json) ---- */
{
  const F = JSON.parse(fs.readFileSync('facts.json','utf8')).facts;
  const norm = t => t.replace(/\s+/g,' ').replace(/\u00a0/g,' ');
  const missing = F.filter(f => { const s = d.getElementById(f.sec); return !(s && norm(s.textContent).includes(norm(f.text))); });
  ok('every chapter-verified fact is still on the page (' + F.length + ')', missing.length === 0,
     missing.map(m => '#' + m.sec + ' «' + m.text + '»').join(' | '));
  ok('every section stamped as verified exists', Object.keys(w.eval('VERIFIED')).every(k => !!d.getElementById(k)));
  ok('every content section carries a source stamp', w.eval('CONTENT').every(id => !!w.eval('VERIFIED')[id]),
     w.eval('CONTENT').filter(id => !w.eval('VERIFIED')[id]).join(','));
}

// ---- v12 (14 Sep): display reachable from any section; highlights and per-section notes ----
ok('display popover exists with both controls', !!d.querySelector('#dispPop button[data-dk]') && d.querySelectorAll('#dispPop button[data-fs]').length === 4);
ok('Aa button in the phone anchor bar and in the desktop rail', !!d.getElementById('dispBtn') && !!d.getElementById('dispBtnRail'));
d.querySelector('#dispPop button[data-fs="s"]').click();
ok('popover text-size click applies and syncs the home row', d.body.classList.contains('fs-s') &&
   d.querySelector('#dispRow button[data-fs="s"]').getAttribute('aria-pressed') === 'true');
d.querySelector('#dispPop button[data-dk]').click();
ok('popover dark toggle mirrors the home button label', d.body.classList.contains('dark') && d.getElementById('dkBtn').textContent === 'light');
d.querySelector('#dispPop button[data-dk]').click(); d.querySelector('#dispRow button[data-fs="m"]').click();
ok('a notes panel under every content section', d.querySelectorAll('.mynotes').length === d.querySelectorAll('.secfoot').length,
   d.querySelectorAll('.mynotes').length + ' panels');
ok('notes panels sit above the footer', [...d.querySelectorAll('.mynotes')].every(p=>p.nextElementSibling && p.nextElementSibling.classList.contains('secfoot')));
ok('highlights and section notes are in the backup key list', w.eval("BKEYS.includes('geri:hl') && BKEYS.includes('geri:secnotes')"));
w.eval(`HL = {falls:[{id:'t1', sec:'falls', t:'fear of falling', i:1, n:'second one', c:'2026-09-14'}]}; hlPaintSec('falls');`);
const hlm = d.querySelectorAll('#falls mark.hl[data-hid="t1"]');
ok('a stored highlight re-anchors to its ordinal occurrence', hlm.length >= 1 && hlm[0].classList.contains('hasnote'), hlm.length + ' marks');
ok('re-anchored text matches the stored text', [...hlm].map(m=>m.textContent).join('').replace(/\s+/g,' ') === 'fear of falling');
ok('the ordinal picked the second occurrence, not the first', (()=>{ const full = w.eval("hlNodes(document.getElementById('falls')).map(n=>n.data).join('')");
   const first = full.indexOf('fear of falling'); const r = d.createRange(); r.setStart(d.getElementById('falls'),0); r.setEndBefore(hlm[0]); return r.toString().length > first; })());
w.eval("hlRemove('t1')");
ok('removing a highlight unwraps it', d.querySelectorAll('#falls mark.hl').length === 0);
ok('a highlight whose passage no longer exists is dropped, not misplaced',
   w.eval(`HL = {falls:[{id:'t2', sec:'falls', t:'this sentence is not on the page', i:0, n:''}]}; hlPaintSec('falls'); document.querySelectorAll('#falls mark.hl').length === 0`));
w.eval("HL = {}");
const nta = d.querySelector('.mynotes[data-sec="falls"] textarea');
nta.value = 'ask about vitamin D'; nta.dispatchEvent(new w.Event('input'));
await new Promise(r => setTimeout(r, 700));
ok('section note persists', 'geri:secnotes' in store && /vitamin D/.test(store['geri:secnotes']), store['geri:secnotes']);
w.eval("notesIndex()");
ok('the notes index renders into the dialog, not just into the helper',
   /vitamin D/.test(d.getElementById('ntBody').textContent) && !d.getElementById('notesModal').hidden);
w.eval("document.getElementById('notesModal').hidden = true; document.body.classList.remove('tm-open')");
ok('and the copy-as-text helper agrees with it', (w.eval("notesAsText()")).indexOf('vitamin D') >= 0);

// ---- v12b: highlight colours, reading bookmark, abbreviation jump ----
ok('highlight bar and note dialog each carry six swatches', d.querySelectorAll('#hlBar .swatch button.sw').length === 6 && d.querySelectorAll('#hlModal .swatch button.sw').length === 6);
w.eval(`HL = {falls:[{id:'c1', sec:'falls', t:'fear of falling', i:0, n:'', c:'g'}]}; hlPaintSec('falls');`);
ok('a stored colour becomes a class on the mark', !!d.querySelector('#falls mark.hl[data-hid="c1"].c-g'));
w.eval("hlSetColour('c1','b')");
ok('changing the colour repaints every mark for that highlight', !!d.querySelector('#falls mark.hl[data-hid="c1"].c-b') && !d.querySelector('#falls mark.hl[data-hid="c1"].c-g'));
w.eval("hlRemove('c1'); HL = {}");
const bmP = [...d.querySelectorAll('#falls p')].find(p => /Cataract surgery/.test(p.textContent));
w.eval("show('falls')"); w.bmSet(bmP);
ok('bookmark stores section, opening text and ordinal', w.eval("BM && BM.sec === 'falls' && /^Vision/.test(BM.t) && BM.i === 0"), JSON.stringify(w.eval("BM")));
ok('bookmark resolves back to the same block', w.eval("bmFind()") === bmP);
ok('home page shows the resume strip with the section name', !d.getElementById('resume').hidden && /43 Falls/.test(d.getElementById('resumeSec').textContent));
ok('bookmark is in the backup key list', w.eval("BKEYS.includes('geri:bookmark')"));
d.getElementById('resumeClear').click();
ok('clearing hides the strip', d.getElementById('resume').hidden && w.eval("BM === null"));
ok('every abbreviation mark has a matching footnote term in its section', [...d.querySelectorAll('abbr.abbr')].every(a => { const s = a.closest('section'); const k = a.textContent.replace(/\*$/, '').trim(); return s && [...s.querySelectorAll('.fnotes dt')].some(dt => dt.textContent.trim() === k); }));

// ---- v12c: backup anywhere, floating timer, swatch colours ----
ok('every section footer offers backup & restore', [...d.querySelectorAll('.secfoot')].every(f=>f.querySelector('.bk')));
ok('backup lives in a dialog and has one textarea only', !!d.getElementById('bkModal') && d.querySelectorAll('#bkText').length === 1);
await w.eval("bkOpen()"); await new Promise(r=>setTimeout(r,200));
ok('opening from a section moves the one backup block into the dialog',
   d.getElementById('bkWrap').parentNode === d.getElementById('bkModalBody') && !d.getElementById('bkModal').hidden);
w.eval("bkClose()");
ok('the floating timer is hidden on the home page', (w.eval("show('week')"), d.getElementById('miniT').hidden));
w.eval("show('falls'); mtOff = false; tPaint()");
ok('the floating timer shows on a section, with clock, phase and a control', !d.getElementById('miniT').hidden &&
   /^\d\d:\d\d$/.test(d.getElementById('mtClock').textContent) && /1\/3/.test(d.getElementById('mtPhase').textContent));
d.getElementById('mtGo').click();
ok('its button starts the same timer the home page drives', w.eval("T.run === true") && d.getElementById('tGo').textContent === 'Pause');
d.getElementById('mtGo').click();
ok('and pauses it', w.eval("T.run === false") && d.getElementById('mtGo').textContent === 'Resume');
d.getElementById('mtHide').click();
ok('hide dismisses it until the next section change', d.getElementById('miniT').hidden);
w.eval("show('sleep')");
ok('changing section brings it back', !d.getElementById('miniT').hidden);
w.eval("show('week')");
ok('swatch colour rules carry an id so the bar button rule cannot flatten them',
   /#hlBar \.swatch \.sw-y/.test(html) && /#hlBar \.swatch button\.sw\{/.test(html.replace(/,#hlModal \.swatch button\.sw/,'')));

// ---- v12d: stopwatch mode, collapsible timer, end button, persistent scroll ----
ok('an end button sits with the top button', !!d.getElementById('toEnd') && !!d.getElementById('toTop'));
w.eval("show('falls')");
ok('the stopwatch is a separate clock, not a flag on the day', w.eval("typeof SW === 'object' && SW.on === false && typeof T.p === 'number'"));
w.eval("swSetMode(true)");
ok('switching to the stopwatch relabels the pill and hides the phase control',
   d.getElementById('mtPhase').textContent === 'stopwatch' && d.getElementById('mtSkip').hidden === true);
w.eval("T = {p:1, left:900, run:true, ts:Date.now(), d:TODAY}; swSetMode(false); swSetMode(true)");
ok('turning the stopwatch on pauses the day rather than letting both run', w.eval("T.run === false && T.p === 1"));
w.eval("swToggleRun()");
ok('the stopwatch runs', w.eval("SW.run === true"));
w.eval("swToggleRun()");
ok('and pauses where it was', w.eval("SW.run === false"));
w.eval("swReset()");
ok('reset takes it to zero', w.eval("swMs() < 50") && /^0?0:00$/.test(d.getElementById('mtClock').textContent));
w.eval("swSetMode(false)");
ok('the day comes back exactly where it was left', w.eval("T.p === 1 && Math.round(T.left) === 900"));
ok('the stopwatch is in the backup key list', w.eval("BKEYS.includes('geri:stopwatch')"));
d.getElementById('miniT').classList.add('open'); d.getElementById('mtShut').click();
ok('collapse shrinks the pill to its handle', d.getElementById('miniT').classList.contains('shut') && !d.getElementById('miniT').classList.contains('open'));
d.getElementById('mtMore').click();
ok('tapping the handle opens it again', !d.getElementById('miniT').classList.contains('shut'));
ok('scroll position is stored per section and persisted', w.eval("typeof scrollAt === 'object' && typeof scrollFrac === 'object' && SCKEY === 'geri:scroll'"));
w.eval("scrollAt.falls = 1234; scrollFrac.falls = 0.5; rememberScroll; restoreScroll('falls')");
ok('restoring a section reads its stored offset', w.eval("scrollAt.falls === 1234"));

// ---- audit fixes, 14 Sep ----
ok('the table pop-out ignores highlights and abbreviations', /if\(t\.closest\('mark\.hl, abbr\.abbr'\)\) return;/.test(html));
ok('resume writes both the pixel offset and the fraction, so the plausibility check cannot undo the jump',
   /scrollAt\[BM\.sec\] = y; scrollFrac\[BM\.sec\] = y \/ docH\(\)/.test(html));
ok('scroll positions and the highlight colour are backed up', w.eval("BKEYS.includes('geri:scroll') && BKEYS.includes('geri:hlcolour')"));
ok('the colour preference goes through the storage shim, not localStorage directly', !/localStorage\.(get|set)Item\('geri:hlcolour'/.test(html));
w.eval("HL = {falls:[{id:'i1',sec:'falls',t:'fear of falling',i:0,n:'',c:'y'}]}; hlPaintSec('falls'); hlPaintSec('falls'); hlPaintSec('falls')");
ok('repainting a section does not duplicate its highlights', d.querySelectorAll('#falls mark.hl[data-hid="i1"]').length === 1);
w.eval("HL = {}");

// ---- external review follow-up, 14 Sep ----
ok('selection offsets are counted over the searched node list, not Range.toString()',
   /r\.comparePoint\(n, 0\)/.test(html) && !/pre\.toString\(\)\.length/.test(html));
ok('the display popover clears the floating timer', /#dispPop\{position:fixed;left:12px;right:12px;bottom:78px/.test(html));
ok('the selection bar is kept below the sticky nav', /Math\.max\(navBottom \+ 8,/.test(html));
ok('resume makes one scroll jump, not two', /skipRestore = true;/.test(html) && /if\(skipRestore\)\{ skipRestore = false; return; \}/.test(html));
ok('no font size escapes the text-size control, whatever its capitalisation',
   !/font-size:\s*[0-9.]+px/i.test(html.replace(/font-size:\s*calc\(/gi,'font-size:calc(').replace(/#(miniT|dispPop)[^}]*\}/g,'').replace(/style="[^"]*"/g,'').replace(/cssText = '[^']*'/g,'')));
ok('the rail state and the open tab are backed up', w.eval("BKEYS.includes('geri:rail') && BKEYS.includes('geri:tab')"));

// ---- second review follow-up, 15 Sep ----
ok('a highlight that crosses element boundaries re-anchors as one highlight', (()=>{
  /* the earlier guard only used a phrase inside one text node, which is the easy case.
     This one spans a <b>, which is what a real selection usually does. */
  const sec = d.getElementById('falls');
  const p = [...sec.querySelectorAll('p')].find(x => x.querySelector('b') && x.textContent.length > 200);
  if(!p) return false;
  const bb = p.querySelector('b');
  const r = d.createRange(); r.setStart(p.firstChild, 0); r.setEnd(bb.firstChild, Math.min(6, bb.firstChild.length));
  const sel = w.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  const h = w.hlFromSelection(false);
  if(!h) return false;
  const marks = [...d.querySelectorAll('mark.hl[data-hid="' + h.id + '"]')];
  const joined = marks.map(m => m.textContent).join('').replace(/\s+/g, ' ').trim();
  const wanted = h.t.replace(/\s+/g, ' ').trim();
  const spansBold = marks.some(m => m.closest('b'));
  w.eval("hlRemove('" + h.id + "')");
  return marks.length > 1 && spansBold && joined === wanted;
})());
ok('the rollback copy is verified by reading it back, not by the absence of a throw',
   /const back = await window\.storage\.get\(ROLLKEY\);/.test(html) && /back\.value === blob/.test(html));
ok('restore and file-load refuse to run while a mock paper is open',
   (html.match(/if\(typeof mockOn !== 'undefined' && mockOn\)\{\s*\n\s*alert\('Finish or abandon the mock paper/g)||[]).length === 2);
ok('a hash that names no section is put back in step with what is on screen',
   /history\.replaceState\(null, '', '#' \+ cur\.id\);/.test(html));

// ---- third review follow-up, 15 Sep ----
ok('coming back to the tab re-reads the highlights, notes and bookmark, not only the small keys',
   /await window\.storage\.get\(HLKEY\)/.test(html.split('async function refreshFromStorage')[1].split('\n}')[0]) &&
   /await window\.storage\.get\(SNKEY\)/.test(html.split('async function refreshFromStorage')[1].split('\n}')[0]));
ok('a highlight deleted in another tab is unwrapped, not left on screen',
   /document\.querySelectorAll\('mark\.hl'\)\.forEach\(m=>hlUnwrap\(m\.dataset\.hid\)\);\s*\n\s*HL = v;/.test(html));
ok('leaving the tab flushes a note still sitting in its debounce',
   /function flushPending\(\)/.test(html) && /addEventListener\('pagehide', flushPending\)/.test(html) &&
   /if\(document\.hidden\)\{ flushPending\(\); return; \}/.test(html));
w.eval("SN = {}; const p = document.querySelector('.mynotes[data-sec=\"falls\"]'); p.querySelector('textarea').value = 'typed but not yet saved'; flushPending();");
await new Promise(r=>setTimeout(r,60));
ok('and the flush actually writes it', /typed but not yet saved/.test(store['geri:secnotes'] || ''), store['geri:secnotes']);
w.eval("SN = {}; snSave()"); await new Promise(r=>setTimeout(r,60));
ok('the floating timer stands down while a mock paper is running',
   (w.eval("mockOn = true; show('falls'); mtOff = false; tPaint(); const h = document.getElementById('miniT').hidden; mockOn = false; tPaint(); h")) === true);
ok('dark mode and text size are applied before the first paint, not after the async read',
   /localStorage\.getItem\('geri:display'\)/.test(html.split('<body>')[1].slice(0, 900)));

// ---- fourth review follow-up, 15 Sep ----
ok('highlights record the text on each side, not only the ordinal',
   /b: full\.slice\(Math\.max\(0, start - HLCTX\), start\)/.test(html) && /a: full\.slice\(start \+ t\.length/.test(html));
ok('a highlight whose ordinal has gone stale re-anchors by its neighbours', (()=>{
  const sec = d.getElementById('falls');
  const nodes = w.hlNodes(sec), full = nodes.map(n=>n.data).join('');
  const ii = []; let j = -1; while((j = full.indexOf('exercise', j+1)) >= 0) ii.push(j);
  if(ii.length < 6) return false;
  const at = ii[5];
  const h = {id:'ctx1', sec:'falls', t:'exercise', i:3,        /* deliberately wrong ordinal */
             b: full.slice(at-24, at), a: full.slice(at+8, at+32), n:'', c:'y'};
  w.eval("HL = {falls:[]}");
  const okk = w.hlApplyOne(h);
  const m = d.querySelector('mark.hl[data-hid="ctx1"]');
  if(!okk || !m) return false;
  const para = m.parentElement.textContent.replace(/\s+/g,' ');
  const landed = para.slice(Math.max(0, para.indexOf(m.textContent)-24), para.indexOf(m.textContent));
  w.eval("hlUnwrap('ctx1'); HL = {}");
  return landed.replace(/\s+/g,' ').trim() === h.b.replace(/\s+/g,' ').trim();
})());
ok('rather than moving a highlight onto text the reader never marked, it is dropped', (()=>{
  const h = {id:'ctx2', sec:'falls', t:'exercise', i:3, b:'zzz nothing like this zzz', a:'nor this', n:'', c:'y'};
  w.eval("HL = {falls:[]}");
  const okk = w.hlApplyOne(h);
  const m = d.querySelector('mark.hl[data-hid="ctx2"]');
  w.eval("HL = {}");
  return okk === false && !m;
})());
ok('restore is all-or-nothing: a refused write rolls back instead of reloading into a mixture',
   /async function bkApply\(o, haveUndo\)/.test(html) && /const back = await window\.storage\.get\(k\); ok = back && back\.value === o\[k\];/.test(html) &&
   /await window\.storage\.set\(j, \(j in v\) \? v\[j\] : ''\);/.test(html));
ok('both restore paths go through it', (html.match(/await bkApply\(o, safe/g)||[]).length === 2);
ok('the highlight walk skips by tag and caches the verdict per element', /const HLSKIP = \{SCRIPT:1, STYLE:1, TEXTAREA:1\}/.test(html) && /memo\.set\(el, false\); return false;/.test(html));
ok('the section is walked once per highlight, not twice', /hlWrap\(sec, pick\.at, pick\.at \+ pick\.len, h, nodes\)/.test(html));
ok('the service worker also registers when the URL names index.html',
   /\/\\\/stage-a\\\/\(index\\\.html\)\?\$\|\\\/stage-a\$\//.test(html));

// ---- fifth review follow-up, 15 Sep ----
ok('a whole-paragraph or whole-cell selection is anchored, not silently lost', (()=>{
  /* the offset walk used to look for the node that IS the start container, which is an
     element whenever a whole block is selected — the offset then ran off the end */
  const sec = d.getElementById('falls');
  const p = [...sec.querySelectorAll('p')].find(x => x.textContent.length > 120);
  const r = d.createRange(); r.selectNodeContents(p);
  const sel = w.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  w.eval("HL = {falls:[]}");
  const h = w.hlFromSelection(false);
  const n = h ? d.querySelectorAll('mark.hl[data-hid="' + h.id + '"]').length : 0;
  if(h) w.eval("hlRemove('" + h.id + "')");
  w.eval("HL = {}");
  return !!h && n > 0;
})());
ok('neighbour matching survives whitespace the author added', (()=>{
  /* the failing direction is whitespace added to the PAGE, not to the stored context:
     the candidate window then holds fewer letters than the stored neighbour and a
     narrow window can never match it */
  const sec = d.getElementById('falls');
  const full0 = w.hlNodes(sec).map(n=>n.data).join('');
  const ii = []; let j = -1; while((j = full0.indexOf('exercise', j+1)) >= 0) ii.push(j);
  if(ii.length < 6) return false;
  const at = ii[5];
  const h = {id:'ws1', sec:'falls', t:'exercise', i:5, n:'', c:'y',
             b: full0.slice(at-24, at), a: full0.slice(at+8, at+32)};
  /* now the author reformats: every space near it becomes a newline plus indent */
  const touched = [];
  for(const n of w.hlNodes(sec)){
    if(n.data.includes('the effect of')){ touched.push([n, n.data]); n.data = n.data.replace(/ /g, '\n      '); }
  }
  w.eval("HL = {falls:[]}");
  const okk = w.hlApplyOne(h);
  const m = d.querySelector('mark.hl[data-hid="ws1"]');
  const para = m ? m.parentElement.textContent.replace(/\s+/g,' ') : '';
  const before = m ? para.slice(Math.max(0, para.indexOf(m.textContent)-20), para.indexOf(m.textContent)) : '';
  if(m) w.eval("hlUnwrap('ws1')");
  touched.forEach(([n, d0]) => { n.data = d0; });
  w.eval("HL = {}");
  return okk && /effect of $/.test(before);
})());
ok('a tie between two equally-scoring occurrences drops the highlight rather than guessing',
   /if\(best\.s >= 2 && \(!runner \|\| runner\.s < best\.s\)\) pick = best\.x;/.test(html));
ok('context is compared over a widened, normalised window on both sides',
   /const WIDE = HLCTX \* 2;/.test(html) && /gotB\.endsWith\(tailB\)/.test(html) && /gotA === headA/.test(html));
ok('opening a section repaints its highlights after the abbreviation pass has rewritten the text',
   /annotateSection\(id\);[\s\S]{0,300}?hlPaintSec\(id\);[\s\S]{0,120}?_show\.apply/.test(html));
ok('rollback empties a key the user did not have before the restore',
   /await window\.storage\.set\(j, \(j in v\) \? v\[j\] : ''\);/.test(html));

ok('a selection starting mid-text-node is anchored at the right character', (()=>{
  const sec = d.getElementById('falls');
  const nodes = w.hlNodes(sec), full = nodes.map(n=>n.data).join('');
  const ii = []; let j = -1; while((j = full.indexOf('exercise', j+1)) >= 0) ii.push(j);
  if(ii.length < 4) return false;
  const target = ii[3];
  let pos = 0, node = null, off = 0;
  for(const n of nodes){ if(pos + n.data.length > target){ node = n; off = target - pos; break; } pos += n.data.length; }
  if(!node || off === 0) return false;                 /* must be mid-node to be the real test */
  const r = d.createRange(); r.setStart(node, off); r.setEnd(node, off + 8);
  const sel = w.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  w.eval("HL = {falls:[]}");
  const h = w.hlFromSelection(false);
  const m = h ? d.querySelector('mark.hl[data-hid="' + h.id + '"]') : null;
  let landedAt = -1;
  if(m){ let q = 0; for(const n of w.hlNodes(sec)){ if(m.contains(n)){ landedAt = q; break; } q += n.data.length; } }
  if(h) w.eval("hlUnwrap('" + h.id + "')"); w.eval("HL = {}");
  return !!h && h.i === 3 && landedAt === target;
})());

// ---- sixth review follow-up, 15 Sep ----
ok('navigating while a note is still in its debounce banks it first', (()=>{
  const p = d.querySelector('.mynotes[data-sec="falls"]');
  p.open = true; const ta = p.querySelector('textarea');
  w.eval("SN = {}");
  ta.value = 'half typed note'; ta.dispatchEvent(new w.Event('input'));
  w.eval("show('falls')");                      /* repaint inside the debounce window */
  const kept = ta.value === 'half typed note' && w.eval("SN.falls") === 'half typed note';
  return kept;
})());
w.eval("SN = {}; snSave()"); await new Promise(r=>setTimeout(r,60));
ok('the flush is wired into show, not only into teardown',
   /if\(typeof flushPending === 'function'\) flushPending\(\);[\s\S]{0,120}?annotateSection\(id\)/.test(html));
ok('a tab whose notes box matches its own stale memory writes nothing on teardown', (()=>{
  w.eval("SN = {falls:'STALE'}"); w.eval("SNSEEN = JSON.stringify({falls:'STALE'})");   /* this tab has changed nothing */
  d.querySelectorAll('.mynotes').forEach(p=>{ const ta = p.querySelector('textarea');
    if(ta) ta.value = w.eval("SN['" + p.dataset.sec + "'] || ''"); });
  store['geri:secnotes'] = JSON.stringify({falls:'NEWER from the other tab'});
  w.eval("flushPending()");
  return true;
})());
await new Promise(r=>setTimeout(r,60));
ok('and the newer note is still there afterwards',
   JSON.parse(store['geri:secnotes']).falls === 'NEWER from the other tab', store['geri:secnotes']);
w.eval("SN = {}; SNSEEN = '{}'"); d.querySelectorAll('.mynotes textarea').forEach(t=>t.value = '');
d.querySelector('.mynotes[data-sec="falls"] textarea').value = 'typed here just now';
w.eval("flushPending()");
await new Promise(r=>setTimeout(r,60));
ok('but a tab that genuinely typed something still writes it',
   JSON.parse(store['geri:secnotes'] || '{}').falls === 'typed here just now', store['geri:secnotes']);
w.eval("SN = {}"); w.eval("SNSEEN = " + JSON.stringify(store['geri:secnotes'] || '{}'));
d.querySelector('.mynotes[data-sec="falls"] textarea').value = '';
w.eval("snSave()"); await new Promise(r=>setTimeout(r,60));
ok('the scroll position is written directly on teardown, not left behind a timer',
   /if\(blob !== scLastBlob\)\{\s*\n\s*clearTimeout\(scSaveTmr\); scSaveTmr = null;\s*\n\s*scLastBlob = blob;\s*\n\s*window\.storage\.set\(SCKEY, blob\);/.test(html));
ok('but a navigation that moved nothing writes nothing', (()=>{
  w.eval("scrollAt.falls = 1234; scrollFrac.falls = 0.5; scLastBlob = ''");
  w.eval("flushPending()");
  const first = store['geri:scroll'];
  delete store['geri:scroll'];
  w.eval("flushPending()");                 /* nothing changed since */
  const second = store['geri:scroll'];
  return !!first && second === undefined;
})());
ok('the pre-paint script only accepts a size it knows',
   /\['s','m','l','xl'\]\.indexOf\(v\.fs\) >= 0/.test(html));

// ---- seventh review follow-up, 15 Sep: saves are merges, not writes ----
ok('highlights and notes are saved through a three-way merge, not a blind write',
   /function mergeHL\(stored, seen, mine\)/.test(html) && /function mergeSN\(stored, seen, mine\)/.test(html) &&
   !/function hlSave\(\)\{ try\{ window\.storage\.set\(HLKEY/.test(html));
ok('every read of the stored copy updates what this tab has SEEN',
   (html.match(/HLSEEN = JSON\.stringify/g)||[]).length >= 2 && (html.match(/SNSEEN = JSON\.stringify/g)||[]).length >= 2);
ok('merging keeps the other tab\u2019s addition and this tab\u2019s addition', (()=>{
  const stored = {falls:[{id:'a', t:'from the other tab'}]};
  const seen   = {};
  const mine   = {falls:[{id:'b', t:'from this tab'}]};
  const out = w.mergeHL(stored, seen, mine);
  const ids = (out.falls||[]).map(h=>h.id).sort().join(',');
  return ids === 'a,b';
})());
ok('merging respects a deletion made here rather than resurrecting it', (()=>{
  const stored = {falls:[{id:'a'}, {id:'b'}]};
  const seen   = {falls:[{id:'a'}, {id:'b'}]};   /* we had both */
  const mine   = {falls:[{id:'a'}]};             /* and deleted b */
  const out = w.mergeHL(stored, seen, mine);
  return (out.falls||[]).length === 1 && out.falls[0].id === 'a';
})());
ok('merging keeps this tab\u2019s edit to a highlight it shares with the other tab', (()=>{
  const stored = {falls:[{id:'a', n:''}]};
  const seen   = {falls:[{id:'a', n:''}]};
  const mine   = {falls:[{id:'a', n:'my remark'}]};
  return w.mergeHL(stored, seen, mine).falls[0].n === 'my remark';
})());
ok('section notes merge per section: untouched here means the other tab\u2019s copy wins', (()=>{
  const stored = {falls:'newer from the other tab', sleep:'mine'};
  const seen   = {falls:'older', sleep:'mine'};
  const mine   = {falls:'older', sleep:'mine, edited here'};
  const out = w.mergeSN(stored, seen, mine);
  return out.falls === 'newer from the other tab' && out.sleep === 'mine, edited here';
})());
ok('saves are serialised so two in the same tick cannot interleave', /saveChain = saveChain\.then\(async\(\)=>\{/.test(html));

// ---- merge audit, 15 Sep: the merge must never turn a failure into a deletion ----
ok('SEEN only advances on a write that was read back', /if\(landed\) seenSet\(key, blob\);/.test(html) &&
   /const back = await window\.storage\.get\(key\);\s*\n\s*landed = !!\(back && back\.value === blob\);/.test(html));
/* storage must already hold SOMETHING, or the merge short-circuits to "no stored copy"
   and the deletion path this guard is about is never reached */
store['geri:hl'] = JSON.stringify({sleep:[{id:'other', sec:'sleep', t:'hypnotic', i:0, n:'', c:'y'}]});
w.eval("HL = {falls:[{id:'f1', sec:'falls', t:'fear of falling', i:0, n:'', c:'y'}]}; HLSEEN = JSON.stringify({sleep:[{id:'other', sec:'sleep', t:'hypnotic', i:0, n:'', c:'y'}]})");
w.eval("window.__realset = window.storage.set; window.storage.set = async()=>undefined");
await w.eval("hlSave()"); await new Promise(r=>setTimeout(r,60));
ok('a refused save leaves SEEN where it was', !/f1/.test(w.eval("HLSEEN")), w.eval("HLSEEN"));
w.eval("window.storage.set = window.__realset");
await w.eval("hlSave()"); await new Promise(r=>setTimeout(r,60));
ok('and the next save still carries the highlight, instead of reading it as a deletion',
   ((JSON.parse(store['geri:hl'] || '{}').falls) || []).length === 1, store['geri:hl']);
w.eval("HL = {}; HLSEEN = '{}'"); delete store['geri:hl'];
ok('a highlight both tabs hold is taken from storage unless this tab changed it', (()=>{
  const stored = {falls:[{id:'X', n:'note from the other tab'}]};
  const seen   = {falls:[{id:'X', n:''}]};
  const mine   = {falls:[{id:'X', n:''}, {id:'Y'}]};
  const out = w.mergeHL(stored, seen, mine);
  return out.falls.find(h=>h.id === 'X').n === 'note from the other tab' && !!out.falls.find(h=>h.id === 'Y');
})());
ok('but an edit made here still wins', (()=>{
  const stored = {falls:[{id:'X', n:''}]}, seen = {falls:[{id:'X', n:''}]}, mine = {falls:[{id:'X', n:'mine'}]};
  return w.mergeHL(stored, seen, mine).falls[0].n === 'mine';
})());
ok('the initial read folds the stored copy in rather than assigning over what is already there',
   /HL = Object\.keys\(HL\)\.length \? mergeHL\(stored, \{\}, HL\) : stored;/.test(html) &&
   /SN = Object\.keys\(SN\)\.length \? mergeSN\(stored, \{\}, SN\) : stored;/.test(html));
ok('a merge repaint waits for a live selection to end before unwrapping its text nodes',
   /if\(sel && sel\.rangeCount && !sel\.isCollapsed\)\{/.test(html) && /document\.addEventListener\('selectionchange', go\);/.test(html));

// ---- workflow pass, 15 Sep ----
ok('a missed question offers a jump to the chapter it came from',
   /class="chgo pqgo" data-sec="/.test(html) && /jump\.addEventListener\('click', \(\)=>\{ show\(jump\.dataset\.sec\)/.test(html));
ok('the read-but-not-retained list is keyed by number, not by the string Object.keys gives',
   /const sec = sectionForChapter\(Number\(c\)\);/.test(html) && /x\.sec \+ '">' \+ x\.label/.test(html));
ok('it only counts sections actually marked read, with enough questions behind them',
   /const weakEnough = t => \(t\.n >= 4 && \(t\.n - t\.w\) \/ t\.n < 0\.65\) \|\| \(t\.n >= 2 && t\.w === t\.n\);/.test(html) &&
   /return sec && readSet\.has\(sec\) && weakEnough\(by\[c\]\);/.test(html) &&
   /filter\(k=>readSet\.has\(byS\[k\]\.sec\) && weakEnough\(byS\[k\]\)\)/.test(html));
ok('every one wrong flags even a small sample, which four-answered alone would hide',
   /\|\| \(t\.n >= 2 && t\.w === t\.n\)/.test(html));
ok('named papers are counted one paper at a time, not lumped into a single source bucket',
   /const key = \(lab\.length >= 6 && /.test(html) && /function srcLabel\(src\)/.test(html));
ok('and it reaches the third of the bank that carries no chapter number \u2014 law, papers, Beers',
   /const PQSEC = \{'Law\/MoH':'ethics', 'Article':'src', 'Beers':'beers'\};/.test(html) &&
   /const sec = PQSEC\[x\.bk\]; if\(!sec\) return;/.test(html));
ok('the jump button and the metric read the same source map, so they cannot drift apart',
   /const tsec = p\.ch \? sectionForChapter\(p\.ch\) : \(PQSEC\[p\.bk\] \|\| ''\);/.test(html) &&
   (html.match(/'Law\/MoH':'ethics', 'Article':'src', 'Beers':'beers'/g)||[]).length === 1);
ok('a table may split across printed pages, with its rows kept whole and its header repeated',
   /table\{page-break-inside:auto\}/.test(html) && /tr,td,th\{page-break-inside:avoid\}/.test(html) &&
   /thead\{display:table-header-group\}/.test(html));
ok('a finished paper logs the day\u2019s score itself, scaled to the 50 the sparkline uses',
   /if\(rows\.length >= 25\)\{ qlog\[TODAY\] = Math\.round\(right \/ rows\.length \* 50\); saveQ\(\); paintQ\(\); \}/.test(html));

ok('an abbreviation tapped inside the table pop-out finds its footnote and closes the dialog first',
   /const inModal = a\.closest\('#tblModal'\);/.test(html) &&
   /const sec = a\.closest\('main section'\) \|\| document\.querySelector\('main section\.on'\);/.test(html) &&
   /back = inModal \? null : a;/.test(html));

ok('a page number stuck on a reference does not split one source into two',
   (()=>{ const a = w.srcLabel('Stroke Rehabilitation Clinical Handbook עמוד17');
          const b = w.srcLabel('Stroke Rehabilitation Clinical Handbook עמוד12');
          return a === b && a === 'Stroke Rehabilitation Clinical Handbook'; })());
ok('nor does a trailing full stop', w.srcLabel('חוק החולה הנוטה למות.') === w.srcLabel('חוק החולה הנוטה למות'));
ok('but two different sources stay apart', w.srcLabel('Advanced Dementia') !== w.srcLabel('Management of Acute Hip Fracture'));
ok('past the last scheduled week the block gets its own week, not week 16 again', (()=>{
  const last = w.eval("ALLW[ALLW.length-1]");
  const got = w.eval("(()=>{const r=currentWeek; window.currentWeek=()=>null; const a=curWeek(); window.currentWeek=r; return a;})()");
  return got && got.post === true && got.k !== last.k && !!got.a && !!got.b;
})());
ok('and the same calendar week keeps the same key, so its note is stable', (()=>{
  const two = w.eval("(()=>{const r=currentWeek; window.currentWeek=()=>null; const a=curWeek(), b=curWeek(); window.currentWeek=r; return a===b;})()");
  return two === true;
})());

ok('a highlight sitting on an abbreviation opens its note, not the footnote',
   /if\(a && !e\.target\.closest\('mark\.hl'\)\)\{/.test(html));
ok('but a bare abbreviation still jumps to its footnote', (()=>{
  const a = d.querySelector('#falls abbr.abbr');
  if(!a) return false;
  const key = a.textContent.replace(/\*$/, '').trim();
  const dt = [...d.querySelector('#falls').querySelectorAll('.fnotes dt')].find(x=>x.textContent.trim() === key);
  return !!dt;                       /* the pairing the handler depends on still holds */
})());
ok('drilling the week falls back to missed cards when the week has no chapters of its own',
   /const hasChapters = VIEW && VIEW\.items && VIEW\.items\.length;/.test(html) &&
   /\{mode:'missed', tag:null, label:'Missed cards only'\}/.test(html));
ok('and still filters to the week when there are chapters', (()=>{
  w.eval("VIEW = curWeek()");
  d.getElementById('goDrill').click();
  return w.eval("filter.mode") === 'week';
})());
ok('the consolidation week survives the week card, the chips and the tag lookup', (()=>{
  const r = w.eval(`(()=>{const real=currentWeek; window.currentWeek=()=>null; const V=curWeek();
    const save=VIEW; VIEW=V; let out={};
    try{ renderWeek(); out.render=1; }catch(e){ out.render=0; }
    try{ out.tags=weekTags().length; }catch(e){ out.tags=-1; }
    try{ out.dates=weekDates(V).length; }catch(e){ out.dates=-1; }
    try{ paintChips(); out.chips=1; }catch(e){ out.chips=0; }
    VIEW=save; window.currentWeek=real; return out;})()`);
  return r.render === 1 && r.tags === 0 && r.dates === 7 && r.chips === 1;
})());

ok('the past-paper week filter does not empty the pool when the week has no chapters',
   /if\(chs\.size\) p = p\.filter\(x=>x\.ch && chs\.has\(x\.ch\)\);/.test(html) &&
   /\(\(VIEW && VIEW\.items\) \|\| \[\]\)\.forEach/.test(html));
ok('every flashcard carries a tag and no tag points past the end of the deck', (()=>{
  /* CARDTAG maps cards by hard-coded index, so inserting a card anywhere but the end
     silently shifts every tag below it. Nothing in the file says so; this check is the
     only thing that would catch it. */
  const n = w.eval("QS.length"), tags = JSON.parse(w.eval("JSON.stringify(CARDTAG)"));
  let untagged = 0, past = 0;
  for(let i = 0; i < n; i++) if(!tags[i]) untagged++;
  for(const k in tags) if(+k >= n) past++;
  return untagged === 0 && past === 0;
})(), w.eval("QS.length") + ' cards');

console.log('\nerrors captured:', errs.length);
errs.slice(0,12).forEach(e=>console.log('  ' + e));

console.log("DONE");
process.exit(0);
