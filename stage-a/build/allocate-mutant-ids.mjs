/* One-time (and re-runnable) allocator for stable mutation IDs in mutants.mjs's `const M = [...]`
 * array — the same fix allocate-guard-ids.mjs already gave test.mjs's ok() calls, applied to
 * the other half of Ruling 4's finding: guard identity was fixed in 2(b); mutation identity
 * was left as "the exact needle text is the identity", which is exactly as fragile as "the
 * exact label text is the identity" was before 2(b) — a needle re-pointed during a refactor
 * (legitimate: the code it targets moved) silently starts a new, untracked identity with no
 * record that it succeeds an old one, and nothing catches a needle that drifted onto the WRONG
 * line and still happens to resolve.
 *
 * Same rules as allocate-guard-ids.mjs, restated for this file:
 *   - allocated ONCE, written into source as an inert token (a trailing {id:'mNNNN'} object
 *     literal on the mutation's own array entry) — read back on every later run, never
 *     re-derived from the entry's current text
 *   - never derived from name/needle/line/array-index — array index in particular is NOT
 *     stable here: this session's own 3(3) work inserted two new entries into the middle of
 *     M, which shifts the index of every entry after them. An index-keyed id would have
 *     silently reassigned dozens of existing mutations' identities on that one edit alone.
 *   - retired ids never reused
 *   - split/merge succession is NOT automatic: this script only tracks presence/absence of an
 *     id token in the file. A human (or a later, explicitly-scoped tool) says "this new entry
 *     succeeds that retired one" if that claim is worth recording; this script does not infer it.
 *
 * Every M entry is normalized to exactly 6 elements: [name, from, to, needle, runner, {id}].
 * The 4-element entries (no runner) get an explicit `undefined` written into the runner slot
 * first — appending the id object directly after a 4th element would land it in the position
 * destructuring code reads as `runner`, the exact argument-slot bug allocate-guard-ids.mjs hit
 * and fixed for test.mjs's 2-argument ok() calls (blank '' padding there; explicit undefined
 * here, since `runner` is read as `runner === 'audit'` / `=== 'browser'`, and undefined is
 * false for both, same as the missing 5th element already was — this changes nothing runtime
 * mutants.mjs does, only what's now explicit in the array shape).
 *
 * Usage: node allocate-mutant-ids.mjs [--write] [--file PATH] [--registry PATH]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argVal = flag => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };
const FILE = argVal('--file') || path.join(HERE, 'mutants.mjs');
const REGISTRY = argVal('--registry') || path.join(HERE, 'mutant-ids.json');
const WRITE = process.argv.includes('--write');

const src = fs.readFileSync(FILE, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module' });
let mNode = null;
for(const node of ast.body){
  if(node.type !== 'VariableDeclaration') continue;
  for(const d of node.declarations) if(d.id && d.id.name === 'M') mNode = d.init;
}
if(!mNode || mNode.type !== 'ArrayExpression') throw new Error('could not find "const M = [...]" as an array literal in ' + FILE);
if(mNode.elements.length < 200) throw new Error('found only ' + mNode.elements.length + ' M entries — refusing to touch the file');

const ID_RE = /^\{\s*id\s*:\s*'([a-z][a-z0-9]*)'\s*\}$/;
const entries = mNode.elements.map(el => {
  if(!el || el.type !== 'ArrayExpression') throw new Error('a top-level M entry is not an array literal — refusing to guess (offset ' + (el && el.start) + ')');
  const els = el.elements;
  if(els.length < 4 || els.length > 6) throw new Error('M entry with ' + els.length + ' elements at offset ' + el.start + ' — expected 4 (no runner/id), 5 (runner, no id) or 6 (runner + id)');
  let existingId = null;
  if(els.length === 6){
    const idText = src.slice(els[5].start, els[5].end);
    const m = ID_RE.exec(idText);
    if(!m) throw new Error('M entry at offset ' + el.start + ' already has a 6th element that is not a bare {id:\'...\'} — refusing to guess: ' + idText.slice(0, 60));
    existingId = m[1];
  }
  const name = els[0].type === 'Literal' ? els[0].value : src.slice(els[0].start, els[0].end);
  const hasRunner = els.length >= 5 && els[4].type !== 'Identifier'; // Identifier 'undefined' means no real runner was written yet
  const runner = hasRunner ? (els[4].type === 'Literal' ? els[4].value : src.slice(els[4].start, els[4].end)) : null;
  return { arrEnd: el.end, lastRealElEnd: els[3].end, hasRunnerSlot: els.length >= 5, runnerEnd: els.length >= 5 ? els[4].end : null,
    hasIdSlot: els.length === 6, name, runner, existingId, line: src.slice(0, el.start).split('\n').length };
});

let registry = { next: 1, mutants: {}, retired: {} };
if(fs.existsSync(REGISTRY)) registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));

const presentIds = new Set(entries.filter(e => e.existingId).map(e => e.existingId));
const retiring = [];
for(const [id, rec] of Object.entries(registry.mutants)){
  if(rec.status === 'active' && !presentIds.has(id)){
    retiring.push(id);
    registry.retired[id] = { ...rec, status: 'retired', retired_reason: 'no longer present in ' + path.basename(FILE), retired_at: new Date().toISOString() };
    delete registry.mutants[id];
  }
}

const toInsert = []; // { arrEnd, needsRunnerPad, id }
let allocated = 0;
for(const e of entries){
  if(e.existingId){
    registry.mutants[e.existingId] = { name: e.name, runner: e.runner, status: 'active' };
    continue;
  }
  const id = 'm' + String(registry.next).padStart(4, '0');
  registry.next++;
  registry.mutants[id] = { name: e.name, runner: e.runner, status: 'active' };
  toInsert.push({ arrEnd: e.arrEnd, lastRealElEnd: e.lastRealElEnd, hasRunnerSlot: e.hasRunnerSlot, id });
  allocated++;
}

console.log(entries.length + ' M entries; ' + presentIds.size + ' already carry an id; ' +
  allocated + ' newly allocated; ' + retiring.length + ' retired' +
  (retiring.length ? ' (' + retiring.join(', ') + ')' : ''));

if(!WRITE){
  console.log('\ndry run — pass --write to apply. Nothing was changed.');
  process.exit(0);
}

/* insert from the end of the file backward so an earlier insertion never shifts a later one's
   recorded offset — same discipline as allocate-guard-ids.mjs */
toInsert.sort((a, b) => b.arrEnd - a.arrEnd);
let out = src;
for(const { arrEnd, lastRealElEnd, hasRunnerSlot, id } of toInsert){
  /* insert just before the array's own closing `]` (arrEnd points past it, so arrEnd - 1 is
     the `]` itself); pad an explicit `undefined` runner slot first when the entry had none,
     so the id object can never be misread as the runner by [name,from,to,needle,runner]
     destructuring elsewhere in mutants.mjs */
  const insertion = (hasRunnerSlot ? '' : ", undefined") + ", {id:'" + id + "'}";
  out = out.slice(0, arrEnd - 1) + insertion + out.slice(arrEnd - 1);
}
fs.writeFileSync(FILE, out, 'utf8');
fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n', 'utf8');
console.log('wrote ' + FILE + ' and ' + REGISTRY);
