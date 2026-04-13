#!/usr/bin/env node
/**
 * Container-compatible batch question generator (uses curl for API calls)
 * Runs inside Claude.ai container where Node.js fetch doesn't work through proxy
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

const TOPICS = ["Biology of Aging","Demography","CGA","Frailty","Falls","Delirium","Dementia","Depression","Polypharmacy","Nutrition","Pressure Injuries","Incontinence","Constipation","Sleep","Pain","Osteoporosis","OA","CV Disease","Heart Failure","HTN","Stroke","COPD","Diabetes","Thyroid","CKD","Anemia","Cancer","Infections","Palliative","Ethics","Elder Abuse","Driving","Guardianship","Patient Rights","Advance Directives","Community/LTC","Rehab","Vision/Hearing","Periop","Geri EM"];

const HAZ_CH_TO_TOPIC = {1:0,2:1,3:0,4:35,5:0,6:35,7:34,8:2,9:2,10:32,11:0,12:35,13:35,14:35,15:39,16:35,17:35,18:35,19:35,20:35,21:33,22:8,23:8,24:8,25:2,26:32,27:38,28:38,29:38,30:9,31:9,32:9,33:37,34:37,35:11,36:11,37:11,38:11,40:0,41:8,42:3,43:4,44:13,45:4,46:10,47:11,48:30,49:3,50:4,51:15,52:16,53:15,54:36,55:36,56:6,57:6,58:5,59:6,60:6,61:6,62:20,63:6,64:39,65:7,66:7,67:28,68:14,69:28,70:28,71:28,72:29,73:17,74:17,75:17,76:18,77:17,78:17,79:19,80:21,81:21,82:24,83:24,84:12,85:12,86:12,87:12,88:26,89:26,90:26,91:26,92:26,93:26,94:25,95:25,97:23,98:23,99:22,107:27,108:27};

const HAR_CH_TO_GERI = {14:14,15:17,30:5,39:21,56:24,58:24,66:25,69:25,80:26,127:27,133:27,143:27,285:17,286:17,311:39,314:39,315:27,316:18,321:24,322:24,355:12,375:16,436:20,438:20,439:20};

const COUNT = 10; // questions per chapter

function callClaude(prompt) {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  };
  const tmpFile = path.join(os.tmpdir(), `gen-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(body));
  try {
    const result = execFileSync('curl', [
      '-s', '-S', '--max-time', '180',
      '-X', 'POST', 'https://api.anthropic.com/v1/messages',
      '-H', 'Content-Type: application/json',
      '-H', 'anthropic-version: 2023-06-01',
      '-H', `x-api-key: ${API_KEY}`,
      '-d', `@${tmpFile}`
    ], { encoding: 'utf-8', maxBuffer: 50*1024*1024 });
    fs.unlinkSync(tmpFile);
    const data = JSON.parse(result);
    if (data.error) throw new Error(data.error.message);
    return (data.content || []).map(c => c.text || '').join('');
  } catch(e) {
    try { fs.unlinkSync(tmpFile); } catch(_){}
    throw e;
  }
}

function buildPrompt(source, chNum, title, text, topicIdx) {
  const topicName = TOPICS[topicIdx];
  const trimmed = text.length > 5000 ? text.substring(0, 5000) + '\n[...]' : text;
  return `You are a medical exam question writer for the Israeli Geriatrics Board Exam (Shlav Alef, P005-2026).

Generate exactly ${COUNT} MCQs as a JSON array. Clinical vignettes with elderly patients (65+).

CHAPTER: ${title} (${source}, Ch ${chNum})
TOPIC: ${topicName} (ti: ${topicIdx})

CONTENT:
${trimmed}

RULES:
- Each question: clinical scenario, 4 options, 1 correct (0-indexed)
- Explanation 200+ words: why correct, why each wrong option wrong, clinical pearl
- Tag: t="${source}", ti=${topicIdx}
- 30% easy, 50% medium, 20% hard
- Include exam traps

OUTPUT: JSON array only, no markdown fences.
[{"q":"...","o":["A","B","C","D"],"c":0,"t":"${source}","ti":${topicIdx},"e":"..."}]`;
}

function parseResponse(text) {
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const s = clean.indexOf('['), e = clean.lastIndexOf(']');
  if (s !== -1 && e !== -1) clean = clean.substring(s, e + 1);
  try { return JSON.parse(clean); } catch(err) { return []; }
}

function validate(q) {
  return q.q && q.q.length >= 30 && Array.isArray(q.o) && q.o.length === 4 &&
    typeof q.c === 'number' && q.c >= 0 && q.c <= 3 &&
    typeof q.ti === 'number' && q.ti >= 0 && q.ti < 40 &&
    q.e && q.e.length >= 80;
}

// ── MAIN ──
const repoRoot = path.resolve(__dirname, '..');
const existing = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/questions.json'), 'utf-8'));
const prefixes = new Set(existing.map(q => q.q.substring(0, 80).toLowerCase()));

// Load chapters
const chapters = [];
const haz = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/hazzard_chapters.json'), 'utf-8'));
for (const [ch, data] of Object.entries(haz)) {
  const ti = HAZ_CH_TO_TOPIC[parseInt(ch)];
  if (ti === undefined) continue;
  const text = (data.sections||[]).map(s => (s.title||'')+'\n'+(Array.isArray(s.content)?s.content.join('\n'):(s.content||''))).join('\n\n');
  if (text.length < 500) continue;
  chapters.push({ source: 'Hazzard', ch: parseInt(ch), title: data.title, text, ti, words: data.wordCount });
}
const har = JSON.parse(fs.readFileSync(path.join(repoRoot, 'harrison_chapters.json'), 'utf-8'));
for (const [ch, data] of Object.entries(har)) {
  const ti = HAR_CH_TO_GERI[parseInt(ch)];
  if (ti === undefined) continue;
  const text = (data.sections||[]).map(s => (s.title||'')+'\n'+(Array.isArray(s.content)?s.content.join('\n'):(s.content||''))).join('\n\n');
  if (text.length < 500) continue;
  chapters.push({ source: 'Harrison', ch: parseInt(ch), title: data.title, text, ti, words: data.wordCount });
}

// Sort by topic coverage — prioritize thin topics
const topicCounts = {};
existing.forEach(q => { topicCounts[q.ti] = (topicCounts[q.ti]||0) + 1; });
chapters.sort((a, b) => (topicCounts[a.ti]||0) - (topicCounts[b.ti]||0));

// Resume support
const outFile = path.join(repoRoot, 'generated-batch.json');
let allGenerated = [];
if (fs.existsSync(outFile)) {
  allGenerated = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
  allGenerated.forEach(q => prefixes.add(q.q.substring(0, 80).toLowerCase()));
  console.log(`📂 Resuming: ${allGenerated.length} already generated`);
}
const doneKeys = new Set(allGenerated.map(q => `${q.t}-${q._ch}`));

console.log(`\n🏥 Batch Generator — ${chapters.length} chapters, ${COUNT}q each`);
console.log(`📋 Existing: ${existing.length}, Already generated: ${allGenerated.length}\n`);

let totalNew = 0, totalSkip = 0;

(async () => {
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const key = `${ch.source}-${ch.ch}`;
    if (doneKeys.has(key)) { continue; }

    const topicName = TOPICS[ch.ti];
    process.stdout.write(`[${i+1}/${chapters.length}] ${ch.source} Ch${ch.ch} → ${topicName} (${topicCounts[ch.ti]||0}q)... `);

    try {
      const prompt = buildPrompt(ch.source, ch.ch, ch.title, ch.text, ch.ti);
      const resp = callClaude(prompt);
      const qs = parseResponse(resp);
      
      let valid = 0;
      for (const q of qs) {
        q.t = ch.source;
        q.ti = ch.ti;
        q._ch = ch.ch; // for resume tracking
        if (!validate(q)) continue;
        const pfx = q.q.substring(0, 80).toLowerCase();
        if (prefixes.has(pfx)) { totalSkip++; continue; }
        prefixes.add(pfx);
        allGenerated.push(q);
        valid++;
        totalNew++;
      }
      console.log(`✅ ${valid}/${qs.length}`);
      doneKeys.add(key);
      
      // Save progress after each chapter
      fs.writeFileSync(outFile, JSON.stringify(allGenerated, null, 2));
      
      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
    } catch(e) {
      console.log(`✗ ${e.message.substring(0, 80)}`);
      // On rate limit or error, wait longer
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ New: ${totalNew}, Dupes skipped: ${totalSkip}`);
  console.log(`📁 Total in ${outFile}: ${allGenerated.length}`);
  console.log(`\nTo merge: node scripts/merge-questions.cjs generated-batch.json`);
})();
