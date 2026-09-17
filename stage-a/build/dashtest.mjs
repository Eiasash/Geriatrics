import { JSDOM } from 'jsdom'; import { pinClock } from './clock.mjs'; import fs from 'fs';
const html=fs.readFileSync(process.argv[2]||'geriatrics-stage-a.html','utf8'); const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){pinClock(w);const m={};w.storage={get:async k=>{if(!(k in m))throw new Error('x');return{key:k,value:m[k]}},set:async(k,v)=>{m[k]=v;return{key:k,value:v}}};w.requestIdleCallback=f=>setTimeout(f,0);w.addEventListener('error',e=>errs.push(e.message));}});
await new Promise(r=>setTimeout(r,1500)); const w=dom.window,d=w.document;
const fail=[];
// a check prints its line and, when the condition is false, records it as a build-failing
// defect instead of just being noise in the log (round-2 finding: this script's diagnostics
// only gated on errs.length, so a broken modal/nav path could print a wrong value and still exit 0).
function check(label, value, ok){ console.log(label+':', value); if(!ok) fail.push(label); }

const readLab = d.getElementById('goReadLab').textContent;
check('read label', readLab, /^Read ch \d+/.test(readLab));

d.getElementById('goRead').click();
const onAfterRead = [...d.querySelectorAll('main section.on')].map(s=>s.id);
check('goRead ->', onAfterRead.join(','), onAfterRead.length===1 && onAfterRead[0]!=='week');

w.eval('show("week")'); d.getElementById('goDrill').click();
const drillSec = d.querySelector('main section.on')?.id;
const dfilterText = d.getElementById('dfilter').textContent.trim();
check('goDrill ->', drillSec+' | '+dfilterText, drillSec==='drill' && dfilterText.length>0);

w.eval('show("week")'); d.getElementById('goMock').click(); await new Promise(r=>setTimeout(r,500));
const mockSec = d.querySelector('main section.on')?.id;
const mockHidden = d.getElementById('mockCard').hidden;
const mockN = w.eval('mockN');
check('goMock ->', mockSec+' | mockCard hidden: '+mockHidden+' | mockN '+mockN, mockSec==='papers' && mockHidden===false && mockN>0);

w.eval('show("falls"); annotateSection("falls")');
const t=d.querySelector('#falls .tscroll table td'); t.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const modalOpen = !d.getElementById('tblModal').hidden;
const modalTitle = d.getElementById('tmTitle').textContent.slice(0,60);
const modalRows = d.querySelectorAll('#tmBody tr').length;
check('modal open', modalOpen+' | title: '+modalTitle+' | rows: '+modalRows, modalOpen===true && modalRows>0);

d.getElementById('tmClose').click(); await new Promise(r=>setTimeout(r,100));
const modalClosed = d.getElementById('tblModal').hidden;
const stillOnFalls = d.getElementById('falls').classList.contains('on');
check('modal closed', modalClosed+' | still on falls: '+stillOnFalls, modalClosed===true && stillOnFalls===true);

const wkSummaries = [...d.querySelectorAll('#week details.wkmore summary')].map(x=>x.textContent);
check('details on home', wkSummaries.join(' | '), wkSummaries.length>0);

console.log('errors', errs.length, errs[0]||'');
if(errs.length) fail.push('runtime errors');
if(fail.length){ console.log('FAIL:', fail.join(', ')); process.exit(1); }
process.exit(0);
