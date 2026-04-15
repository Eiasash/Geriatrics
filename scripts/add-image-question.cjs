#!/usr/bin/env node
/**
 * add-image-question.js — Validate an image file for addition to the question bank.
 *
 * Usage:
 *   node scripts/add-image-question.js <image-path> <key>
 *   node scripts/add-image-question.js questions/images/jun2026_q5.png jun2026_q5
 *   node scripts/add-image-question.js --help
 *
 * What it does:
 *   1. Validates file exists, extension, and size (< 3 MB)
 *   2. Checks for duplicate filename/key in image_map.json
 *   3. Prints exact manual next steps
 *
 * Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'questions', 'images');
const MAP_PATH = path.join(ROOT, 'questions', 'image_map.json');
const MAX_BYTES = 3 * 1024 * 1024;
const VALID_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const SUPA_BUCKET = 'https://krmlzwwelqvlfslwltol.supabase.co/storage/v1/object/public/question-images';

function usage() {
  console.log(`
Usage: node scripts/add-image-question.js <image-path> <key>

Arguments:
  image-path   Path to the image file (e.g. /tmp/ecg_q5.png)
  key          Unique identifier (e.g. jun2026_q5) — used as filename stem

Validates:
  - File exists and has a valid image extension (.png, .jpg, .jpeg, .gif, .webp)
  - File size is under 3 MB
  - No duplicate filename or key in questions/image_map.json

Then prints exact next steps for adding the image to the question bank.
`.trim());
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    usage();
    process.exit(0);
  }

  if (args.length < 2) {
    fail('Expected 2 arguments: <image-path> <key>. Use --help for details.');
  }

  const [imgPath, key] = args;

  // 1. File exists
  if (!fs.existsSync(imgPath)) {
    fail(`File not found: ${imgPath}`);
  }

  // 2. Valid extension
  const ext = path.extname(imgPath).toLowerCase();
  if (!VALID_EXT.has(ext)) {
    fail(`Invalid extension "${ext}". Allowed: ${[...VALID_EXT].join(', ')}`);
  }

  // 3. File size
  const stat = fs.statSync(imgPath);
  const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
  if (stat.size > MAX_BYTES) {
    fail(`File is ${sizeMB} MB — exceeds 3 MB limit. Compress it first.`);
  }

  // 4. Target filename
  const fname = `${key}${ext}`;
  const fpath = `questions/images/${fname}`;

  // 5. Duplicate check
  let imageMap = [];
  if (fs.existsSync(MAP_PATH)) {
    imageMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  }
  const existingFnames = new Set(imageMap.map(e => e.fname));
  if (existingFnames.has(fname)) {
    fail(`Duplicate: "${fname}" already exists in image_map.json`);
  }
  if (fs.existsSync(path.join(IMG_DIR, fname))) {
    fail(`Duplicate: "${fname}" already exists on disk in questions/images/`);
  }

  // All checks passed
  console.log(`\n  OK: ${fname} (${sizeMB} MB, ${ext})\n`);
  console.log('Next steps:\n');
  console.log(`  1. Copy the file to the repo:`);
  console.log(`     cp ${imgPath} ${fpath}\n`);
  console.log(`  2. Upload to Supabase (or use scripts/add-exam-images.py):`);
  console.log(`     ${SUPA_BUCKET}/geri_${key}${ext}\n`);
  console.log(`  3. Add entry to questions/image_map.json:`);
  console.log(`     {`);
  console.log(`       "exam": "${key.split('_q')[0] || key}",`);
  console.log(`       "q_num": ${parseInt((key.match(/_q(\d+)/) || [])[1]) || 0},`);
  console.log(`       "fname": "${fname}",`);
  console.log(`       "fpath": "${fpath}",`);
  console.log(`       "w": <width>,`);
  console.log(`       "h": <height>`);
  console.log(`     }\n`);
  console.log(`  4. Add "img" field to the question in data/questions.json:`);
  console.log(`     "img": "${SUPA_BUCKET}/geri_${key}${ext}"\n`);
  console.log(`  5. Run: npm test`);
  console.log(`  6. Commit and push\n`);
}

main();
