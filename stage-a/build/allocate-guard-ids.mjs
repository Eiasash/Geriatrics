/* One-time (and re-runnable) allocator for stable guard IDs in test.mjs.
 *
 * Rules from the instruction set, restated as code:
 *   - allocated ONCE, written into source as inert tokens
 *   - never derived from name/path/line, never recomputed from position
 *   - retired IDs never reused
 *   - on split/merge the old ID retires with history frozen, the successor starts fresh
 *     (a successor is just a normal new allocation — nothing automatic infers "this is a
 *     split of that", a human says so if it matters; this script only tracks presence/absence)
 *
 * Usage: node allocate-guard-ids.mjs [--write] [--file PATH] [--registry PATH]
 *   without --write: dry run, reports what WOULD happen, touches nothing
 *   with --write: rewrites the target file (inserting `, {id:'gNNNN'}` on every ok() call
 *     that doesn't have one yet) and the registry JSON
 *   --file/--registry: default to test.mjs and guard-ids.json next to this script; override
 *     to run against a scratch copy — this is how harness-selftest.mjs exercises retirement
 *     and re-allocation without ever touching the real files
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argVal = flag => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };
const FILE = argVal('--file') || path.join(HERE, 'test.mjs');
const REGISTRY = argVal('--registry') || path.join(HERE, 'guard-ids.json');
const WRITE = process.argv.includes('--write');

/* the EXACT tokenizer from test.mjs's own tautology scanner (line ~4278), copied byte for
   byte rather than reconstructed from memory — a from-memory rewrite of this dropped the
   the two comment-stripping branches on the first attempt and silently mis-blanked over
   half the file's
   ok() calls into invisibility. Never hand-retype this; if test.mjs's copy changes,
   re-extract it here the same way, and the call-count sanity check below is what catches
   drift if that step is skipped. */
function blankLiterals(src){
  const out = src.split('');
  const blank = (a, b) => { for(let i = a; i < b && i < out.length; i++) if(out[i] !== '\n') out[i] = ' '; };
  const KW = /(?:^|[^\w$])(?:return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/;
  let i = 0;
  while(i < src.length){
    const c = src[i], c2 = src[i + 1];
    if(c === '/' && c2 === '/'){ let j = src.indexOf('\n', i); if(j < 0) j = src.length; blank(i, j); i = j; continue; }
    if(c === '/' && c2 === '*'){ let j = src.indexOf('*/', i + 2); j = j < 0 ? src.length : j + 2; blank(i, j); i = j; continue; }
    if(c === "'" || c === '"'){
      let j = i + 1; while(j < src.length && src[j] !== c){ if(src[j] === '\\') j++; j++; }
      blank(i, j + 1); i = j + 1; continue;
    }
    if(c === '`'){
      let j = i + 1, depth = 0;
      while(j < src.length){
        if(src[j] === '\\'){ j += 2; continue; }
        if(src[j] === '$' && src[j + 1] === '{'){ depth++; j += 2; continue; }
        if(depth > 0 && src[j] === '}'){ depth--; j++; continue; }
        if(depth === 0 && src[j] === '`') break;
        j++;
      }
      blank(i, j + 1); i = j + 1; continue;
    }
    if(c === '/'){
      const before = out.slice(Math.max(0, i - 16), i).join('').replace(/\s+$/, '');
      if(before === '' || /[(,=:[!&|?{};+\-*%~^]$/.test(before) || KW.test(before)){
        let j = i + 1, inClass = false;
        while(j < src.length && src[j] !== '\n'){
          if(src[j] === '\\'){ j += 2; continue; }
          if(src[j] === '[') inClass = true;
          else if(src[j] === ']') inClass = false;
          else if(src[j] === '/' && !inClass) break;
          j++;
        }
        blank(i, j + 1); i = j + 1; continue;
      }
    }
    i++;
  }
  return out.join('');
}

function findCalls(src){
  const bl = blankLiterals(src);
  const re = /(^|[^\w$.])ok\(/g;
  let m; const calls = [];
  while((m = re.exec(bl))){
    const open = m.index + m[0].length - 1;
    let depth = 0, close = -1;
    for(let j = open; j < bl.length; j++){
      if(bl[j] === '(') depth++;
      else if(bl[j] === ')'){ depth--; if(depth === 0){ close = j; break; } }
    }
    if(close < 0) continue;
    const cuts = [open + 1]; let d = 0;
    for(let k = open + 1; k < close; k++){
      const ch = bl[k];
      if(ch === '(' || ch === '[' || ch === '{') d++;
      else if(ch === ')' || ch === ']' || ch === '}') d--;
      else if(ch === ',' && d === 0) cuts.push(k + 1);
    }
    calls.push({ open, close, cuts, line: src.slice(0, open).split('\n').length });
  }
  return calls;
}

const src = fs.readFileSync(FILE, 'utf8');
const calls = findCalls(src);

/* the ok() call whose SECOND argument (the predicate slot) is a bare quoted string is the
   definition site's default, i.e. never true here — real definition line is `const ok = (` and
   doesn't match `ok\(` at all (space + '=' in between), so no special-casing needed; verified
   by requiring calls.length to be in the range this file has always had */
if(calls.length < 600) throw new Error('found only ' + calls.length + ' ok( calls — the tokenizer likely broke; refusing to touch the file');

const ID_RE = /^\{\s*id\s*:\s*'([a-z][a-z0-9]*)'\s*\}$/;
const parsed = calls.map(c => {
  const label = src.slice(c.cuts[0], (c.cuts[1] || c.close) - 1).trim();
  let existingId = null;
  if(c.cuts.length >= 4){
    const arg4 = src.slice(c.cuts[3], c.close).trim();
    const m = ID_RE.exec(arg4);
    if(m) existingId = m[1];
    else throw new Error('line ' + c.line + ': ok() already has a 4th argument that is not a bare {id:\'...\'} — refusing to guess: ' + arg4.slice(0, 60));
  }
  return { ...c, label, existingId };
});

let registry = { next: 1, guards: {}, retired: {} };
if(fs.existsSync(REGISTRY)) registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));

/* retire first: any id the registry knows as active but that no longer appears in the file
   at all. History is frozen — we keep its last-known label and the retirement reason, never
   delete the record, never hand the id back out. */
const presentIds = new Set(parsed.filter(p => p.existingId).map(p => p.existingId));
const retiring = [];
for(const [id, rec] of Object.entries(registry.guards)){
  if(rec.status === 'active' && !presentIds.has(id)){
    retiring.push(id);
    registry.retired[id] = { ...rec, status: 'retired', retired_reason: 'no longer present in test.mjs', retired_at: new Date().toISOString() };
    delete registry.guards[id];
  }
}

/* then allocate: every call with no existing id gets the next never-before-used token,
   sequential by allocation order — order is bookkeeping, not a derivation from the label,
   the file path or the line number, none of which ever appear inside the token itself */
const toInsert = []; // { close, id }
let allocated = 0;
for(const p of parsed){
  if(p.existingId){
    registry.guards[p.existingId] = { label: p.label, file: 'test.mjs', status: 'active' };
    continue;
  }
  const id = 'g' + String(registry.next).padStart(4, '0');
  registry.next++;
  registry.guards[id] = { label: p.label, file: 'test.mjs', status: 'active' };
  toInsert.push({ close: p.close, id, argCount: p.cuts.length });
  allocated++;
}

console.log(parsed.length + ' ok() calls; ' + presentIds.size + ' already carry an id; ' +
  allocated + ' newly allocated; ' + retiring.length + ' retired' +
  (retiring.length ? ' (' + retiring.join(', ') + ')' : ''));

if(!WRITE){
  console.log('\ndry run — pass --write to apply. Nothing was changed.');
  process.exit(0);
}

/* insert from the end of the file backward so earlier insertions never shift a later one's
   recorded offset. The id must land in the 4th positional slot (`meta`), not wherever the
   next comma happens to fall — a 2-argument call (label, cond only, no `extra`) needs an
   explicit '' padded into the extra slot first, or the id object lands in `extra` instead
   and gets string-concatenated into every FAIL line as "[object Object]" while `meta` stays
   undefined and the id is silently lost. Caught by running the real suite after --write and
   grepping its own output for that string, below. */
toInsert.sort((a, b) => b.close - a.close);
let out = src;
for(const { close, id, argCount } of toInsert){
  const insertion = argCount === 2 ? ", '', {id:'" + id + "'}" : ", {id:'" + id + "'}";
  out = out.slice(0, close) + insertion + out.slice(close);
}
fs.writeFileSync(FILE, out, 'utf8');
fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n', 'utf8');
console.log('wrote ' + FILE + ' and ' + REGISTRY);
