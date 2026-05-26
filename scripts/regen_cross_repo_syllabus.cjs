#!/usr/bin/env node
/**
 * regen_cross_repo_syllabus.cjs — keep Pnimit/Mishpacha sections of
 * syllabus_data.json in sync with the corpus manifests published by
 * Eiasash/InternalMedicine and Eiasash/FamilyMedicine.
 *
 * Companion to:
 *   - Eiasash/InternalMedicine#123  (manifest emitter + cross-repo verifier)
 *   - Eiasash/FamilyMedicine#70     (same, Mishpacha)
 *   - this repo's scripts/regen_derived.cjs (in-repo Geri section regen)
 *
 * Closes the cross-repo extension of the denominator-invalidates-all-ratios
 * bug class (originally PR #259). This is the AUTO-FIX path of the loop:
 * the IM/FM gate FAILS PR merges that would silently break Geri's syllabus,
 * and THIS script is what Geri runs to absorb the new IM/FM corpus state
 * into syllabus_data.json.
 *
 * Sources (in order of fallback):
 *   1. --from-local=PATH or env IM_REPO_PATH / FM_REPO_PATH (read
 *      $PATH/data/.corpus_manifest.json from local clones)
 *   2. https://raw.githubusercontent.com/Eiasash/{InternalMedicine,FamilyMedicine}/main/data/.corpus_manifest.json
 *
 * What gets regenerated:
 *   syllabus_data.json.Pnimit.total_questions_analyzed
 *   syllabus_data.json.Pnimit.topics[*].n_questions
 *   syllabus_data.json.Pnimit.topics[*].frequency_pct
 *   syllabus_data.json.Mishpacha.{same fields}
 *
 * What is PRESERVED (untouched):
 *   - Geri section (regen_derived.cjs owns it)
 *   - weight (opaque; product-tuned)
 *   - keywords, en, he (Geri-side authoritative)
 *   - topic order, total_topics
 *   - any field not explicitly in the regen list above
 *
 * If IM/FM manifests contain topic IDs not in the local syllabus section,
 * or vice versa, that's a STRUCTURAL drift (new topics added, not just
 * counts) and we FAIL — the human must reconcile topic-id namespaces.
 *
 * Modes:
 *   node scripts/regen_cross_repo_syllabus.cjs           regen in place
 *   node scripts/regen_cross_repo_syllabus.cjs --check   diff-only, exit 1 on drift
 *   --verbose      print per-topic diff details on drift
 *   --from-local-im=PATH / --from-local-fm=PATH    read manifests from local paths
 *
 * Env vars (lower precedence than CLI):
 *   IM_REPO_PATH, FM_REPO_PATH
 *
 * Exit codes:
 *   0  no drift (--check) / regen successful (default)
 *   1  drift detected (--check) / regen failed (default)
 *   2  unexpected error (manifest unreachable, structural drift, malformed JSON)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const SYL_PATH = path.join(ROOT, 'data', 'syllabus_data.json');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const VERBOSE = argv.includes('--verbose');
function arg(flag) {
  const found = argv.find(a => a.startsWith(flag + '='));
  return found ? found.slice(flag.length + 1) : null;
}
const IM_LOCAL = arg('--from-local-im') || process.env.IM_REPO_PATH || null;
const FM_LOCAL = arg('--from-local-fm') || process.env.FM_REPO_PATH || null;

const SOURCES = {
  Pnimit: {
    repo: 'InternalMedicine',
    url: 'https://raw.githubusercontent.com/Eiasash/InternalMedicine/main/data/.corpus_manifest.json',
    local: IM_LOCAL ? path.resolve(IM_LOCAL, 'data', '.corpus_manifest.json') : null,
  },
  Mishpacha: {
    repo: 'FamilyMedicine',
    url: 'https://raw.githubusercontent.com/Eiasash/FamilyMedicine/main/data/.corpus_manifest.json',
    local: FM_LOCAL ? path.resolve(FM_LOCAL, 'data', '.corpus_manifest.json') : null,
  },
};

function fetchJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'regen-cross-repo-syllabus/1' } }, (res) => {
      if (res.statusCode === 404) {
        reject(new Error(`manifest not yet published (HTTP 404 from ${url}) — has the companion PR landed?`));
        res.resume(); return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume(); return;
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`malformed JSON from ${url}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout (${timeoutMs}ms) fetching ${url}`)));
  });
}

async function loadManifest(section, source) {
  if (source.local) {
    if (!fs.existsSync(source.local)) {
      throw new Error(`${section}: local manifest path does not exist: ${source.local}`);
    }
    console.log(`[${section}] loading from local: ${source.local}`);
    return JSON.parse(fs.readFileSync(source.local, 'utf-8'));
  }
  console.log(`[${section}] fetching from ${source.url}`);
  return fetchJson(source.url);
}

function validateManifest(section, manifest) {
  const errors = [];
  if (manifest.schema !== 'corpus-manifest-v1') {
    errors.push(`unexpected schema "${manifest.schema}" (expected corpus-manifest-v1)`);
  }
  if (!Number.isInteger(manifest.total_questions) || manifest.total_questions < 0) {
    errors.push(`total_questions must be a non-negative integer (got ${JSON.stringify(manifest.total_questions)})`);
  }
  if (!Array.isArray(manifest.topics)) {
    errors.push(`topics must be an array (got ${typeof manifest.topics})`);
  } else {
    let sumN = 0;
    const idsSeen = new Set();
    for (let i = 0; i < manifest.topics.length; i++) {
      const t = manifest.topics[i];
      if (!t || typeof t !== 'object') {
        errors.push(`topics[${i}] is not an object`);
        continue;
      }
      if (!Number.isInteger(t.id)) {
        errors.push(`topics[${i}].id must be integer (got ${JSON.stringify(t.id)})`);
      } else if (idsSeen.has(t.id)) {
        errors.push(`topics[${i}].id ${t.id} duplicated`);
      } else {
        idsSeen.add(t.id);
      }
      if (!Number.isInteger(t.n_questions) || t.n_questions < 0) {
        errors.push(`topics[${i}].n_questions must be non-negative integer (got ${JSON.stringify(t.n_questions)})`);
      } else {
        sumN += t.n_questions;
      }
    }
    // Sum-vs-total consistency check (sum can be ≤ total — some questions may
    // have missing/non-integer ti and be excluded from per-topic counts in the
    // emitter; sum > total signals a real corruption)
    if (Number.isInteger(manifest.total_questions) && sumN > manifest.total_questions) {
      errors.push(`sum of topic n_questions (${sumN}) exceeds total_questions (${manifest.total_questions})`);
    }
  }
  if (errors.length) {
    throw new Error(`invalid manifest:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Pure function — takes a section object + manifest, returns new section.
 * Mutates: total_questions_analyzed, topics[*].n_questions, topics[*].frequency_pct.
 * Preserves: topic order, all other fields. Fails on structural drift.
 */
function regenSection(sectionName, oldSection, manifest) {
  const out = JSON.parse(JSON.stringify(oldSection));
  if (!Array.isArray(out.topics)) {
    throw new Error(`${sectionName}: existing section has no topics array`);
  }
  const total = manifest.total_questions;
  const manifestById = new Map(manifest.topics.map(t => [t.id, t.n_questions]));

  // Structural-drift check: every existing topic id must exist in manifest, and vice versa.
  const sylIds = new Set(out.topics.map(t => t.id));
  const manIds = new Set(manifest.topics.map(t => t.id));
  const onlyInSyl = [...sylIds].filter(id => !manIds.has(id));
  const onlyInMan = [...manIds].filter(id => !sylIds.has(id));
  if (onlyInSyl.length || onlyInMan.length) {
    const msg = [`${sectionName}: STRUCTURAL DRIFT (topic-id sets differ — manual reconciliation required)`];
    if (onlyInSyl.length) msg.push(`  IDs in syllabus but not in ${SOURCES[sectionName].repo} manifest: ${onlyInSyl.join(', ')}`);
    if (onlyInMan.length) msg.push(`  IDs in ${SOURCES[sectionName].repo} manifest but not in syllabus: ${onlyInMan.join(', ')}`);
    throw new Error(msg.join('\n'));
  }

  out.total_questions_analyzed = total;
  for (const topic of out.topics) {
    const n = manifestById.get(topic.id);
    topic.n_questions = n;
    // Guard against total=0 (valid edge case — empty corpus). frequency_pct is
    // undefined for empty corpus; emit 0 rather than NaN.
    topic.frequency_pct = total > 0 ? Math.round((n / total) * 100 * 100) / 100 : 0;
  }
  return out;
}

function diffSection(sectionName, oldSection, newSection) {
  const diffs = [];
  if (oldSection.total_questions_analyzed !== newSection.total_questions_analyzed) {
    diffs.push({ field: 'total_questions_analyzed', old: oldSection.total_questions_analyzed, new: newSection.total_questions_analyzed });
  }
  const oldById = new Map(oldSection.topics.map(t => [t.id, t]));
  for (const newTopic of newSection.topics) {
    const oldTopic = oldById.get(newTopic.id);
    if (!oldTopic) continue; // structural drift already failed earlier
    if (oldTopic.n_questions !== newTopic.n_questions) {
      diffs.push({ field: `topic ${newTopic.id}.n_questions`, old: oldTopic.n_questions, new: newTopic.n_questions });
    }
    if (oldTopic.frequency_pct !== newTopic.frequency_pct) {
      diffs.push({ field: `topic ${newTopic.id}.frequency_pct`, old: oldTopic.frequency_pct, new: newTopic.frequency_pct });
    }
  }
  return diffs;
}

async function main() {
  const syllabus = JSON.parse(fs.readFileSync(SYL_PATH, 'utf-8'));

  const updatedSyllabus = JSON.parse(JSON.stringify(syllabus));
  const allDiffs = {};

  for (const sectionName of Object.keys(SOURCES)) {
    if (!syllabus[sectionName]) {
      console.error(`FATAL: syllabus_data.json has no ${sectionName} section`);
      process.exit(2);
    }
    let manifest;
    try {
      manifest = await loadManifest(sectionName, SOURCES[sectionName]);
      validateManifest(sectionName, manifest);
    } catch (e) {
      console.error(`FATAL: ${sectionName}: ${e.message}`);
      process.exit(2);
    }
    let newSection;
    try {
      newSection = regenSection(sectionName, syllabus[sectionName], manifest);
    } catch (e) {
      console.error(`FATAL: ${e.message}`);
      process.exit(2);
    }
    const diffs = diffSection(sectionName, syllabus[sectionName], newSection);
    allDiffs[sectionName] = diffs;
    updatedSyllabus[sectionName] = newSection;
  }

  const totalDiffs = Object.values(allDiffs).reduce((a, d) => a + d.length, 0);

  if (CHECK) {
    if (totalDiffs === 0) {
      console.log(`OK: Pnimit + Mishpacha sections in syllabus_data.json are in sync with IM + FM manifests.`);
      process.exit(0);
    }
    console.error(`DRIFT: ${totalDiffs} field(s) in syllabus_data.json differ from IM/FM manifests:`);
    for (const [section, diffs] of Object.entries(allDiffs)) {
      if (diffs.length === 0) continue;
      console.error(`  [${section}] ${diffs.length} drift(s):`);
      const show = VERBOSE ? diffs : diffs.slice(0, 5);
      for (const d of show) console.error(`    ${d.field}: ${d.old} → ${d.new}`);
      if (!VERBOSE && diffs.length > 5) console.error(`    (+${diffs.length - 5} more — rerun with --verbose)`);
    }
    console.error(`\nRun: node scripts/regen_cross_repo_syllabus.cjs   to absorb IM/FM corpus state.`);
    process.exit(1);
  }

  // Default mode: write
  const out = JSON.stringify(updatedSyllabus, null, 2) + '\n';
  fs.writeFileSync(SYL_PATH, out);
  if (totalDiffs === 0) {
    console.log(`No-op: Pnimit + Mishpacha already in sync (file rewritten byte-identical, normalized).`);
  } else {
    console.log(`Updated syllabus_data.json: ${totalDiffs} field(s) absorbed from IM/FM manifests.`);
    for (const [section, diffs] of Object.entries(allDiffs)) {
      if (diffs.length > 0) console.log(`  [${section}] ${diffs.length} drift(s) resolved`);
    }
  }
}

main().catch((e) => {
  console.error(`FATAL: unexpected error: ${e.message}`);
  process.exit(2);
});
