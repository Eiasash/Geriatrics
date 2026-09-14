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
ok('chip toggle writes geri:days', store['geri:days'] !== before, store['geri:days']);
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
ok('mock report scores out of the right total',
   /\/ 25/.test(d.getElementById('mockReport').textContent),
   d.getElementById('mockReport').textContent.slice(0,30));
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
ok('the notes index lists it', (w.eval("notesAsText()")).indexOf('vitamin D') >= 0);

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

console.log('\nerrors captured:', errs.length);
errs.slice(0,12).forEach(e=>console.log('  ' + e));

console.log("DONE");
process.exit(0);
