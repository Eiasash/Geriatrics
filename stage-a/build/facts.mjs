import { JSDOM } from 'jsdom'; import fs from 'fs';
const html=fs.readFileSync(process.argv[2]||'geriatrics-stage-a.html','utf8');
const F=JSON.parse(fs.readFileSync('facts.json','utf8')).facts;
const d=new JSDOM(html).window.document;
const norm=t=>t.replace(/\s+/g,' ').replace(/\u00a0/g,' ');
let bad=0;
for(const f of F){
  const sec=d.getElementById(f.sec);
  const ok=sec && norm(sec.textContent).includes(norm(f.text));
  if(!ok){bad++; console.log('MISSING  #'+f.sec+'  «'+f.text+'»  ('+f.src+')');}
}
console.log(`facts: ${F.length-bad} present, ${bad} missing`);
process.exit(bad?1:0);
