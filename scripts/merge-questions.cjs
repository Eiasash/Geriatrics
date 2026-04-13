#!/usr/bin/env node
/**
 * Merge generated questions into data/questions.json
 * 
 * Usage:
 *   node scripts/merge-questions.js generated-questions-12345.json
 *   node scripts/merge-questions.js generated-questions-12345.json --dry-run
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!inputFile) {
  console.error('Usage: node scripts/merge-questions.js <generated-file.json> [--dry-run]');
  process.exit(1);
}

const qPath = path.resolve(__dirname, '..', 'data', 'questions.json');
const existing = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
const generated = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf-8'));

console.log(`\n📋 Existing questions: ${existing.length}`);
console.log(`📥 Generated questions: ${generated.length}`);

// Dedup by first 80 chars
const existingPrefixes = new Set(existing.map(q => q.q.substring(0, 80).toLowerCase()));
const newQs = [];
let dupes = 0;

for (const q of generated) {
  const prefix = q.q.substring(0, 80).toLowerCase();
  if (existingPrefixes.has(prefix)) {
    dupes++;
    continue;
  }
  // Validate schema
  if (!q.q || !Array.isArray(q.o) || q.o.length !== 4 || 
      typeof q.c !== 'number' || !q.t || typeof q.ti !== 'number' || !q.e) {
    console.log(`  ⚠️ Skipping invalid: ${q.q?.substring(0, 60) || 'no question text'}`);
    continue;
  }
  existingPrefixes.add(prefix);
  newQs.push(q);
}

console.log(`\n✅ New unique questions: ${newQs.length}`);
console.log(`🔄 Duplicates skipped: ${dupes}`);

if (dryRun) {
  console.log('\n🏃 DRY RUN — no files modified');
  // Show topic distribution
  const topicCounts = {};
  for (const q of newQs) {
    topicCounts[q.ti] = (topicCounts[q.ti] || 0) + 1;
  }
  console.log('\nTopic distribution:');
  for (const [ti, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  [${ti}]: ${count} questions`);
  }
} else {
  const merged = [...existing, ...newQs];
  fs.writeFileSync(qPath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`\n📁 Written ${merged.length} total questions to ${qPath}`);
  console.log(`   (was ${existing.length}, added ${newQs.length})`);
}

console.log('');
