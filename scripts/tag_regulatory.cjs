#!/usr/bin/env node
/**
 * Tag Israeli regulatory/ethics questions in the Geri question bank.
 *
 * Outputs data/regulatory.json — an array of qIdx values.
 *
 * Regulatory domains (with Hebrew + English variants):
 *   1. ייפוי כוח מתמשך (durable power of attorney)
 *   2. מקבל החלטות זמני (temporary decision-maker / substitute decision-maker)
 *   3. אפוטרופוס / guardianship
 *   4. capacity / כשירות / decision-making capacity
 *   5. advance directives / הנחיות רפואיות מקדימות
 *   6. סיעוד מורכב (complex nursing-home admission criteria)
 *   7. driving fitness / כושר נהיגה / חוזר מנכ"ל 6/2023
 *   8. חוק החולה הנוטה למות (Dying Patient Act)
 *   9. elder abuse reporting / חובת דיווח
 *
 * Heuristic: multi-keyword regex match + scoring to reduce false positives.
 * A question must match >=1 strong keyword to be tagged.
 */

const fs = require('fs');
const path = require('path');

const QUESTIONS = path.resolve(__dirname, '..', 'data', 'questions.json');
const OUT = path.resolve(__dirname, '..', 'data', 'regulatory.json');

// Strong keywords (1 match = tag) — highly specific to Israeli regulatory context
const STRONG = [
  /ייפוי\s*כוח\s*מתמשך/,
  /ייפוי\s*כח\s*מתמשך/,
  /מקבל\s*החלטות\s*(זמני|חלופי)/,
  /הנחיות\s*רפואיות\s*מקדימות/,
  /חוק\s*החולה\s*הנוטה\s*למות/,
  /סיעוד\s*מורכב/,
  /חוזר\s*מנכ["']?ל/,
  /אפוטרופ(וס|סות)/,
  /דיינ?ר\s+שטוף/,  // placeholder, unlikely
  /כושר\s*(נהיגה|לנהוג)/,
  /כשירות\s*(לנהוג|קוגניטיבית|משפטית)/,
  /\bdurable\s+power\s+of\s+attorney\b/i,
  /\badvance\s+directive/i,
  /\bguardianship\b/i,
  /\bpower\s+of\s+attorney\b/i,
  /driving\s+fitness/i,
  /dying\s+patient\s+act/i,
  /\bcapacity\s+(assessment|evaluation|determination)/i,
  /substituted?\s+decision\s*-?\s*maker/i,
];

// Supporting keywords — need context (strong OR 2+ supporting)
const SUPPORT = [
  /\bcapacity\b/i,
  /\bcompetenc/i,
  /\bnהיגה\b/,
  /נהיגה/,
  /חובת\s*דיווח/,
  /elder\s+abuse/i,
  /ethics\s+consult/i,
  /הוועדה\s*האתי/,
  /פסול\s*דין/,
  /מתמנ/,  // appointment context
];

function scoreQuestion(q) {
  const text = [q.q, ...(q.o || []), q.e || ''].join(' ');
  let strong = 0, support = 0;
  const hits = [];
  for (const rx of STRONG) {
    if (rx.test(text)) { strong++; hits.push(`S:${rx.source.slice(0, 30)}`); }
  }
  for (const rx of SUPPORT) {
    if (rx.test(text)) { support++; hits.push(`s:${rx.source.slice(0, 20)}`); }
  }
  return { strong, support, hits };
}

function main() {
  const qs = JSON.parse(fs.readFileSync(QUESTIONS, 'utf-8'));
  const tagged = [];
  const samples = [];

  qs.forEach((q, idx) => {
    const { strong, support, hits } = scoreQuestion(q);
    // Tag if: >=1 strong match OR >=2 supporting matches
    if (strong >= 1 || support >= 2) {
      tagged.push(idx);
      if (samples.length < 5) {
        samples.push({ idx, hits, q: q.q.slice(0, 120) });
      }
    }
  });

  fs.writeFileSync(OUT, JSON.stringify(tagged) + '\n');
  console.log(`✓ Tagged ${tagged.length} / ${qs.length} questions as regulatory (${(tagged.length / qs.length * 100).toFixed(1)}%)`);
  console.log(`✓ Wrote ${OUT}`);
  console.log('\nSamples:');
  for (const s of samples) {
    console.log(`  [${s.idx}] ${s.hits.join(', ')}`);
    console.log(`       ${s.q}...`);
  }
}

main();
