// Audit-8 — offline stemHash → covariate join index from
// data/questions.json. Forward-referenced by scripts/lib/hashStem.mjs:3.
//
// Binding spec: docs/AUDIT8_PRE_REGISTERED_GATE.md (#233 G3/D3 + G4.2/D1/D2).
// Crosswalk: docs/AUDIT8_ANALYSIS_TOOLING_CROSSWALK.md.
//
// Rebuilt clause-by-clause from the on-main gate — NOT derived from the
// set-aside web-draft `build_stemhash_index.mjs` (which is not on disk and
// implements the superseded 5-covariate `chapter` set; merged G4 wins).
//
// Deterministic, read-only. Hashes BOTH `q` and `q_en` (bilingual toggle:
// the bot may DOM-extract either variant; covariates are variant-invariant
// and stem_len is ALWAYS canonical `q` length per G4.2, so the matched
// variant never changes a covariate value — D3 join determinacy).

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashStem, normStem } from './lib/hashStem.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Parse the canonical 12 TOPIC_GROUPS straight from the monolith so this
// tool can never drift from the app's own grouping (the exact hazard
// scripts/lib/hashStem.mjs warns about for djb2 — same discipline here).
export function parseTopicGroups(htmlPath) {
  const html = readFileSync(htmlPath, 'utf-8');
  const m = html.match(/const\s+TOPIC_GROUPS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error('build_stemhash_index: TOPIC_GROUPS block not found in ' + htmlPath);
  const body = m[1];
  const groups = [];
  // Each entry: {title:'…', emoji:'…', tis:[…]},
  const entryRe = /\{[^}]*?title:\s*'([^']*)'[^}]*?tis:\s*\[([^\]]*)\][^}]*?\}/g;
  let e;
  while ((e = entryRe.exec(body)) !== null) {
    const title = e[1];
    const tis = e[2]
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n));
    groups.push({ title, tis });
  }
  if (groups.length !== 12) {
    throw new Error(
      `build_stemhash_index: expected 12 TOPIC_GROUPS, parsed ${groups.length} (gate G4.2 locks the repo's 12)`,
    );
  }
  const tiToGroup = {};
  groups.forEach((g, gi) => g.tis.forEach((ti) => { tiToGroup[ti] = gi; }));
  return { groups, tiToGroup };
}

function covariatesFor(row, tiToGroup) {
  const q = String(row.q == null ? '' : row.q);
  const ti = Number.isInteger(row.ti) ? row.ti : -1;
  return {
    // G4.2: stem_len = char length of the CANONICAL `q` (joined), always
    // — never the q_en variant, even when the join matched via q_en.
    stem_len: q.length,
    ti,
    topic_group: ti in tiToGroup ? tiToGroup[ti] : '__ungrouped__',
    bilingual: !!(row.q_en && String(row.q_en).trim().length), // G4.2/D2
    t: String(row.t == null ? '__missing__' : row.t),          // D1: categorical
    c_accept: Array.isArray(row.c_accept) && row.c_accept.length > 0, // D2
    broken: row.broken === true,                                // D2
  };
}

export function buildIndex(opts = {}) {
  const questionsPath = opts.questionsPath || path.join(REPO_ROOT, 'data', 'questions.json');
  const htmlPath = opts.htmlPath || path.join(REPO_ROOT, 'shlav-a-mega.html');
  const QZ = JSON.parse(readFileSync(questionsPath, 'utf-8'));
  if (!Array.isArray(QZ)) throw new Error('questions.json is not an array');
  const { groups, tiToGroup } = parseTopicGroups(htmlPath);

  const rows = QZ.map((row) => covariatesFor(row, tiToGroup));
  const byHash = Object.create(null);
  const add = (h, idx) => {
    if (h == null) return;
    (byHash[h] || (byHash[h] = [])).push(idx);
  };
  QZ.forEach((row, idx) => {
    add(hashStem(normStem(String(row.q == null ? '' : row.q))), idx);
    if (row.q_en && String(row.q_en).trim().length) {
      add(hashStem(normStem(String(row.q_en))), idx);
    }
  });

  // D3 corpus sanity: unique stems, dup groups, per-covariate
  // within-dup-group agreement (so the analyzer's per-covariate
  // determinate-join logic is auditable against these counts).
  const COVS = ['stem_len', 'topic_group', 'bilingual', 't', 'c_accept', 'broken'];
  const qHashGroups = Object.create(null); // hash of `q` only → idx[]
  QZ.forEach((row, idx) => {
    const h = hashStem(normStem(String(row.q == null ? '' : row.q)));
    (qHashGroups[h] || (qHashGroups[h] = [])).push(idx);
  });
  const dupGroups = Object.values(qHashGroups).filter((g) => g.length > 1);
  const perCovAgreement = {};
  for (const c of COVS) {
    let agree = 0;
    for (const g of dupGroups) {
      const v0 = JSON.stringify(rows[g[0]][c]);
      if (g.every((i) => JSON.stringify(rows[i][c]) === v0)) agree++;
    }
    perCovAgreement[c] = { agree, of: dupGroups.length };
  }

  return {
    meta: {
      schema: 'audit8-stemhash-index/1',
      n: QZ.length,
      uniqueQStemHashes: Object.keys(qHashGroups).length,
      dupGroupCount: dupGroups.length,
      perCovariateWithinDupGroupAgreement: perCovAgreement,
      builtFrom: path.relative(REPO_ROOT, questionsPath),
      topicGroupsFrom: path.relative(REPO_ROOT, htmlPath),
    },
    topicGroups: groups,
    tiToGroup,
    byHash,   // full-stem djb2 (q AND q_en) → question idx[]
    rows,     // covariates aligned to questions.json index
  };
}

// CLI
const isMain = process.argv[1] && process.argv[1].endsWith('build_stemhash_index.mjs');
if (isMain) {
  const outArg = process.argv.indexOf('--out');
  const out = outArg !== -1 ? process.argv[outArg + 1]
    : path.join(REPO_ROOT, 'chaos-reports', 'v4-long', '_stemhash_index.json');
  const idx = buildIndex();
  writeFileSync(out, JSON.stringify(idx, null, 2));
  const a = idx.meta.perCovariateWithinDupGroupAgreement;
  console.log(`[build_stemhash_index] n=${idx.meta.n} uniqueQ=${idx.meta.uniqueQStemHashes} dupGroups=${idx.meta.dupGroupCount}`);
  console.log(`[build_stemhash_index] within-dup-group agreement: ` +
    Object.entries(a).map(([k, v]) => `${k} ${v.agree}/${v.of}`).join(', '));
  console.log(`[build_stemhash_index] wrote ${out}`);
}
