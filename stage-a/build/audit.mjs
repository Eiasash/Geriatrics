import { JSDOM } from 'jsdom'; import fs from 'fs';
const html=fs.readFileSync(process.argv[2]||'geriatrics-stage-a.html','utf8'); const store={}; const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={get:async k=>{if(!(k in store))throw 0;return{key:k,value:store[k]}},set:async(k,v)=>{store[k]=v;return{key:k,value:v}}};
  w.addEventListener('error',e=>errs.push(e.message));
}});
const w=dom.window,d=w.document; await new Promise(r=>setTimeout(r,600));
const p=[];
// duplicate ids
const ids={}; d.querySelectorAll('[id]').forEach(e=>{ids[e.id]=(ids[e.id]||0)+1});
p.push(['duplicate ids', Object.entries(ids).filter(([k,v])=>v>1).map(([k])=>k).join(',')||'none']);
// dead chapter-index links
const dead=[...d.querySelectorAll('.chgo')].filter(b=>!d.getElementById(b.dataset.sec)).map(b=>b.dataset.sec);
p.push(['dead chapter links', dead.join(',')||'none']);
// sections not in rail / rail not in sections
const secs=[...d.querySelectorAll('main section')].map(s=>s.id);
const rail=[...d.querySelectorAll('#rail button[data-t]')].map(b=>b.dataset.t);
p.push(['sections missing from rail', secs.filter(s=>!rail.includes(s)).join(',')||'none']);
p.push(['rail entries with no section', rail.filter(r=>!secs.includes(r)).join(',')||'none']);
// SECTAG targets that are not sections
const sectag=w.eval('Object.keys(SECTAG)');
p.push(['SECTAG keys with no section', sectag.filter(k=>!secs.includes(k)).join(',')||'none']);
// tags with no cards
const tags=[...new Set(sectag.map(k=>w.eval('SECTAG["'+k+'"]')))];
const empty=tags.filter(t=>w.eval('countTag("'+t+'")')===0);
p.push(['section tags with zero cards', empty.join(',')||'none']);
// TAGNAME coverage
const allTags=new Set(); w.eval('CARDTAG').forEach(t=>(t||'').split(' ').filter(Boolean).forEach(x=>allTags.add(x)));
p.push(['card tags missing a display name', [...allTags].filter(t=>!w.eval('TAGNAME["'+t+'"]')).join(',')||'none']);
// chapter map targets
const bad=w.eval(`(function(){const o=[];ALLW.forEach(wk=>wk.items.forEach(x=>{const c=chapInfo(x.t);if(c.sec&&!document.getElementById(c.sec))o.push(x.t)}));return o.join('|')})()`);
p.push(['schedule links that 404', bad||'none']);
// cards sanity
p.push(['cards with empty answer', w.eval('QS.filter(q=>!q[1]||q[1].length<10).length')+'']);
p.push(['questions with a blank option', w.eval('PQ.filter(q=>q.o.some(o=>!o)).length')+'']);
p.push(['questions whose key letter is impossible', w.eval("PQ.filter(q=>[...q.a].some(c=>!'אבגד'.includes(c))).length")+'']);
// tables without captions
p.push(['tables lacking a caption', (d.querySelectorAll('.tscroll').length - d.querySelectorAll('.cap').length)+'']);
// storage keys used vs backed up
const used=[...html.matchAll(/window\.storage\.(?:get|set)\(\s*([A-Z]+KEY|'[^']+')/g)].map(m=>m[1]);
p.push(['distinct storage call sites', [...new Set(used)].join(' ')]);
p.push(['backup key list', w.eval('BKEYS.join(" ")')]);
// sizes
p.push(['DOM elements', d.querySelectorAll('*').length+'']);
p.push(['search index entries', w.eval('INDEX.length')+'']);
p.push(['runtime errors', errs.length+' '+errs.slice(0,3).join('|')]);
p.forEach(([k,v])=>console.log((k+':').padEnd(38), v));
process.exit(0);
