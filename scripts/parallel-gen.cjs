#!/usr/bin/env node
/**
 * Parallel question generator — runs N concurrent API calls via curl.
 * Usage: ANTHROPIC_API_KEY=sk-... node scripts/parallel-gen.cjs --app geriatrics --chapters 42,49,54,55 --count 10
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');

// Import config from the main generator
const mainGen = fs.readFileSync(path.join(__dirname, 'generate-questions.cjs'), 'utf-8');

// Extract topic/chapter mappings by requiring the module parts we need
const HAZ_CH_TO_TOPIC = {1:0,2:1,3:0,4:35,5:0,6:35,7:34,8:2,9:2,10:32,11:0,12:35,13:35,14:35,15:39,16:35,17:35,18:35,19:35,20:35,21:33,22:8,23:8,24:8,25:2,26:32,27:38,28:38,29:38,30:9,31:9,32:9,33:37,34:37,35:11,36:11,37:11,38:11,40:0,41:8,42:3,43:4,44:13,45:4,46:10,47:11,48:30,49:3,50:4,51:15,52:16,53:15,54:36,55:36,56:6,57:6,58:5,59:6,60:6,61:6,62:20,63:6,64:39,65:7,66:7,67:28,68:14,69:28,70:28,71:28,72:29,73:17,74:17,75:17,76:18,77:17,78:17,79:19,80:21,81:21,82:24,83:24,84:12,85:12,86:12,87:12,88:26,89:26,90:26,91:26,92:26,93:26,94:25,95:25,97:23,98:23,99:22,107:27,108:27};
const HAR_CH_TO_GERI = {14:14,15:17,30:5,39:21,56:24,58:24,66:25,69:25,80:26,127:27,133:27,143:27,285:17,286:17,311:39,314:39,315:27,316:18,321:24,322:24,355:12,375:16,436:20,438:20,439:20};
const TOPICS = ["Biology of Aging","Demography","CGA","Frailty","Falls","Delirium","Dementia","Depression","Polypharmacy","Nutrition","Pressure Injuries","Incontinence","Constipation","Sleep","Pain","Osteoporosis","OA","CV Disease","Heart Failure","HTN","Stroke","COPD","Diabetes","Thyroid","CKD","Anemia","Cancer","Infections","Palliative","Ethics","Elder Abuse","Driving","Guardianship","Patient Rights","Advance Directives","Community/LTC","Rehab","Vision/Hearing","Periop","Geri EM"];

const CONCURRENCY = 3;
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

const args = process.argv.slice(2);
let chapNums = null, count = 10, doAll = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--chapters') chapNums = args[++i].split(',').map(Number);
  if (args[i] === '--count') count = parseInt(args[++i]);
  if (args[i] === '--all') doAll = true;
}

function assembleSectionText(sections) {
  if (!sections || !Array.isArray(sections)) return '';
  return sections.map(s => `### ${s.title || ''}\n${Array.isArray(s.content) ? s.content.join('\n') : (s.content || '')}`).join('\n\n');
}

function buildPrompt(chapter, topicName, cnt) {
  let text = chapter.text;
  if (text.length > 6000) text = text.substring(0, 6000) + '\n\n[... chapter continues ...]';
  return `You are a medical exam question writer for the Israeli Geriatrics Board Exam (Shlav Alef, P005-2026). Focus on geriatric-specific clinical scenarios: elderly patients (65+), age-related pharmacokinetics, Beers criteria, functional assessment, goals of care, delirium vs dementia, polypharmacy, falls risk, frailty.

Based on the following textbook chapter content, generate exactly ${cnt} high-quality multiple-choice questions.

CHAPTER: ${chapter.title} (${chapter.source}, Chapter ${chapter.chapter})
TOPIC: ${topicName} (topic index: ${chapter.topicIndex})

CHAPTER CONTENT:
${text}

REQUIREMENTS:
1. Each question must be a clinical vignette (patient scenario with age, presenting complaint, relevant history)
2. Exactly 4 answer options per question
3. One correct answer (0-indexed: 0, 1, 2, or 3)
4. Detailed explanation (200-400 words) covering why correct answer is correct, why each wrong answer is wrong, and a Clinical Pearl
5. Questions should test clinical reasoning, not just recall
6. Vary difficulty: ~30% easy, ~50% medium, ~20% hard

OUTPUT FORMAT — respond with ONLY a JSON array, no markdown fences, no preamble:
[{"q": "Clinical vignette?", "o": ["A","B","C","D"], "c": 0, "t": "${chapter.source}", "ti": ${chapter.topicIndex}, "e": "Detailed explanation."}]

Generate exactly ${cnt} questions. JSON only, no other text.`;
}

function callClaudeCurl(prompt) {
  return new Promise((resolve, reject) => {
    const body = { model: 'claude-sonnet-4-20250514', max_tokens: 8192, messages: [{ role: 'user', content: prompt }] };
    const tmpFile = path.join(os.tmpdir(), `claude-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(body));
    const curlArgs = ['-s', '-S', '--max-time', '180', '-X', 'POST', 'https://api.anthropic.com/v1/messages',
      '-H', 'Content-Type: application/json', '-H', 'anthropic-version: 2023-06-01',
      '-H', `x-api-key: ${apiKey}`, '-d', `@${tmpFile}`];
    execFile('curl', curlArgs, { maxBuffer: 50*1024*1024 }, (err, stdout) => {
      try { fs.unlinkSync(tmpFile); } catch(_) {}
      if (err) return reject(err);
      try {
        const data = JSON.parse(stdout);
        if (data.error) return reject(new Error(data.error.message));
        resolve(data.content?.map(c => c.text || '').join('') || '');
      } catch (e) { reject(new Error('JSON parse failed')); }
    });
  });
}

function parseQuestions(text) {
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const s = clean.indexOf('['), e = clean.lastIndexOf(']');
  if (s !== -1 && e !== -1) clean = clean.substring(s, e + 1);
  try { return JSON.parse(clean); } catch { return []; }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  // Load chapters
  const chapters = [];
  const haz = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'hazzard_chapters.json'), 'utf-8'));
  for (const [ch, data] of Object.entries(haz)) {
    const ti = HAZ_CH_TO_TOPIC[parseInt(ch)];
    if (ti === undefined) continue;
    chapters.push({ key: `haz-${ch}`, source: 'Hazzard', chapter: parseInt(ch), title: data.title, text: assembleSectionText(data.sections), topicIndex: ti, wordCount: data.wordCount });
  }
  const har = JSON.parse(fs.readFileSync(path.join(repoRoot, 'harrison_chapters.json'), 'utf-8'));
  for (const [ch, data] of Object.entries(har)) {
    const ti = HAR_CH_TO_GERI[parseInt(ch)];
    if (ti === undefined) continue;
    chapters.push({ key: `har-${ch}`, source: 'Harrison', chapter: parseInt(ch), title: data.title, text: assembleSectionText(data.sections), topicIndex: ti, wordCount: data.wordCount });
  }

  let targets = doAll ? chapters : chapters.filter(c => chapNums && chapNums.includes(c.chapter));
  targets = targets.filter(c => c.text.length >= 200);
  
  console.log(`\n🏥 Parallel Generator — ${targets.length} chapters, ${count}q each, ${CONCURRENCY} concurrent\n`);

  const existingQs = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'questions.json'), 'utf-8'));
  const prefixes = new Set(existingQs.map(q => q.q.substring(0, 80).toLowerCase()));
  const allGenerated = [];
  let done = 0, totalValid = 0, totalDupes = 0, totalInvalid = 0;

  async function processChapter(ch) {
    const topicName = TOPICS[ch.topicIndex];
    const label = `${ch.source} Ch ${ch.chapter}: "${ch.title.substring(0, 35)}" → ${topicName}`;
    try {
      const prompt = buildPrompt(ch, topicName, count);
      const response = await callClaudeCurl(prompt);
      const questions = parseQuestions(response);
      let valid = 0, dupes = 0, invalid = 0;
      for (const q of questions) {
        q.t = ch.source; q.ti = ch.topicIndex;
        if (!q.q || !Array.isArray(q.o) || q.o.length !== 4 || typeof q.c !== 'number' || !q.e || q.e.length < 50) { invalid++; continue; }
        const pfx = q.q.substring(0, 80).toLowerCase();
        if (prefixes.has(pfx)) { dupes++; continue; }
        prefixes.add(pfx);
        allGenerated.push(q);
        valid++;
      }
      totalValid += valid; totalDupes += dupes; totalInvalid += invalid;
      done++;
      console.log(`  [${done}/${targets.length}] ✅ ${label} — ${valid} valid, ${dupes} dupes, ${invalid} invalid`);
    } catch (e) {
      done++;
      console.log(`  [${done}/${targets.length}] ✗ ${label} — ${e.message}`);
    }
  }

  // Run in batches of CONCURRENCY
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processChapter));
  }

  const outFile = path.join(repoRoot, `generated-geri-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(allGenerated, null, 2));
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Generated: ${totalValid} questions`);
  console.log(`🔄 Duplicates: ${totalDupes}  ❌ Invalid: ${totalInvalid}`);
  console.log(`📁 Saved: ${outFile}`);
  console.log(`\nMerge: node scripts/merge-questions.cjs ${path.basename(outFile)}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
