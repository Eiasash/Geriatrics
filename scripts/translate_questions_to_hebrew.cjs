#!/usr/bin/env node
'use strict';

/**
 * translate_questions_to_hebrew.cjs — Translate English AI questions to Hebrew.
 *
 * Background: 2,236 of 3,743 questions in data/questions.json are English
 * (Hazzard 1852, Harrison 294, GRS8 90). The app targets the Israeli geriatrics
 * exam (Hebrew). This script calls Claude to translate q + o[] + e to Hebrew,
 * preserving:
 *   - Medical meaning exactly (no embellishment, no clinical drift)
 *   - Option order (so the correct-answer index `c` stays valid)
 *   - English drug names, lab abbreviations, scoring tools (e.g. CHA2DS2-VASc),
 *     diagnostic criteria, ICD codes — kept inline per hebrew-medical-glossary
 *     skill conventions used elsewhere in this codebase.
 *   - Numerical values, ranges, units
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node translate_questions_to_hebrew.cjs [options]
 *
 * Options:
 *   --dry-run        Print 1-2 sample translations to stdout, don't write
 *   --limit N        Translate only the first N matching questions (default: 5)
 *   --tag TAG        Only translate questions with q.t === TAG (default: Hazzard)
 *                    Valid: Hazzard | Harrison | GRS8 | Hazzard-suppl
 *   --mode MODE      'in-place' = overwrite q/o/e with Hebrew (default)
 *                    'bilingual' = add qHe/oHe/eHe alongside originals (reversible)
 *   --delay N        Milliseconds between batches (default: 500)
 *   --help           Show this help
 *
 * Safety:
 *   - Every run creates data/questions.json.bak-PRE-HE-TRANSLATE-<ISO> before writing.
 *   - --dry-run shows samples to stdout and exits without touching disk.
 *   - Bilingual mode is reversible: just delete the qHe/oHe/eHe fields to revert.
 */

const fs    = require('fs');
const https = require('https');
const path  = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTIONS_PATH = path.resolve(__dirname, '..', 'data', 'questions.json');
const CONFIG_PATH    = path.resolve(__dirname, '..', 'config.json');

const MODEL          = 'claude-opus-4-7';
const MAX_TOKENS     = 1500;
const BATCH_SIZE     = 5;
const SAVE_EVERY     = 25;

const SYSTEM_PROMPT = `You translate medical-exam MCQs from English into Israeli clinical Hebrew (עברית רפואית כפי שמדברים בבית חולים בישראל).

CORE RULE — what real Israeli clinicians actually say:
Israeli rounds, charts, and consults mix Hebrew framework words with English medical terms. The English term stays English when it is the term clinicians use in everyday speech and writing. DO NOT replace common English medical terms with awkward Hebrew transliterations or rare Hebrew calques. The translation should read like a real ward note, not a literary translation.

KEEP IN ENGLISH (do not translate, do not transliterate to Hebrew letters):

Drugs + drug classes:
  lisinopril, warfarin, metformin, oxybutynin, tamsulosin, diphenhydramine,
  ACE-i, ARB, ARNI, SGLT-2 inhibitor, beta blocker, NOAC, DOAC, statin,
  PPI, NSAID, opioid, benzodiazepine, antibiotics by name…

Lab + study abbreviations:
  eGFR, BUN, INR, HbA1c, TSH, BNP, CRP, WBC, Hb, Plt, Na, K, Cl, Mg, PO4,
  ECG, EKG, CT, MRI, EEG, EMG, US, X-ray, PET, DEXA, ABG, VBG, U/S, CXR…

Scoring tools + diagnostic criteria:
  CHA2DS2-VASc, HAS-BLED, MMSE, SLUMS, MoCA, Beers Criteria, STOPP/START,
  FRAX, Clinical Frailty Scale (CFS), Fried, FRAIL, GDS, CAM, 4AT, SQiD,
  Katz Index, Lawton-Brody (IADL), Barthel, Tinetti, TUG, SPPB, Gait Speed,
  Braden, Norton, Padua, MNA, GDS, PHQ-9…

Common medical terms — CRITICAL: keep these English, do NOT use Hebrew transliterations:
  sedation                  (NOT סדציה)
  orthostatic hypotension   (NOT אורתוסטטיזם / תת-לחץ-דם אורתוסטטי)
  anticholinergic           (NOT אנטיכולינרגי)
  polypharmacy              (NOT פולי-פרמסיה)
  delirium                  (NOT בלבול / סדציה)
  cognitive impairment      (NOT פגיעה קוגניטיבית)
  hallucination             (NOT הזיות)
  blurred vision            (or "ראייה מטושטשת" — both OK; prefer English in lists)
  urinary retention         (NOT אצירת שתן — English in lists)
  workup, assessment, monitoring  (English in clinical-action contexts)
  hospice, palliative care, end-of-life
  syncope, seizure, stroke, TIA, MI, ACS, CHF/HFrEF/HFpEF, AKI, CKD, COPD,
  asthma, pneumonia, sepsis, UTI, fall(s), fracture, hip fracture
  catheter, foley, NG tube, PEG, ETT, PICC, CVC, IV, IM, SC, PO, PR
  bedside, code status, DNR, DNI, AND, advance directive, capacity,
  goals of care
  hypotension, hypertension, tachycardia, bradycardia, fever, hypoxia
  dehydration, malnutrition, sarcopenia, frailty (frailty is borderline —
    שבריריות is also acceptable in formal Hebrew)

ACCEPTABLE HEBREW LOAN WORDS (well-established Israeli usage — these may stay Hebrew):
  דמנציה, פרקינסון, אלצהיימר, אפילפסיה, סוכרת, אסטמה, גלאוקומה,
  גריאטרי, פליאטיבי, אונקולוגי, נוירולוגי, פסיכיאטרי, קרדיולוגי,
  בירור (= workup, both fine), הערכה (= assessment, both fine),
  טיפול תרופתי, מעקב, תקין, חמור, מתקדם, פעיל, חריף, כרוני

KEEP HEBREW for everyday/framework words:
  Articles, conjunctions, pronouns
  Demographics: גבר, אישה, בן/בת ל… (no English needed)
  Common verbs: מאושפז, נפל, סובל, נוטל, מקבל, מתלונן, סובל, מתפתח, מאובחן
  Numbers, ages, units (use Hebrew numerals contextually but keep "mg", "kg", "mL/min" in English)

OPTION-LIST FORMATTING:
  Drug-with-mechanism-in-parens stays clean. Example:
    EN: "Diphenhydramine (anticholinergic + sedation + orthostasis)"
    HE: "Diphenhydramine (anticholinergic + sedation + orthostatic hypotension)"
    NOT: "Diphenhydramine (אנטיכולינרגי + סדציה + אורתוסטטיזם)"

  Mechanism / dose / route descriptions in parens — keep English when they are
  English in the original. The Hebrew framework outside the parens stays Hebrew.

CRITICAL INVARIANTS:
1. Preserve clinical meaning EXACTLY. Don't paraphrase, simplify, or add detail.
2. Preserve option ORDER — correct-answer index doesn't change.
3. Numerical values, ranges, units stay verbatim.
4. No bidi marks — the rendering layer handles RTL.
5. Question stems use Israeli interrogative phrasing: "מה ההמלצה?", "איזה מהבאים…?", "מה הצעד הבא?"
6. Explanation (e field) follows the same English-preference rule.

OUTPUT FORMAT — respond with ONLY a JSON object, no markdown:
{
  "q": "Hebrew translation of the question stem",
  "o": ["option A", "option B", "option C", "option D"],
  "e": "Hebrew translation of the explanation"
}

If the input has 5 options, output 5 options. Match the array length exactly.`;

const USER_TEMPLATE = (q) => `Translate this question to Hebrew per the system rules.

ENGLISH:
question: ${JSON.stringify(q.q)}
options:  ${JSON.stringify(q.o)}
explanation: ${JSON.stringify(q.e || '')}

Respond with the JSON object only.`;

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const arg = (k, fallback) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : fallback; };

if (has('--help')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
  process.exit(0);
}

const DRY_RUN = has('--dry-run');
const LIMIT   = Number(arg('--limit', '5'));
const TAG     = arg('--tag', 'Hazzard');
const MODE    = arg('--mode', 'in-place');
const DELAY_MS = Number(arg('--delay', '500'));

if (!['Hazzard','Harrison','GRS8','Hazzard-suppl'].includes(TAG)) {
  console.error(`bad --tag "${TAG}". Valid: Hazzard | Harrison | GRS8 | Hazzard-suppl`);
  process.exit(1);
}
if (!['in-place','bilingual'].includes(MODE)) {
  console.error(`bad --mode "${MODE}". Valid: in-place | bilingual`);
  process.exit(1);
}

// ─── API key resolution ───────────────────────────────────────────────────────

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (c.apiKey) return c.apiKey;
  } catch {}
  console.error('No API key. Set ANTHROPIC_API_KEY or add config.json with {"apiKey":"..."}.');
  process.exit(1);
}

// ─── HTTPS call to Claude ─────────────────────────────────────────────────────

function callClaude(apiKey, userMsg) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
  const opts = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 60_000,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
        try {
          const parsed = JSON.parse(raw);
          const text = parsed?.content?.[0]?.text || '';
          resolve(text);
        } catch (e) { reject(new Error(`bad JSON from API: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function extractJson(text) {
  // Tolerate occasional ```json fences. Find the first {...} block.
  const m = text.match(/\{[\s\S]+\}/);
  if (!m) throw new Error('no JSON object in model response');
  return JSON.parse(m[0]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = DRY_RUN ? 'dry' : getApiKey();
  const allQs = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));

  // English-only filter: <30% Hebrew chars in q+o
  const HEB_RE = /[֐-׿]/g;
  const isEnglish = (q) => {
    const s = (q.q || '') + ' ' + (q.o || []).join(' ');
    if (!s.length) return false;
    const heb = (s.match(HEB_RE) || []).length;
    return heb / s.length < 0.3;
  };

  const candidates = allQs
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.t === TAG && isEnglish(q))
    .filter(({ q }) => MODE === 'in-place' || !q.qHe);

  console.log(`tag=${TAG} mode=${MODE} candidates=${candidates.length} limit=${LIMIT} dry-run=${DRY_RUN}`);
  const todo = candidates.slice(0, LIMIT);

  if (!todo.length) { console.log('Nothing to do.'); return; }

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: showing what would be translated ---');
    for (const { q, i } of todo.slice(0, 2)) {
      console.log(`\nidx=${i} (tag=${q.t})`);
      console.log(`  EN q: ${(q.q || '').slice(0, 140)}`);
      console.log(`  EN o[0]: ${(q.o?.[0] || '').slice(0, 80)}`);
      console.log(`  EN o[${q.c}] (correct): ${(q.o?.[q.c] || '').slice(0, 80)}`);
    }
    console.log('\nTo run for real:');
    console.log(`  ANTHROPIC_API_KEY=sk-ant-... node ${path.basename(__filename)} --tag ${TAG} --limit ${LIMIT} --mode ${MODE}`);
    return;
  }

  // Backup before writing
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = QUESTIONS_PATH + '.bak-PRE-HE-TRANSLATE-' + stamp;
  fs.copyFileSync(QUESTIONS_PATH, backupPath);
  console.log(`Backup saved: ${path.basename(backupPath)}`);

  let done = 0, failed = 0;
  for (let off = 0; off < todo.length; off += BATCH_SIZE) {
    const slice = todo.slice(off, off + BATCH_SIZE);
    const results = await Promise.all(slice.map(async ({ q, i }) => {
      try {
        const text = await callClaude(apiKey, USER_TEMPLATE(q));
        const obj = extractJson(text);
        if (typeof obj.q !== 'string' || !Array.isArray(obj.o) || obj.o.length !== q.o.length) {
          throw new Error(`bad shape: q-string=${typeof obj.q} o-array=${Array.isArray(obj.o)} same-len=${obj.o?.length === q.o.length}`);
        }
        return { i, ok: true, obj };
      } catch (e) { return { i, ok: false, err: e.message }; }
    }));

    for (const r of results) {
      if (r.ok) {
        const target = allQs[r.i];
        if (MODE === 'in-place') {
          target.q = r.obj.q;
          target.o = r.obj.o;
          if (typeof r.obj.e === 'string' && r.obj.e.length) target.e = r.obj.e;
        } else {
          target.qHe = r.obj.q;
          target.oHe = r.obj.o;
          if (typeof r.obj.e === 'string' && r.obj.e.length) target.eHe = r.obj.e;
        }
        done++;
      } else {
        console.warn(`  idx=${r.i} FAILED: ${r.err}`);
        failed++;
      }
    }

    if ((done + failed) % SAVE_EVERY === 0 || off + BATCH_SIZE >= todo.length) {
      fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(allQs) + '\n');
      console.log(`  checkpoint: done=${done} failed=${failed} (of ${todo.length})`);
    }
    if (off + BATCH_SIZE < todo.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(allQs) + '\n');
  console.log(`\nDone: ${done} translated, ${failed} failed (of ${todo.length}).`);
  console.log(`Backup at: ${backupPath}`);
  console.log('Next: re-format questions.json (each option per line) before commit:');
  console.log(`  PYTHONUTF8=1 python3 -c "import json;p=r'${QUESTIONS_PATH.replace(/\\/g,'/')}';d=json.load(open(p,'r',encoding='utf-8'));# (use repo's existing format pass)"`);
}

main().catch((e) => { console.error(e); process.exit(1); });
