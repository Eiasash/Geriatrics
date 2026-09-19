/* §3(2), closing step: "make passes < 50 relative rather than a literal, re-run the full set,
 * and report every CAUGHT→MISSED flip that produces — that count is the size of the error we
 * have been carrying."
 *
 * BLOCKED, honestly, before this script existed: `node mutants.mjs` now refuses to run AT ALL
 * — not just the 13 unresolvable mutations, the entire 259-mutation set — because 2(a)'s
 * preflight check is unconditional: it resolves every needle against the baseline before
 * running a single mutation, and 13 of 259 needles are still unresolvable (2(a)'s own finding,
 * not yet fixed — re-pointing them is explicitly deferred, separate work). "Never resolve a
 * verdict by re-running" and "no verdict is not passed" both apply here: the honest state is
 * that a real `node mutants.mjs` full run cannot produce a verdict today, and working around
 * that fact rather than reporting it would be exactly the failure mode this effort exists to
 * close.
 *
 * What this script does instead, without re-running any mutation twice (repetition is not
 * validation; this is not that): for each of the 246 mutations NOT already known-unresolvable,
 * run it ONCE — same subprocess, same captured output mutants.mjs itself would produce — and
 * classify that SAME captured text twice: once under the new relative BROKE threshold (10% of
 * the real baseline), once under the OLD literal-50 threshold classifyMutant() falls back to
 * when no baseline is given. Report every mutation where the two disagree. classifyMutant is a
 * pure function of (name, needle, out, baselinePasses) — calling it twice on one captured `out`
 * is not a second execution of anything, it is reading one piece of evidence two ways.
 *
 * Usage: node broke-threshold-diff.mjs [path-to-index.html]
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import * as acorn from 'acorn';
import { classifyMutant, baselineOk, guardRecords, resolveNeedle } from './mutants-classify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || '../index.html';

const mutantsSrc = fs.readFileSync(path.join(HERE, 'mutants.mjs'), 'utf8');
const ast = acorn.parse(mutantsSrc, { ecmaVersion: 2022, sourceType: 'module' });
let mSpan = null;
for(const node of ast.body){
  if(node.type !== 'VariableDeclaration') continue;
  for(const d of node.declarations) if(d.id && d.id.name === 'M') mSpan = d.init;
}
if(!mSpan) throw new Error('could not find "const M = [...]" in mutants.mjs');
const M = new Function('return ' + mutantsSrc.slice(mSpan.start, mSpan.end))();
console.log('loaded ' + M.length + ' mutations (parsed with acorn)');

const CHILD_ENV = Object.assign({}, process.env);
delete CHILD_ENV.STAGEA_LEDGER;

const src = fs.readFileSync(path.join(HERE, SRC), 'utf8');

/* baseline, same as mutants.mjs's own preflight — must be green before anything below means
   anything */
let baseOut = '', baseStatus = 0;
try{ baseOut = execFileSync('node', ['test.mjs', SRC], { encoding: 'utf8', env: CHILD_ENV }); }
catch(e){ baseOut = (e.stdout || '') + (e.stderr || ''); baseStatus = e.status == null ? 1 : e.status; }
const base = baselineOk(baseOut, baseStatus);
if(!base.ok){ console.log('BASELINE IS NOT GREEN — nothing below can be trusted'); process.exit(1); }
const BASELINE_PASSES = baseOut.split('\n').filter(l => l.startsWith('PASS')).length;
console.log('baseline green: ' + BASELINE_PASSES + ' checks\n');

const baseLabels = guardRecords(baseOut).guards.map(g => g.label);
const runnable = [];
let unresolvableCount = 0;
for(const entry of M){
  const [name, from, to, needle, runner] = entry;
  if(runner === 'audit') continue; // classifyAudit doesn't take a baselinePasses arg; out of scope for this diff
  const r = resolveNeedle(baseLabels, needle);
  if(!r.ok){ unresolvableCount++; continue; }
  runnable.push(entry);
}
console.log(runnable.length + ' runnable mutations (' + unresolvableCount +
  ' unresolvable, skipped — same 13 already reported by --needles, not re-litigated here)\n');

const runSuite = file => new Promise(res => execFile('node', ['test.mjs', file],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: CHILD_ENV }, (err, stdout, stderr) =>
    res((stdout || '') + (stderr || ''))));

const WORKERS = Math.max(1, Math.min(runnable.length, (await import('os')).cpus().length));
const flips = [];
let i = 0, done = 0;
async function worker(){
  while(i < runnable.length){
    const idx = i++;
    const [name, from, to, needle] = runnable[idx];
    const hits = src.split(from).length - 1;
    if(hits !== 1) continue; // STALE/AMBIG — not this diff's concern, --static already covers it
    const tmp = '/tmp/broke-diff-' + process.pid + '-' + idx + '.html';
    fs.writeFileSync(tmp, src.replace(from, to));
    const out = await runSuite(tmp);
    try{ fs.unlinkSync(tmp); }catch(e){}
    const relative = classifyMutant(name, needle, out, BASELINE_PASSES);
    const literal = classifyMutant(name, needle, out); // no baselinePasses -> old fallback floor
    done++;
    if(done % 25 === 0) console.log('  ' + done + '/' + runnable.length);
    const relVerdict = relative.split(/\s+/)[0];
    const litVerdict = literal.split(/\s+/)[0];
    if(relVerdict !== litVerdict){
      flips.push({ name, relative, literal });
      console.log('FLIP  ' + name);
      console.log('  old (literal 50): ' + literal);
      console.log('  new (relative):   ' + relative);
    }
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log('\n' + done + ' mutations classified both ways in ' + Math.round((Date.now() - t0) / 1000) + 's');
console.log(flips.length + ' CAUGHT/MISSED/BROKE verdict flip(s) between the literal-50 rule and the relative rule.');
if(flips.length === 0){
  console.log('Zero, on this tree, today: the relative threshold and the old literal 50 agree on every');
  console.log('mutation that could be run. That does not mean the literal was harmless — it means this');
  console.log('suite\'s current size (' + BASELINE_PASSES + ' checks) keeps 10% close enough to 50 that no');
  console.log('mutation happens to fall in the gap between them RIGHT NOW. The drift the fix closes is');
  console.log('about what happens as the suite grows or shrinks from here, not a defect already caught.');
}
process.exit(0);
