#!/usr/bin/env node
/**
 * Batch Question Generator for Shlav A Mega / Pnimit Mega
 * 
 * Reads chapter JSON data, sends to Claude API, generates validated MCQs.
 * 
 * Usage:
 *   node scripts/generate-questions.js --app geriatrics --chapters 58,59,60 --count 15
 *   node scripts/generate-questions.js --app geriatrics --all --count 10
 *   node scripts/generate-questions.js --app pnimit --chapters 264,265 --count 15
 *   node scripts/generate-questions.js --app pnimit --all --count 10
 *   node scripts/generate-questions.js --app geriatrics --dry-run   # preview mapping only
 *
 * Options:
 *   --app        geriatrics | pnimit (required)
 *   --chapters   comma-separated chapter numbers (e.g. 58,59,60)
 *   --all        process all chapters
 *   --count      questions per chapter (default: 10)
 *   --dry-run    show chapter→topic mapping without calling API
 *   --output     output file (default: generated-questions-{timestamp}.json)
 *   --api-key    Anthropic API key (or set ANTHROPIC_API_KEY env var)
 *   --proxy      use toranot proxy instead of direct API (default: false)
 *   --concurrency  parallel API calls per batch (default: 5)
 *   --resume     resume from previous run (loads existing output + skips done chapters)
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================

const GERIATRICS_TOPICS = ["Biology of Aging","Demography","CGA","Frailty","Falls","Delirium","Dementia","Depression","Polypharmacy","Nutrition","Pressure Injuries","Incontinence","Constipation","Sleep","Pain","Osteoporosis","OA","CV Disease","Heart Failure","HTN","Stroke","COPD","Diabetes","Thyroid","CKD","Anemia","Cancer","Infections","Palliative","Ethics","Elder Abuse","Driving","Guardianship","Patient Rights","Advance Directives","Community/LTC","Rehab","Vision/Hearing","Periop","Geri EM"];

const PNIMIT_TOPICS = ["Cardiology","Heart Failure","Arrhythmias","Valvular","Hypertension","Pulmonology","GI & Liver","Nephrology","Electrolytes","Endocrinology","Hematology","Oncology","Infectious Disease","Rheumatology","Neurology","Critical Care","Dermatology","Allergy","Fluids","Pain & Palliative","Perioperative","Toxicology","Clinical Approach","Vascular"];

// Hazzard chapter → geriatrics topic index mapping
// Built from HAZ_CHAPTERS in the app
const HAZ_CH_TO_TOPIC = {
  1: 0,   // Biology of Aging
  2: 1,   // Demography
  3: 0,   // Immunology → Biology of Aging
  4: 35,  // Psychosocial → Community/LTC
  5: 0,   // Sex Differences → Biology of Aging
  6: 35,  // Social Determinants → Community/LTC
  7: 34,  // Decision Making → Advance Directives
  8: 2,   // Geriatric Assessment → CGA
  9: 2,   // Mental Status → CGA
  10: 32, // Decisional Capacity → Guardianship
  11: 0,  // Prevention → Biology of Aging
  12: 35, // Age-Friendly Care → Community/LTC
  13: 35, // Geriatrics Worldwide → Community/LTC
  14: 35, // Hospital/Outpatient → Community/LTC
  15: 39, // Emergency Dept → Geri EM
  16: 35, // Institutional LTC → Community/LTC
  17: 35, // Community LTSS → Community/LTC
  18: 35, // Transitions of Care → Community/LTC
  19: 35, // Value-Based Care → Community/LTC
  20: 35, // Social Workers → Community/LTC
  21: 33, // Patient Perspective → Patient Rights
  22: 8,  // Medication Prescribing → Polypharmacy
  23: 8,  // Substance Use → Polypharmacy
  24: 8,  // Integrative Medicine → Polypharmacy
  25: 2,  // Chronic Disease Mgmt → CGA
  26: 32, // Legal Issues → Guardianship
  27: 38, // Perioperative → Periop
  28: 38, // Anesthesia → Periop
  29: 38, // Surgical Quality → Periop
  30: 9,  // Nutrition Disorders → Nutrition
  31: 9,  // Swallowing → Nutrition
  32: 9,  // Oral Health → Nutrition
  33: 37, // Low Vision → Vision/Hearing
  34: 37, // Hearing Loss → Vision/Hearing
  35: 11, // Sexual Function Woman → Incontinence
  36: 11, // Gynecologic → Incontinence
  37: 11, // Sexual Function Man → Incontinence
  38: 11, // Prostate → Incontinence
  40: 0,  // Clinical Geroscience → Biology of Aging
  41: 8,  // Multiple Chronic → Polypharmacy
  42: 3,  // Frailty
  43: 4,  // Falls
  44: 13, // Sleep Disorders → Sleep
  45: 4,  // Syncope → Falls
  46: 10, // Pressure Injuries
  47: 11, // Incontinence
  48: 30, // Elder Mistreatment → Elder Abuse
  49: 3,  // Sarcopenia → Frailty
  50: 4,  // Mobility → Falls
  51: 15, // Osteoporosis
  52: 16, // Osteoarthritis → OA
  53: 15, // Hip Fractures → Osteoporosis
  54: 36, // Therapeutic Exercise → Rehab
  55: 36, // Rehabilitation → Rehab
  56: 6,  // Aging Brain → Dementia
  57: 6,  // Cognitive Changes → Dementia
  58: 5,  // Delirium
  59: 6,  // Dementia/Alzheimer's
  60: 6,  // BPSD → Dementia
  61: 6,  // Parkinson's → Dementia
  62: 20, // Cerebrovascular → Stroke
  63: 6,  // Other Neurodegenerative → Dementia
  64: 39, // TBI → Geri EM
  65: 7,  // Depression
  66: 7,  // Geriatric Psychiatry → Depression
  67: 28, // Palliative Care
  68: 14, // Pain Management → Pain
  69: 28, // Nonpain Symptoms → Palliative
  70: 28, // Palliative Settings → Palliative
  71: 28, // Communication → Palliative
  72: 29, // Ethical Issues → Ethics
  73: 17, // Aging CV → CV Disease
  74: 17, // CHD → CV Disease
  75: 17, // Valvular → CV Disease
  76: 18, // Heart Failure
  77: 17, // Arrhythmias → CV Disease
  78: 17, // PVD → CV Disease
  79: 19, // Hypertension → HTN
  80: 21, // Respiratory → COPD
  81: 21, // COPD
  82: 24, // Aging Kidney → CKD
  83: 24, // Kidney Diseases → CKD
  84: 12, // Aging GI → Constipation
  85: 12, // Upper GI → Constipation
  86: 12, // Hepatobiliary → Constipation
  87: 12, // Constipation
  88: 26, // Cancer General
  89: 26, // Breast → Cancer
  90: 26, // Prostate Cancer
  91: 26, // Lung Cancer
  92: 26, // GI Malignancies → Cancer
  93: 26, // Skin Cancer → Cancer
  94: 25, // Anemia
  95: 25, // Hematologic Malignancies → Anemia
  97: 23, // Neuroendocrine → Thyroid
  98: 23, // TSH → Thyroid
  99: 22, // Diabetes
  107: 27, // Infections
  108: 27, // Viruses → Infections
};

// Hazzard chapters EXCLUDED from P005-2026 syllabus
const HAZ_EXCLUDED = new Set([2, 3, 4, 5, 6, 34, 62]);

// Harrison chapter → pnimit topic index mapping
const HAR_CH_TO_PNIMIT = {
  14: 19,  // Pain → Pain & Palliative
  15: 0,   // Chest Discomfort → Cardiology
  16: 6,   // Abdominal Pain → GI & Liver
  17: 14,  // Headache → Neurology
  18: 13,  // Low back pain → Rheumatology
  20: 12,  // Fever → Infectious Disease
  22: 12,  // FUO → Infectious Disease
  26: 14,  // Neurologic Weakness → Neurology
  30: 14,  // Coma → Neurology
  39: 5,   // Dyspnea → Pulmonology
  40: 5,   // Cough → Pulmonology
  41: 5,   // Hemoptysis → Pulmonology
  42: 5,   // Hypoxia → Pulmonology
  43: 0,   // Edema → Cardiology
  48: 6,   // Nausea/Vomiting → GI
  49: 6,   // Diarrhea/Constipation → GI
  50: 22,  // Weight Loss → Clinical Approach
  51: 6,   // GI Bleeding → GI
  52: 6,   // Jaundice → GI
  53: 6,   // Ascites → GI
  55: 7,   // Azotemia → Nephrology
  56: 8,   // Fluid/Electrolyte → Electrolytes
  57: 8,   // Hypercalcemia → Electrolytes
  58: 8,   // Acidosis/Alkalosis → Electrolytes
  66: 10,  // Anemia → Hematology
  67: 10,  // Granulocytes → Hematology
  69: 10,  // Bleeding/Thrombosis → Hematology
  70: 10,  // Lymph Nodes → Hematology
  79: 11,  // Infections in Cancer → Oncology
  80: 11,  // Oncologic Emergencies → Oncology
  102: 10, // Iron Deficiency → Hematology
  120: 10, // Platelets → Hematology
  121: 10, // Coagulation → Hematology
  127: 12, // Acutely Ill Infected → Infectious Disease
  133: 12, // Endocarditis → Infectious Disease
  136: 12, // Osteomyelitis → Infectious Disease
  142: 12, // Encephalitis → Infectious Disease
  143: 12, // Meningitis → Infectious Disease
  147: 12, // Healthcare Infections → Infectious Disease
  243: 0,  // Approach CV Disease → Cardiology
  247: 0,  // ECG → Cardiology
  285: 0,  // NSTEMI → Cardiology
  286: 0,  // STEMI → Cardiology
  295: 5,  // Approach Respiratory → Pulmonology
  305: 5,  // Pleural Disorders → Pulmonology
  311: 15, // Critical Care → Critical Care
  314: 15, // Shock → Critical Care
  315: 15, // Sepsis → Critical Care
  316: 15, // Cardiogenic Shock → Critical Care
  317: 15, // Cardiac Arrest → Critical Care
  319: 7,  // Approach Renal → Nephrology
  321: 7,  // AKI → Nephrology
  322: 7,  // CKD → Nephrology
  332: 6,  // Approach GI → GI
  347: 6,  // Approach Liver → GI
  355: 6,  // Cirrhosis → GI
  375: 13, // Vasculitis → Rheumatology
  379: 13, // Sarcoidosis → Rheumatology
  382: 13, // Articular/MSK → Rheumatology
  384: 13, // Gout → Rheumatology
  387: 13, // Periarticular → Rheumatology
  388: 9,  // Endocrine Approach → Endocrinology
  433: 14, // Neurologic Approach → Neurology
  436: 14, // Seizures → Neurology
  437: 14, // Cerebrovascular Intro → Neurology
  438: 14, // Ischemic Stroke → Neurology
  439: 14, // ICH → Neurology
  458: 14, // GBS → Neurology
  459: 14, // Myasthenia → Neurology
};

// Harrison chapter → geriatrics topic mapping (subset of chapters relevant to geriatrics)
const HAR_CH_TO_GERI = {
  14: 14,  // Pain
  15: 17,  // Chest → CV Disease
  30: 5,   // Coma → Delirium
  39: 21,  // Dyspnea → COPD
  56: 24,  // Electrolytes → CKD
  58: 24,  // Acid-Base → CKD
  66: 25,  // Anemia
  69: 25,  // Bleeding → Anemia
  80: 26,  // Oncologic Emergencies → Cancer
  127: 27, // Infections
  133: 27, // Endocarditis → Infections
  143: 27, // Meningitis → Infections
  285: 17, // NSTEMI → CV Disease
  286: 17, // STEMI → CV Disease
  311: 39, // Critical Care → Geri EM
  314: 39, // Shock → Geri EM
  315: 27, // Sepsis → Infections
  316: 18, // Cardiogenic Shock → Heart Failure
  321: 24, // AKI → CKD
  322: 24, // CKD
  355: 12, // Cirrhosis → GI/Constipation
  375: 16, // Vasculitis → OA (Rheum)
  436: 20, // Seizures → Stroke
  438: 20, // Ischemic Stroke
  439: 20, // ICH → Stroke
};

// ============================================================
// CLI PARSING
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    app: null,
    chapters: null,
    all: false,
    count: 10,
    dryRun: false,
    output: null,
    apiKey: process.env.ANTHROPIC_API_KEY || null,
    proxy: false,
    concurrency: 5,
    resume: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--app': opts.app = args[++i]; break;
      case '--chapters': opts.chapters = args[++i].split(',').map(Number); break;
      case '--all': opts.all = true; break;
      case '--count': opts.count = parseInt(args[++i]); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--output': opts.output = args[++i]; break;
      case '--api-key': opts.apiKey = args[++i]; break;
      case '--proxy': opts.proxy = true; break;
      case '--concurrency': opts.concurrency = parseInt(args[++i]); break;
      case '--resume': opts.resume = true; break;
    }
  }

  if (!opts.app || !['geriatrics', 'pnimit'].includes(opts.app)) {
    console.error('Error: --app must be "geriatrics" or "pnimit"');
    process.exit(1);
  }
  if (!opts.all && !opts.chapters) {
    console.error('Error: specify --chapters or --all');
    process.exit(1);
  }
  if (!opts.dryRun && !opts.apiKey && !opts.proxy) {
    console.error('Error: provide --api-key, set ANTHROPIC_API_KEY, or use --proxy');
    process.exit(1);
  }

  return opts;
}

// ============================================================
// DATA LOADING
// ============================================================

function loadChapters(opts) {
  const repoRoot = path.resolve(__dirname, '..');
  const isGeri = opts.app === 'geriatrics';
  
  const chapters = {};
  
  if (isGeri) {
    // Load Hazzard chapters
    const hazPath = path.join(repoRoot, 'data', 'hazzard_chapters.json');
    if (fs.existsSync(hazPath)) {
      const haz = JSON.parse(fs.readFileSync(hazPath, 'utf-8'));
      for (const [ch, data] of Object.entries(haz)) {
        chapters[`haz-${ch}`] = {
          source: 'Hazzard',
          chapter: parseInt(ch),
          title: data.title,
          wordCount: data.wordCount,
          text: assembleSectionText(data.sections),
          topicIndex: HAZ_EXCLUDED.has(parseInt(ch)) ? undefined : HAZ_CH_TO_TOPIC[parseInt(ch)],
        };
      }
    }
    // Load Harrison chapters (geriatrics subset)
    const harPath = path.join(repoRoot, 'harrison_chapters.json');
    if (fs.existsSync(harPath)) {
      const har = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
      for (const [ch, data] of Object.entries(har)) {
        if (HAR_CH_TO_GERI[parseInt(ch)] !== undefined) {
          chapters[`har-${ch}`] = {
            source: 'Harrison',
            chapter: parseInt(ch),
            title: data.title,
            wordCount: data.wordCount,
            text: assembleSectionText(data.sections),
            topicIndex: HAR_CH_TO_GERI[parseInt(ch)],
          };
        }
      }
    }
  } else {
    // Pnimit: Harrison only
    const harPath = path.join(repoRoot, 'harrison_chapters.json');
    if (fs.existsSync(harPath)) {
      const har = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
      for (const [ch, data] of Object.entries(har)) {
        chapters[`har-${ch}`] = {
          source: 'Harrison',
          chapter: parseInt(ch),
          title: data.title,
          wordCount: data.wordCount,
          text: assembleSectionText(data.sections),
          topicIndex: HAR_CH_TO_PNIMIT[parseInt(ch)],
        };
      }
    }
  }
  
  return chapters;
}

function assembleSectionText(sections) {
  if (!sections || !Array.isArray(sections)) return '';
  return sections.map(s => {
    const title = s.title || '';
    const content = Array.isArray(s.content) ? s.content.join('\n') : (s.content || '');
    return `### ${title}\n${content}`;
  }).join('\n\n');
}

function loadExistingQuestions(opts) {
  const repoRoot = path.resolve(__dirname, '..');
  const qPath = path.join(repoRoot, 'data', 'questions.json');
  if (!fs.existsSync(qPath)) return [];
  return JSON.parse(fs.readFileSync(qPath, 'utf-8'));
}

// ============================================================
// QUESTION GENERATION
// ============================================================

function buildPrompt(chapter, topicName, count, appName) {
  const isGeri = appName === 'geriatrics';
  const examContext = isGeri
    ? `Israeli Geriatrics Board Exam (Shlav Alef, P005-2026).
Key themes that MUST appear in your questions:
- Renal dosing adjustments (CrCl-based, Cockroft-Gault in elderly)
- Beers 2023 / STOPP-START v3 criteria (name specific drugs)
- Functional status impact (ADL/IADL decline as presenting sign)
- Goals-of-care tension (aggressive tx vs comfort, DNR ≠ no treatment)
- Delirium vs dementia (acute vs chronic, CAM criteria, reversible causes)
- Polypharmacy (drug-drug, drug-disease interactions in 65+)
- Falls risk (orthostatic hypotension, medications, environmental)
- Frailty (Fried criteria, CFS, sarcopenia EWGSOP2)`
    : `Israeli Internal Medicine Board Exam (Shlav Alef, P0064-2025).
Key themes that MUST appear in your questions:
- Pathophysiology-based reasoning (mechanism → diagnosis → treatment)
- Diagnostic workup sequences (what to order first and why)
- Evidence-based treatment (landmark trials: DIGIT-HF, ECLIPSE, BALANCE, SELECT-GCA, FIRE, STELLAR)
- Acute management priorities (ABCs, time-sensitive interventions)
- Drug interactions and contraindications
- Interpretation of labs, imaging, ECG in clinical context`;

  let text = chapter.text;
  if (text.length > 15000) {
    text = text.substring(0, 15000) + '\n\n[... chapter continues ...]';
  }

  return `You are a senior medical exam question writer creating board-level MCQs for the ${examContext}

CHAPTER: ${chapter.title} (${chapter.source}, Chapter ${chapter.chapter})
TOPIC: ${topicName} (topic index: ${chapter.topicIndex})

CHAPTER CONTENT:
${text}

EXAMPLE of a board-quality question with an effective trap:

{
  "q": "An 82-year-old woman with moderate Alzheimer's disease (MMSE 16) and CKD stage 3b (eGFR 38) is admitted with a UTI. She becomes acutely agitated, pulling at her IV and trying to climb out of bed. Her family reports this is new behavior. Vital signs: T 38.2°C, HR 96, BP 110/70. Her nurse asks for a medication order. Which is the most appropriate initial pharmacological intervention?",
  "o": ["Haloperidol 0.5 mg IV", "Lorazepam 1 mg IM", "Quetiapine 25 mg PO", "Physical restraints and observation"],
  "c": 0,
  "e": "This patient has hyperactive delirium superimposed on dementia, triggered by infection. The correct answer is low-dose haloperidol (0.5 mg), the first-line antipsychotic for acute delirium per most guidelines including NICE and APA.\n\nOption B (lorazepam) is the classic TRAP — benzodiazepines worsen delirium in elderly patients by increasing confusion and sedation. They are ONLY indicated for delirium tremens or seizure-related agitation. Many trainees reflexively reach for benzos for agitation, making this the most commonly chosen wrong answer.\n\nOption C (quetiapine) is reasonable for delirium but is second-line and takes 1-2 hours for onset via PO route — not appropriate for acute dangerous agitation where the patient is pulling lines.\n\nOption D (restraints) is never first-line and associated with increased mortality, injury, and worsening agitation in elderly delirious patients.\n\nClinical Pearl: In geriatric delirium, treat the CAUSE (antibiotics for UTI), use non-pharmacological measures first (reorientation, lighting, family presence), and reserve antipsychotics for dangerous agitation. Always check QTc before haloperidol. Dose-adjust for renal function."
}

Notice: the best wrong answer (lorazepam) is what a non-geriatrician would instinctively choose. EVERY question you write must have one distractor this tempting.

REQUIREMENTS:
1. Each question MUST be a clinical vignette with specific patient details (age, sex, comorbidities, medications, labs). No abstract "which of the following" questions.
2. Exactly 4 answer options. One correct (0-indexed: 0-3). Randomize which position is correct.
3. The BEST DISTRACTOR must be something a competent but non-specialist physician would pick. Explain in the explanation why it's tempting but wrong.
4. Explanation (250-500 words): why correct answer is right (with mechanism), why EACH wrong answer is wrong (2-3 sentences each, labeled Option A/B/C/D), which option is the "exam trap" and why, and a Clinical Pearl.
5. ${isGeri ? 'Every geriatrics question must include at least ONE of: renal dosing concern, Beers-listed drug, functional status detail, goals-of-care element, or age-specific threshold (e.g., BP target, HbA1c target in elderly).' : 'Every question must connect pathophysiology to the clinical decision — not just "what do you do" but "why this and not that".'}
6. All questions should be HARD. No gimmes. Target the level where a well-prepared candidate gets 65-75% right.
7. Vary the clinical settings: outpatient clinic, ED, ward, ICU, rehabilitation, nursing home, home visit.
8. Include relevant lab values, imaging findings, or medication lists where they add to the reasoning.

OUTPUT FORMAT — respond with ONLY a JSON array, no markdown fences, no preamble:
[
  {
    "q": "Clinical vignette question text ending with a question?",
    "o": ["Option A", "Option B", "Option C", "Option D"],
    "c": 0,
    "t": "${chapter.source}",
    "ti": ${chapter.topicIndex},
    "e": "Detailed explanation with trap analysis and Clinical Pearl."
  }
]

Generate exactly ${count} questions. JSON only, no other text.`;
}

async function callClaude(prompt, apiKey, useProxy) {
  const url = useProxy
    ? 'https://toranot.netlify.app/api/claude'
    : 'https://api.anthropic.com/v1/messages';

  const body = {
    model: 'claude-opus-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  };

  if (useProxy) {
    body.secret = 'shlav-a-mega-2026';
  }

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (!useProxy && apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  
  // Extract text from response
  let text = '';
  if (data.content) {
    text = data.content.map(c => c.text || '').join('');
  } else if (data.choices) {
    text = data.choices[0]?.message?.content || '';
  } else if (typeof data === 'string') {
    text = data;
  }

  return text;
}

// ============================================================
// VALIDATION
// ============================================================

function validateQuestion(q, topicCount) {
  const errors = [];
  
  if (!q.q || typeof q.q !== 'string' || q.q.length < 30) {
    errors.push('Question text too short or missing');
  }
  if (!Array.isArray(q.o) || q.o.length !== 4) {
    errors.push('Must have exactly 4 options');
  }
  if (typeof q.c !== 'number' || q.c < 0 || q.c > 3) {
    errors.push('Correct answer index must be 0-3');
  }
  if (!q.t || !['Hazzard', 'Harrison'].includes(q.t)) {
    errors.push('Source tag must be "Hazzard" or "Harrison"');
  }
  if (typeof q.ti !== 'number' || q.ti < 0 || q.ti >= topicCount) {
    errors.push(`Topic index must be 0-${topicCount - 1}, got ${q.ti}`);
  }
  if (!q.e || typeof q.e !== 'string' || q.e.length < 100) {
    errors.push('Explanation too short or missing');
  }
  
  return errors;
}

function isDuplicate(newQ, existingQs) {
  const prefix = newQ.q.substring(0, 80).toLowerCase();
  return existingQs.some(eq => eq.q.substring(0, 80).toLowerCase() === prefix);
}

function parseGeneratedQuestions(text) {
  // Strip markdown fences if present
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Try to find JSON array
  const arrayStart = clean.indexOf('[');
  const arrayEnd = clean.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1) {
    clean = clean.substring(arrayStart, arrayEnd + 1);
  }
  
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error('  ✗ Failed to parse JSON response');
    console.error('  First 200 chars:', clean.substring(0, 200));
    return [];
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const opts = parseArgs();
  const isGeri = opts.app === 'geriatrics';
  const TOPICS = isGeri ? GERIATRICS_TOPICS : PNIMIT_TOPICS;
  
  console.log(`\n🏥 Question Generator — ${isGeri ? 'Geriatrics (Shlav A)' : 'Internal Medicine (Pnimit)'}`);
  console.log(`   Topics: ${TOPICS.length}, Target: ${opts.count}q per chapter\n`);

  // Load chapters
  const allChapters = loadChapters(opts);
  console.log(`📚 Loaded ${Object.keys(allChapters).length} chapters`);

  // Filter chapters
  let targetChapters;
  if (opts.all) {
    targetChapters = Object.entries(allChapters).filter(([_, ch]) => ch.topicIndex !== undefined);
  } else {
    targetChapters = Object.entries(allChapters).filter(([key, ch]) => {
      return opts.chapters.includes(ch.chapter);
    });
  }

  console.log(`🎯 Processing ${targetChapters.length} chapters\n`);

  // Dry run — just show mapping
  if (opts.dryRun) {
    console.log('DRY RUN — Chapter → Topic Mapping:\n');
    for (const [key, ch] of targetChapters) {
      const topicName = ch.topicIndex !== undefined ? TOPICS[ch.topicIndex] : '⚠️ UNMAPPED';
      console.log(`  ${ch.source} Ch ${ch.chapter}: "${ch.title.substring(0, 50)}" → [${ch.topicIndex}] ${topicName} (${ch.wordCount} words)`);
    }
    
    // Show unmapped chapters
    const unmapped = Object.entries(allChapters).filter(([_, ch]) => ch.topicIndex === undefined);
    if (unmapped.length) {
      console.log(`\n⚠️  ${unmapped.length} unmapped chapters (skipped):`);
      for (const [key, ch] of unmapped) {
        console.log(`  ${ch.source} Ch ${ch.chapter}: "${ch.title.substring(0, 50)}"`);
      }
    }
    return;
  }

  // Load existing questions for dedup
  const existingQs = loadExistingQuestions(opts);
  console.log(`📋 Existing questions: ${existingQs.length}`);

  const outFile = opts.output || `generated-questions-${Date.now()}.json`;
  const outPath = path.resolve(outFile);
  const progressPath = outPath.replace('.json', '.progress.json');

  // Resume: load existing progress
  let allGenerated = [];
  let completedKeys = new Set();
  if (opts.resume && fs.existsSync(outPath)) {
    allGenerated = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    console.log(`♻️  Resuming: loaded ${allGenerated.length} existing questions from ${outFile}`);
  }
  if (opts.resume && fs.existsSync(progressPath)) {
    const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    completedKeys = new Set(prog);
    console.log(`♻️  Skipping ${completedKeys.size} already-completed chapters`);
  }

  // Filter out completed chapters
  const remaining = targetChapters.filter(([key, ch]) => {
    if (completedKeys.has(key)) return false;
    if (ch.text.length < 200) return false;
    return true;
  });
  console.log(`\n⏳ ${remaining.length} chapters to process (${opts.concurrency} parallel)\n`);

  let totalValid = 0, totalDupes = 0, totalInvalid = 0;

  // Process a single chapter — returns { valid, dupes, invalid, questions, key }
  async function processChapter(key, chapter) {
    const topicName = TOPICS[chapter.topicIndex];
    const label = `${chapter.source} Ch ${chapter.chapter}`;
    try {
      const prompt = buildPrompt(chapter, topicName, opts.count, opts.app);
      console.log(`  🤖 ${label}: "${chapter.title.substring(0, 35)}" → ${topicName} (${Math.round(prompt.length / 4)} tok)...`);
      
      const response = await callClaude(prompt, opts.apiKey, opts.proxy);
      const questions = parseGeneratedQuestions(response);
      
      if (!questions.length) {
        console.log(`  ✗ ${label}: No questions parsed`);
        return { valid: 0, dupes: 0, invalid: 0, questions: [], key };
      }

      let valid = 0, dupes = 0, invalid = 0;
      const goodQs = [];
      
      for (const q of questions) {
        q.t = chapter.source;
        q.ti = chapter.topicIndex;
        
        const errors = validateQuestion(q, TOPICS.length);
        if (errors.length) { invalid++; continue; }
        if (isDuplicate(q, [...existingQs, ...allGenerated, ...goodQs])) { dupes++; continue; }
        
        goodQs.push(q);
        valid++;
      }
      
      console.log(`  ✅ ${label}: ${valid} valid, ${dupes} dupes, ${invalid} invalid`);
      return { valid, dupes, invalid, questions: goodQs, key };
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message.substring(0, 100)}`);
      return { valid: 0, dupes: 0, invalid: 0, questions: [], key };
    }
  }

  // Process in parallel batches
  const BATCH = opts.concurrency;
  for (let i = 0; i < remaining.length; i += BATCH) {
    const batch = remaining.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(remaining.length / BATCH);
    console.log(`\n── Batch ${batchNum}/${totalBatches} (${batch.length} chapters) ──`);
    
    const results = await Promise.allSettled(
      batch.map(([key, ch]) => processChapter(key, ch))
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        totalValid += r.value.valid;
        totalDupes += r.value.dupes;
        totalInvalid += r.value.invalid;
        allGenerated.push(...r.value.questions);
        completedKeys.add(r.value.key);
      }
    }

    // Incremental save after each batch
    fs.writeFileSync(outPath, JSON.stringify(allGenerated, null, 2), 'utf-8');
    fs.writeFileSync(progressPath, JSON.stringify([...completedKeys]), 'utf-8');
    console.log(`  💾 Saved: ${allGenerated.length} total questions (${completedKeys.size}/${targetChapters.length} chapters done)`);

    // Rate limit between batches (not between individual calls within a batch)
    if (i + BATCH < remaining.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Generated: ${totalValid} questions (this run)`);
  console.log(`📦 Total in file: ${allGenerated.length} questions`);
  console.log(`🔄 Duplicates skipped: ${totalDupes}`);
  console.log(`❌ Invalid skipped: ${totalInvalid}`);
  console.log(`📁 Saved to: ${outPath}`);
  console.log(`\nTo merge into questions.json:`);
  console.log(`  node scripts/merge-questions.js ${outFile}`);
  if (totalValid < remaining.length * opts.count * 0.5) {
    console.log(`\n💡 Some chapters failed. Re-run with --resume to retry them:`);
    console.log(`  node scripts/generate-questions.cjs --app ${opts.app} --all --count ${opts.count} --output ${outFile} --resume`);
  }
  console.log(`${'='.repeat(60)}\n`);
  // Clean up progress file on full completion
  if (completedKeys.size >= targetChapters.length && fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
