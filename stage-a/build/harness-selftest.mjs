/* Tests the test HARNESS itself — test.mjs's own exit/error contract, and mutants.mjs's own
   verdict logic — rather than the app. Kept out of test.mjs on purpose: mutants.mjs re-runs
   test.mjs once per mutation (219+ times), so anything that spawns a full child test.mjs run
   cannot live inside test.mjs without multiplying CI time by that count. This file runs once.

   ChatGPT third-model audit of main ee44f96 found three ways the runner/mutation-runner could
   report success over evidence of failure:
   (1) test.mjs captured window errors and console.error calls into `errs` but never let them
       affect FAILS or the exit code.
   (2) mutants.mjs's per-mutation verdict checked a FAIL-line match before checking whether the
       child ever reached DONE, so a child that printed a coincidentally-matching FAIL and then
       died was credited CAUGHT instead of INCOMPLETE.
   (3) mutants.mjs's baseline check read only printed text (FAIL lines, "DONE"), discarding the
       child's actual exit status — a baseline that exited non-zero while printing clean text
       was announced "baseline green".

   node harness-selftest.mjs
*/
import { execFileSync } from 'child_process';
import fs from 'fs';
import { classifyMutant, baselineOk } from './mutants-classify.mjs';

let FAILS = 0;
const ok = (label, cond, extra = '') => { if (!cond) FAILS++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  — ' + extra : '')); };

/* ---- (1) test.mjs must fail when it captures an unexpected runtime error ---- */
{
  const src = fs.readFileSync('../index.html', 'utf8');
  ok('fixture precondition: ../index.html has a closing </body> to inject the fixture before',
     src.includes('</body>'));
  const injected = src.replace('</body>',
    '<script>setTimeout(()=>{ throw new Error("HARNESS_SELFTEST_INJECTED_ERROR"); }, 0);</script></body>');
  const tmp = '/tmp/harness-selftest-injected-error-' + process.pid + '.html';
  fs.writeFileSync(tmp, injected);
  let status = 0, out = '';
  try { out = execFileSync('node', ['test.mjs', tmp], { encoding: 'utf8' }); status = 0; }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); status = e.status == null ? 1 : e.status; }
  try { fs.unlinkSync(tmp); } catch (e) {}
  const mentionsInjected = /errors captured: [1-9]/.test(out) && out.includes('HARNESS_SELFTEST_INJECTED_ERROR');
  ok('test.mjs exits non-zero when it captures an unexpected runtime error, even with a full PASS run otherwise',
     status !== 0 && mentionsInjected, 'status=' + status + ' mentionsInjected=' + mentionsInjected);
}

/* ---- (2) a child that dies before DONE must never be CAUGHT, matching FAIL or not ---- */
{
  const cannedDiesAfterMatch = 'PASS  x\nFAIL  needle-match here\n';   // no DONE — died mid-run
  const v1 = classifyMutant('t', 'needle-match', cannedDiesAfterMatch);
  ok('a matching FAIL with no DONE is classified INCOMPLETE, not CAUGHT',
     v1.startsWith('INCOMPLETE'), v1);
}
{
  const cannedCompletesWithMatch = 'PASS  x\n'.repeat(60) + 'FAIL  needle-match here\nDONE\n';
  const v2 = classifyMutant('t', 'needle-match', cannedCompletesWithMatch);
  ok('a matching FAIL that DOES reach DONE (past the parse-broke floor) is still classified CAUGHT',
     v2.startsWith('CAUGHT'), v2);
}
{
  const cannedNoMatchButDone = 'PASS  x\n'.repeat(60) + 'DONE\n';
  const v3 = classifyMutant('t', 'needle-match', cannedNoMatchButDone);
  ok('a completed run with no matching FAIL is classified MISSED',
     v3.startsWith('MISSED'), v3);
}

/* ---- (3) a non-zero exit status must sink the baseline, clean text or not ---- */
{
  const r1 = baselineOk('PASS  a\nDONE\n', 1);
  ok('a baseline that prints DONE and no FAIL lines but exits non-zero is NOT reported green',
     r1.ok === false, JSON.stringify(r1));
}
{
  const r2 = baselineOk('PASS  a\nDONE\n', 0);
  ok('a clean baseline (DONE, no FAIL lines, exit 0) IS reported green',
     r2.ok === true, JSON.stringify(r2));
}
{
  const r3 = baselineOk('PASS  a\nFAIL  b\nDONE\n', 0);
  ok('a baseline with a FAIL line is NOT reported green even with a clean exit status',
     r3.ok === false, JSON.stringify(r3));
}

console.log('\n' + FAILS + ' failing harness self-test(s)');
console.log('DONE');
process.exit(FAILS ? 1 : 0);
