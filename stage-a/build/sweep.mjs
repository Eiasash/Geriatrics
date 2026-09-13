import { JSDOM } from 'jsdom'; import fs from 'fs';
const html=fs.readFileSync(process.argv[2]||'geriatrics-stage-a.html','utf8'); const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  const m={}; w.storage={get:async k=>{if(!(k in m))throw new Error('missing');return{key:k,value:m[k]}},set:async(k,v)=>{m[k]=v;return{key:k,value:v}}};
  w.requestIdleCallback=f=>setTimeout(f,0); w.addEventListener('error',e=>errs.push(e.message)); w.console.error=(...a)=>errs.push('console.error '+a.join(' '));}});
await new Promise(r=>setTimeout(r,1500)); const w=dom.window,d=w.document;
const ids=[...d.querySelectorAll('main section')].map(s=>s.id);
for(const id of ids){ try{ w.eval(`show("${id}")`); if(w.eval('CONTENT').includes(id)) w.eval(`annotateSection("${id}")`); }catch(e){errs.push(id+': '+e.message);} }
// click every chgo and every go2 in the week view
let clicks=0; d.querySelectorAll('.chgo').forEach(b=>{ try{ b.click(); clicks++; }catch(e){errs.push('chgo '+e.message);} });
// search a few terms
for(const t of ['tau','neostigmine','ABCD2','PHQ-9','CRT']){ w.eval(`search(${JSON.stringify(t)})`); if(!d.getElementById('hits').textContent.toLowerCase().includes(t.toLowerCase())) errs.push('search miss: '+t); }
// drill custom + missed
try{ w.eval('show("drill")'); }catch(e){errs.push('drill '+e.message);}
// papers
try{ w.eval('show("papers")'); await new Promise(r=>setTimeout(r,500)); }catch(e){errs.push('papers '+e.message);}
// abbreviation footnote duplicates across sections
let dupAbbr=0; for(const id of w.eval('CONTENT')){ const ks=[...d.querySelectorAll('#'+id+' abbr.abbr')].map(a=>a.textContent.replace('*','')); if(new Set(ks).size!==ks.length) dupAbbr++; }
// broken internal anchors in prose (button chgo data-sec)
const dead=[...d.querySelectorAll('[data-sec]')].filter(b=>!d.getElementById(b.dataset.sec)).length;
console.log('sections',ids.length,'chgo clicks',clicks,'dup-abbr sections',dupAbbr,'dead data-sec',dead,'errors',errs.length); errs.slice(0,10).forEach(e=>console.log(' ',e));
process.exit(errs.length?1:0);
