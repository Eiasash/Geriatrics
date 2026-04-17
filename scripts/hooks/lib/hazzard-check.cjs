#!/usr/bin/env node
/**
 * hazzard-check.js — range-aware Hazzard syllabus-drift detector.
 *
 * P005-2026 excludes Hazzard chapters: 2, 3, 4, 5, 6, 34, 62.
 *
 * The previous POSIX-ERE regex in pre-edit-safety.sh / weekly-audit/audit.sh
 * produced false positives because it had no range-expansion logic:
 *   - "Ch 43"    matched digit "4" → false positive
 *   - "Ch 11-12" matched digit "2" → false positive
 *   - "Ch 33-34" matched digit "3" → right drift for the wrong reason
 *
 * This checker tokenizes chapter lists like "Ch 1-3", "Ch 2,4",
 * "Ch 33-34", "Chapter 88-92", expands ranges, and intersects the
 * resulting set with the excluded set. Only counts chapter lists that
 * appear in the same textual segment as the word "Hazzard".
 *
 * Usage:
 *   node scripts/hooks/lib/hazzard-check.js data/notes.json data/questions.json ...
 *
 * Exit codes:
 *   0 — no drifts
 *   2 — one or more drifts (prints "<file>\t<location>\t<text>\t<excluded>")
 *
 * Programmatic:
 *   const { findExcludedChapters } = require('./hazzard-check.js');
 *   findExcludedChapters("Hazzard's Ch 1-3") // => [2, 3]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const EXCLUDED = new Set([2, 3, 4, 5, 6, 34, 62]);

// Extract all excluded-Hazzard chapter numbers cited in a single string.
// A "Hazzard segment" runs from the word "Hazzard" up to the next comma
// that is immediately followed by a non-Hazzard source keyword, or end of
// string. Chapter-list tokens inside that segment are then expanded.
function findExcludedChapters(text) {
  if (!text || typeof text !== 'string') return [];
  if (!/Hazzard/i.test(text)) return [];

  // Non-Hazzard source keywords that end the Hazzard segment when they
  // follow a comma.
  const SOURCE_RE = /^(Brookdale|Harrison|Harrison's|Washington|Israeli|Mitchell|SZMC|Takanah|DAG|Ministry|חוק|תקנה|תקנות)/i;

  // Find every Hazzard-anchored segment in the text.
  const segments = [];
  const start = /Hazzard/gi;
  let m;
  while ((m = start.exec(text)) !== null) {
    const from = m.index;
    // Walk forward splitting on commas; stop at a comma whose following
    // token is a non-Hazzard source.
    let end = text.length;
    const commaRe = /,/g;
    commaRe.lastIndex = from;
    let cm;
    while ((cm = commaRe.exec(text)) !== null) {
      const rest = text.slice(cm.index + 1).trimStart();
      if (SOURCE_RE.test(rest)) { end = cm.index; break; }
    }
    segments.push(text.slice(from, end));
  }

  // Parse chapter lists inside each segment.
  const hits = new Set();
  const chRe = /\bCh(?:apter|\.)?\s*([0-9]+(?:\s*[-,]\s*[0-9]+)*)/gi;
  for (const seg of segments) {
    let cm;
    while ((cm = chRe.exec(seg)) !== null) {
      const parts = cm[1].split(',');
      for (const part of parts) {
        const rng = part.trim().split(/\s*-\s*/).map(n => parseInt(n, 10));
        if (rng.length === 2 && Number.isFinite(rng[0]) && Number.isFinite(rng[1])) {
          const lo = Math.min(rng[0], rng[1]);
          const hi = Math.max(rng[0], rng[1]);
          for (let i = lo; i <= hi; i++) if (EXCLUDED.has(i)) hits.add(i);
        } else if (Number.isFinite(rng[0])) {
          if (EXCLUDED.has(rng[0])) hits.add(rng[0]);
        }
      }
    }
  }
  return [...hits].sort((a, b) => a - b);
}

// Walk a JSON value, calling visit(path, stringValue) for every string leaf.
function walkStrings(node, visit, pathParts) {
  pathParts = pathParts || [];
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    visit(pathParts.join('.'), node);
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walkStrings(node[i], visit, pathParts.concat('[' + i + ']'));
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) walkStrings(node[k], visit, pathParts.concat(k));
  }
}

function scanFile(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    // Non-JSON or unreadable — scan raw text.
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
    const ex = findExcludedChapters(raw);
    return ex.length ? [{ file, location: '(raw)', text: '(see file)', excluded: ex }] : [];
  }
  const drifts = [];
  walkStrings(data, (loc, s) => {
    const ex = findExcludedChapters(s);
    if (ex.length) drifts.push({ file, location: loc, text: s, excluded: ex });
  });
  return drifts;
}

// CLI entrypoint.
if (require.main === module) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: hazzard-check.js <file.json> [...]');
    process.exit(1);
  }
  let any = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const drifts = scanFile(f);
    for (const d of drifts) {
      process.stdout.write(
        d.file + '\t' + d.location + '\t' + JSON.stringify(d.text) + '\t' + d.excluded.join(',') + '\n'
      );
      any++;
    }
  }
  process.exit(any ? 2 : 0);
}

module.exports = { findExcludedChapters, scanFile, EXCLUDED };
