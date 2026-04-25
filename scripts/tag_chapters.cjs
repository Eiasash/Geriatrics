#!/usr/bin/env node
/**
 * tag_chapters.cjs — bidirectional chapter linker (Hazzard + Harrison).
 *
 * Strategy: topic-first, text-refined.
 *
 *   Phase 1 — TOPIC_CHAPTER_MAP: hand-curated mapping of every topic index
 *   (0..39) to its canonical Hazzard + Harrison chapter. This gives every
 *   question a reliable default based on its topic.
 *
 *   Phase 2 — Text override: if the question text contains strong keywords
 *   pointing to a more specific chapter (e.g. the topic is "infections"
 *   but the question is specifically about endocarditis), override with the
 *   better-matching chapter. Uses OVERRIDE_PATTERNS — explicit regex → chapter.
 *
 * Output: data/question_chapters.json  — { qIdx: { haz: N, har: M } }
 *
 * Idempotent; same inputs → same output.
 *
 * Usage: node scripts/tag_chapters.cjs [--verbose]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_PATH = path.join(ROOT, 'data/questions.json');
const TOPICS_PATH = path.join(ROOT, 'data/topics.json');
const HAZ_PATH = path.join(ROOT, 'data/hazzard_chapters.json');
const HAR_PATH = path.join(ROOT, 'harrison_chapters.json');
const OUT_PATH = path.join(ROOT, 'data/question_chapters.json');

const VERBOSE = process.argv.includes('--verbose');

/**
 * Topic → canonical chapters.
 * Keys match data/topics.json order (0..39).
 * Hazzard chapters are from the 108-chapter TOC in data/hazzard_chapters.json.
 * Harrison chapters are from the 69 chapters we have full text for.
 * null means "no good default mapping for this book".
 */
const TOPIC_CHAPTER_MAP = {
  0:  { haz: 1,  har: null },              // biology of aging
  1:  { haz: 2,  har: null },              // demography / epidemiology
  2:  { haz: 8,  har: null },              // CGA
  3:  { haz: 42, har: null },              // frailty / sarcopenia → Hazzard Frailty
  4:  { haz: 43, har: 26 },                // falls → Hazzard Falls, Harrison Weakness
  5:  { haz: 58, har: 433 },               // delirium → Harrison Neuro approach
  6:  { haz: 59, har: 433 },               // dementia → Harrison Neuro approach
  7:  { haz: 65, har: null },              // depression → Hazzard Major Depression
  8:  { haz: 22, har: null },              // polypharmacy / Beers
  9:  { haz: 30, har: 50 },                // nutrition → Harrison Weight Loss
  10: { haz: 46, har: null },              // pressure injuries
  11: { haz: 47, har: null },              // incontinence
  12: { haz: 87, har: 49 },                // constipation → Harrison Diarrhea/Constipation
  13: { haz: 44, har: null },              // sleep
  14: { haz: 68, har: 14 },                // pain → Harrison Pain
  15: { haz: 51, har: null },              // osteoporosis
  16: { haz: 52, har: 382 },               // osteoarthritis → Harrison Articular
  17: { haz: 74, har: 286 },               // cardio/coronary → Harrison STEMI
  18: { haz: 76, har: 316 },               // heart failure → Harrison Cardiogenic shock/pulm edema
  19: { haz: 79, har: 243 },               // hypertension → Harrison CV approach
  20: { haz: 62, har: 438 },               // stroke → Harrison Ischemic stroke
  21: { haz: 81, har: 295 },               // COPD/pulmonary → Harrison Resp approach
  22: { haz: 40, har: 388 },               // diabetes (Hazzard ch39/40 endocrine cluster) → Harrison Endocrine
  23: { haz: 40, har: 388 },               // thyroid → Hazzard endocrine, Harrison Endocrine
  24: { haz: 83, har: 322 },               // kidney → Harrison CKD
  25: { haz: 94, har: 66 },                // anemia → Harrison Anemia
  26: { haz: 88, har: 79 },                // cancer → Harrison Infections in Cancer
  27: { haz: 3,  har: 315 },               // infection → Hazzard Immunology, Harrison Sepsis
  28: { haz: 67, har: null },              // palliative care
  29: { haz: 72, har: null },              // ethics
  30: { haz: 48, har: null },              // elder abuse
  31: { haz: 26, har: null },              // driving → Hazzard Legal Issues (closest)
  32: { haz: 26, har: null },              // guardianship → Hazzard Legal Issues
  33: { haz: 7,  har: null },              // patient rights → Hazzard Decision Making / ACP
  34: { haz: 7,  har: null },              // advance directives → Hazzard Decision Making / ACP
  35: { haz: 17, har: null },              // community / LTC / nursing home
  36: { haz: 55, har: null },              // rehabilitation
  37: { haz: 34, har: null },              // vision / hearing → Hazzard Hearing Loss (most questions)
  38: { haz: 27, har: null },              // perioperative
  39: { haz: 15, har: null },              // emergency / ED
  40: { haz: 61, har: 433 },               // Parkinson → Hazzard Ch 61 (Parkinson Disease), Harrison Neuro approach
  41: { haz: 77, har: 286 },               // Arrhythmia → Hazzard Ch 77 (Cardiac Arrhythmias), Harrison Cardiac
  42: { haz: 31, har: 50 },                // Dysphagia → Hazzard Ch 31 (Disorders of Swallowing), Harrison Weight Loss
  43: { haz: 36, har: null },              // Andropause / aging man → Hazzard Ch 36 (Sexuality and the Aging Man)
  44: { haz: 10, har: null },              // Prevention & health promotion → Hazzard Ch 10 (Prevention and Screening)
  45: { haz: 11, har: null },              // Geriatric team / interdisciplinary care → Hazzard Ch 11 (Age-Friendly Care)
};

/**
 * Explicit keyword patterns that override the topic default.
 * Each rule is [regex, ov, opts?].
 *   - ov: { haz?, har? } — which default(s) to override.
 *   - opts.onlyTopics?: number[] — if present, override only fires when
 *     q.ti ∈ opts.onlyTopics (prevents Hebrew-substring false positives
 *     outside the expected clinical context).
 *
 * Last matching rule wins per-field.
 */
const OVERRIDE_PATTERNS = [
  // Specific infections → Harrison disease-specific chapter
  [/אנדוקרדיטיס|\bendocarditis\b/i,                   { har: 133 }, { onlyTopics: [17, 27] }],
  [/מנינגיטיס|\bmeningitis\b/i,                        { har: 143 }, { onlyTopics: [27] }],
  [/אנצפליטיס|\bencephalitis\b/i,                      { har: 142 }, { onlyTopics: [27] }],
  [/אוסטאומיאליטיס|\bosteomyelit/i,                    { har: 136 }, { onlyTopics: [27] }],

  // Specific stroke subtype — only within stroke topic
  [/intracerebral hemorrhage|\bICH\b|דימום.{0,20}תוך.?מוחי|\bSAH\b|subarachnoid/i,
                                                       { har: 439 }, { onlyTopics: [20] }],

  // Specific CAD subtype — only within cardio topic
  [/\bNSTEMI\b|non.?ST.?elevation/i,                   { har: 285 }, { onlyTopics: [17] }],
  [/\bSTEMI\b|ST.?elevation|עליית\s*ST/i,              { har: 286 }, { onlyTopics: [17] }],

  // Iron deficiency anemia — only within anemia topic
  [/iron.?deficiency|IDA\b/i,                          { har: 102 }, { onlyTopics: [25] }],

  // GI — only within GI-adjacent topics (17 cardio has gastritis via NSAID, 24 kidney uses diuretics, etc.)
  [/\bgi.?bleed|hematemesis|\bmelena\b/i,              { har: 51 },  { onlyTopics: [25] }],
  [/\bjaundice\b|צהבת/i,                               { har: 52 }],
  [/\bascites\b|מיימת/i,                               { har: 53 }],
  [/\bcirrhosis\b|שחמת/i,                              { har: 355 }],

  // Neuro-specific
  [/guillain.?barr|\bGBS\b/i,                          { har: 458 }],
  [/myasthenia|מיאסתניה/i,                             { har: 459 }],
  [/\bseizure|פרכוס|\bepilepsy\b|אפילפסיה/i,           { har: 436 }, { onlyTopics: [5, 6, 20] }],

  // Rheum
  [/\bvasculitis\b|וסקוליטיס|\bGCA\b|giant.?cell.?art|polymyalg/i, { har: 375 }],
  [/\bgout\b|שגדון|גאוט/i,                             { har: 384 }],
  [/\bsarcoidosis\b|סרקואידוז/i,                       { har: 379 }],

  // Kidney subtype — only within kidney topic
  [/\bAKI\b|acute.?kidney.?injury/i,                   { har: 321 }, { onlyTopics: [24] }],
  [/\bCKD\b|chronic.?kidney/i,                         { har: 322 }, { onlyTopics: [24] }],

  // Cardiac arrest — only within cardio topics
  [/cardiac.?arrest|\bVF\b|ventricular.?fibrill/i,     { har: 317 }, { onlyTopics: [17, 18, 39] }],

  // Hazzard refinements (each scoped to plausible topics to avoid bleed-through)
  [/\bsyncope\b|סינקופה|vasovagal/i,                   { haz: 45 }, { onlyTopics: [4, 17, 18, 39] }],
  [/\bvertigo\b|ורטיגו|BPPV\b/i,                       { haz: 45 }, { onlyTopics: [4, 39] }],
  [/parkinson|פרקינסון/i,                              { haz: 61 }, { onlyTopics: [4, 6, 36] }],
  [/hip.?fracture|שבר.{0,4}ירך|שבר.{0,6}צוואר.{0,4}ירך/i, { haz: 53 }, { onlyTopics: [4, 38, 36] }],
  [/\bTBI\b|traumatic.?brain|subdural|\bSDH\b/i,       { haz: 64 }, { onlyTopics: [4, 6, 20, 39] }],
  [/\bBPH\b|benign.?prostat|prostat.*hyperpl/i,        { haz: 38 }, { onlyTopics: [11, 26] }],
  [/valvular|aortic.?stenos|mitral.?regurg|מסתם/i,     { haz: 75 }, { onlyTopics: [17, 18] }],
  [/arrhythm|atrial.?fibrillation|פרפור\s*פרוזד|\bAFib\b/i, { haz: 77 }, { onlyTopics: [17, 18, 20] }],
  [/\bPVD\b|peripheral.?vascular|כלי\s*דם\s*היקפי/i,   { haz: 78 }, { onlyTopics: [17] }],
  [/\blymphoma\b|לימפומה|\bleukemi|לוקמיה|\bMDS\b/i,   { haz: 95 }, { onlyTopics: [25, 26] }],
  [/\bBPSD\b|behavioral.?and.?psychol|\bNPI\b|agitation/i, { haz: 60 }, { onlyTopics: [6, 7] }],
  [/dysphagia|swallow|דיספגיה|\bבליעה\b/i,             { haz: 31 }, { onlyTopics: [9, 20, 38] }],
  [/sarcopenia|סרקופניה/i,                             { haz: 49 }, { onlyTopics: [3, 9, 36] }],
];

function applyOverrides(text, topicIdx, defaults) {
  let haz = defaults.haz, har = defaults.har;
  for (const [regex, ov, opts] of OVERRIDE_PATTERNS) {
    if (opts && opts.onlyTopics && !opts.onlyTopics.includes(topicIdx)) continue;
    if (regex.test(text)) {
      if (ov.haz !== undefined) haz = ov.haz;
      if (ov.har !== undefined) har = ov.har;
    }
  }
  return { haz, har };
}

function main() {
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
  const topics = JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf8'));
  const haz = JSON.parse(fs.readFileSync(HAZ_PATH, 'utf8'));
  const har = JSON.parse(fs.readFileSync(HAR_PATH, 'utf8'));

  // Validate all mapped chapter ids actually exist in the source books
  for (const [ti, m] of Object.entries(TOPIC_CHAPTER_MAP)) {
    if (m.haz !== null && !haz[m.haz]) {
      throw new Error(`TOPIC_CHAPTER_MAP[${ti}].haz=${m.haz} not in hazzard_chapters.json`);
    }
    if (m.har !== null && !har[m.har]) {
      throw new Error(`TOPIC_CHAPTER_MAP[${ti}].har=${m.har} not in harrison_chapters.json`);
    }
  }

  const out = {};
  let tagged = 0, hazHits = 0, harHits = 0;
  const hazCounts = {}, harCounts = {};
  let overridesApplied = 0;

  questions.forEach((q, i) => {
    const defaults = TOPIC_CHAPTER_MAP[q.ti] || { haz: null, har: null };
    const rawText = [q.q || '', (q.o || []).join(' '), q.e || ''].join(' ');
    const finalCh = applyOverrides(rawText, q.ti, defaults);
    if (finalCh.haz !== defaults.haz || finalCh.har !== defaults.har) overridesApplied++;

    const entry = {};
    if (finalCh.haz !== null && finalCh.haz !== undefined) {
      entry.haz = finalCh.haz;
      hazHits++;
      hazCounts[entry.haz] = (hazCounts[entry.haz] || 0) + 1;
    }
    if (finalCh.har !== null && finalCh.har !== undefined) {
      entry.har = finalCh.har;
      harHits++;
      harCounts[entry.har] = (harCounts[entry.har] || 0) + 1;
    }
    if (entry.haz !== undefined || entry.har !== undefined) {
      out[i] = entry;
      tagged++;
    }
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(out) + '\n', 'utf8');
  const hazTitle = id => (haz[id] && haz[id].title) || '?';
  const harTitle = id => (har[id] && har[id].title) || '?';
  console.log(`Tagged ${tagged}/${questions.length} (${(tagged/questions.length*100).toFixed(1)}%)`);
  console.log(`  Hazzard hits: ${hazHits}  Harrison hits: ${harHits}  Overrides: ${overridesApplied}`);
  if (VERBOSE) {
    console.log('  Top Hazzard:');
    Object.entries(hazCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>
      console.log(`    ch${k} (${v}): ${hazTitle(k).slice(0,50)}`));
    console.log('  Top Harrison:');
    Object.entries(harCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>
      console.log(`    ch${k} (${v}): ${harTitle(k).slice(0,50)}`));
  }
  console.log(`→ ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();
