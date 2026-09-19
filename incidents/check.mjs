/* Validator for the incident ledger.
   This is a GUARD, not a structural prevention, and incidents/README.md records it as one.
   It exists because ledger-check.mjs printed "ledger ok" and exited 0 while accepting verdicts
   with no commit pin at all (INC-004). A check that cannot fail the build is not a check, so
   every failure path below reaches process.exit(1). */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'incidents.jsonl');
const KINDS = ['structural', 'guard', 'convention', 'none'];
const REQUIRED = ['id', 'date', 'repo', 'claim', 'truth', 'detected_by', 'class', 'fix', 'prevention'];

let fails = 0;
const fail = (id, msg) => { console.log('FAIL  ' + id + '  — ' + msg); fails++; };

/* strip a UTF-8 BOM. Windows PowerShell 5.1's Set-Content -Encoding utf8 writes one by default,
   and this ledger is edited on a Windows box, so without this a perfectly valid file fails to
   parse on line 1. Found by the positive control below, not by reasoning. */
const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split('\n').filter(l => l.trim());
const seen = new Map();
const byClass = new Map();
const entries = [];

raw.forEach((line, i) => {
  let e;
  try { e = JSON.parse(line); }
  catch (err) { fail('line ' + (i + 1), 'not valid JSON: ' + err.message); return; }
  entries.push(e);

  for (const k of REQUIRED) if (!(k in e)) fail(e.id || ('line ' + (i + 1)), 'missing required field: ' + k);
  if (!e.id) return;

  /* ids are stable and NEVER reused — a reused id silently rewrites history, which is the
     corruption INC-007's allocator has in the guard registry, one level up. */
  if (seen.has(e.id)) fail(e.id, 'duplicate id, first seen at line ' + seen.get(e.id));
  seen.set(e.id, i + 1);

  /* a timestamp that says Z and is not Z asserts a property it does not have */
  if (typeof e.date === 'string' && !/Z$/.test(e.date) && !/local/i.test(e.date))
    fail(e.id, 'date is not UTC and is not labelled local: ' + e.date);

  const p = e.prevention || {};
  if (!KINDS.includes(p.kind)) fail(e.id, 'prevention.kind must be one of ' + KINDS.join('/') + ', got: ' + p.kind);
  if (p.kind && p.kind !== 'none' && !p.evidence)
    fail(e.id, 'prevention.kind=' + p.kind + ' with no evidence — a claimed prevention with nothing behind it is the defect this ledger exists to catch');

  /* The carve-out the chat lane asked for: an inside sign-off is not the final word on
     STRUCTURAL specifically. A structural claim asserts the failure is now UNREACHABLE, which is
     the strongest claim available here and the easiest to get wrong from the inside. */
  if (p.kind === 'structural') {
    const v = p.verified_by;
    if (!v) fail(e.id, 'structural claim with no verified_by');
    else if (/PENDING/i.test(v)) console.log('PROVISIONAL  ' + e.id + '  — structural, awaiting non-Claude check: ' + v);
    else if (/claude/i.test(v) && !/non-claude/i.test(v))
      fail(e.id, 'structural verified only by a Claude actor (' + v + ') — the charter requires a non-Claude check before this classification is trusted');
  }

  const d = e.detected_by || {};
  if (!d.actor || !d.engine) fail(e.id, 'detected_by needs both actor and engine — two actors sharing an engine are one oracle, and that cannot be seen without the engine');

  if (!byClass.has(e.class)) byClass.set(e.class, []);
  byClass.get(e.class).push(e);
});

/* supersedes must point at entries that exist, or the correction trail is fiction */
const ids = new Set(entries.map(e => e.id));
for (const e of entries) {
  const sup = e.supersedes ? (Array.isArray(e.supersedes) ? e.supersedes : String(e.supersedes).split(',').map(s => s.trim())) : [];
  for (const s of sup) if (!ids.has(s)) fail(e.id, 'supersedes unknown entry: ' + s);
}

/* THE RECURRENCE RULE. Not advisory — it fails the build. A class that recurred while its prior
   prevention was `convention` is evidence the convention does not hold here. */
console.log('');
for (const [cls, list] of byClass) {
  if (list.length < 2) continue;
  const priors = list.slice(0, -1);
  const weak = priors.filter(e => e.prevention && (e.prevention.kind === 'convention' || e.prevention.kind === 'none'));
  if (weak.length) {
    fail(list[list.length - 1].id,
      'RECURRENCE: class "' + cls + '" has ' + list.length + ' entries and ' + weak.length +
      ' earlier one(s) prevented only by convention/none (' + weak.map(e => e.id).join(', ') +
      '). Escalate to guard or structural, or say plainly why it cannot be.');
  }
  const structuralPriors = priors.filter(e => e.prevention && e.prevention.kind === 'structural');
  if (structuralPriors.length) {
    fail(list[list.length - 1].id,
      'RECURRENCE UNDER A STRUCTURAL PREVENTION: class "' + cls + '" recurred after ' +
      structuralPriors.map(e => e.id).join(', ') + ' claimed the failure was unreachable. ' +
      'The mechanism is wrong, not the discipline — this is the louder alarm.');
  }
}

console.log('');
console.log(entries.length + ' entries, ' + byClass.size + ' classes');
for (const [cls, list] of byClass) {
  const kinds = list.map(e => (e.prevention && e.prevention.kind) || '?');
  const worst = kinds.includes('none') ? 'NOT PREVENTED' :
    kinds.includes('convention') ? 'NOT PREVENTED' :
      kinds.every(k => k === 'structural') ? 'structural' : 'guard only';
  console.log('  ' + String(list.length).padStart(2) + '  ' + worst.padEnd(14) + '  ' + cls);
}

console.log('');
console.log(fails ? 'FAILED — ' + fails + ' violation(s)' : 'ledger consistent (sensitivity only: this says nothing about unlogged classes)');
process.exit(fails ? 1 : 0);
