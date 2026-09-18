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

/* ---- (1a) the unexpected-runtime-error verdict must sit after every other block in test.mjs,
   in source order — deterministic companion to the timing-based (1b) below, since (1b)'s
   absolute delay can't be guaranteed to land inside the gap on every machine (a slow enough
   sandbox can make even a 2s injected error fire before ANY check in the file runs, which
   would make the timing test pass regardless of where the check sits) ---- */
{
  const src = fs.readFileSync('test.mjs', 'utf8');
  const verdictIdx = src.indexOf("ok('no unexpected runtime errors were captured during the run'");
  ok('the unexpected-runtime-error verdict exists in test.mjs', verdictIdx >= 0);
  /* comments unique to blocks that run after the old (pre round-4) check position — sw.js
     fetch-handler tests, the mockrun-backup-restore test, paintLastMock, and both cold-start
     hash-vs-tab-race tests */
  const laterBlockMarkers = [
    "sw.js's fetch handler returned any RESOLVED response",
    'geri:mockrun (RUNKEY) missing from BKEYS',
    'paintLastMock() wrote v.right/v.n/v.when from storage',
    'the async IIFE reading geri:tab called show(r.value)',
  ];
  const positions = laterBlockMarkers.map(m => src.indexOf(m));
  ok('all four later-block markers are present in test.mjs (fixture precondition)',
     positions.every(p => p >= 0), JSON.stringify(positions));
  ok('the unexpected-runtime-error verdict comes after every one of those later blocks, not before them',
     verdictIdx >= 0 && positions.every(p => p >= 0 && verdictIdx > p),
     'verdictIdx=' + verdictIdx + ' positions=' + JSON.stringify(positions));
}

/* ---- (1b) an error that fires LATE — after every earlier block but before the file ends —
   must still fail the run. Round 4 of the same audit found the check itself was still sitting
   mid-file: everything below it (several more test blocks, some of which await real timers)
   kept running afterward, and an error on the original window fired during one of those later
   awaits was captured into `errs` but never read again before the exit code was decided. The
   check now runs once, last, after every other block in the file. This fixture times the
   throw to land well after where the old mid-file position used to read `errs`. ---- */
{
  const src = fs.readFileSync('../index.html', 'utf8');
  const injectedLate = src.replace('</body>',
    '<script>setTimeout(()=>{ throw new Error("HARNESS_SELFTEST_LATE_INJECTED_ERROR"); }, 2000);</script></body>');
  const tmp = '/tmp/harness-selftest-late-injected-error-' + process.pid + '.html';
  fs.writeFileSync(tmp, injectedLate);
  let status = 0, out = '';
  try { out = execFileSync('node', ['test.mjs', tmp], { encoding: 'utf8' }); status = 0; }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); status = e.status == null ? 1 : e.status; }
  try { fs.unlinkSync(tmp); } catch (e) {}
  const reachedDone = out.split('\n').some(l => l === 'DONE');
  const mentionsLate = out.includes('HARNESS_SELFTEST_LATE_INJECTED_ERROR');
  ok('an error that fires late (after every earlier block, before the file ends) still fails the run, not just an early one',
     status !== 0 && reachedDone && mentionsLate, 'status=' + status + ' reachedDone=' + reachedDone + ' mentionsLate=' + mentionsLate);
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
{
  /* ChatGPT third-model audit round 4: startsWith('DONE') also matches a line that only
     begins the same way, like "DONE_WITH_ERRORS" — a child that never printed a bare DONE
     would still be credited complete */
  const cannedFakeDone = 'PASS  x\n'.repeat(60) + 'FAIL  needle-match here\nDONE_WITH_ERRORS\n';
  const v4 = classifyMutant('t', 'needle-match', cannedFakeDone);
  ok('a line that only starts with "DONE" (not an exact "DONE" line) does not count as reaching DONE',
     v4.startsWith('INCOMPLETE'), v4);
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
{
  /* ChatGPT third-model audit round 4: /DONE/.test(out) matches the substring anywhere,
     including inside "NOT_DONE" — a baseline that printed that and exited 0 was accepted
     as green */
  const r4 = baselineOk('PASS  a\nNOT_DONE\n', 0);
  ok('a baseline that never prints an exact "DONE" line is not reported green, even if some line contains the substring "DONE"',
     r4.ok === false, JSON.stringify(r4));
}

/* ---- (4) a secondary window's error must be caught too, not only the primary's ---- */
{
  /* ChatGPT third-model audit round 5: only the primary JSDOM's beforeParse wired
     w.addEventListener('error', ...) into `errs` — every secondary window test.mjs spins up
     (a restored mock, a different viewport, the #falls hash-vs-tab race, ...) wired pinClock
     and storage but not this, so a page-script exception inside any of them was invisible to
     the final verdict: the suite could finish PASS/PASS/.../DONE/exit 0 with a real error
     sitting unrecorded. wireErrs(w2) now runs in every window's beforeParse, primary and
     secondary alike.

     This fixture throws only inside a window loaded at the #falls hash — unique, in this
     file, to the "a deep-link hash (#falls) wins over a saved tab" secondary window — so a
     pass here specifically proves THAT window's error reaches the verdict, not just the
     primary's. */
  const src = fs.readFileSync('../index.html', 'utf8');
  const injectedFalls = src.replace('</body>',
    '<script>if(location.hash === "#falls"){ setTimeout(()=>{ throw new Error("HARNESS_SELFTEST_FALLS_WINDOW_ERROR"); }, 50); }</script></body>');
  const tmp = '/tmp/harness-selftest-falls-window-error-' + process.pid + '.html';
  fs.writeFileSync(tmp, injectedFalls);
  let status = 0, out = '';
  try { out = execFileSync('node', ['test.mjs', tmp], { encoding: 'utf8' }); status = 0; }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); status = e.status == null ? 1 : e.status; }
  try { fs.unlinkSync(tmp); } catch (e) {}
  const reachedDone = out.split('\n').some(l => l === 'DONE');
  const mentionsFalls = out.includes('HARNESS_SELFTEST_FALLS_WINDOW_ERROR');
  ok('an error inside the #falls secondary window fails the run, not just an error on the primary window',
     status !== 0 && reachedDone && mentionsFalls, 'status=' + status + ' reachedDone=' + reachedDone + ' mentionsFalls=' + mentionsFalls);
}
{
  /* Codex review of #457: the naive count matched the helper's OWN declaration line
     ("function wireErrs(w2){" contains the substring "wireErrs(w2)"), inflating every real
     count by one — so the ">= 9" floor still passed after removing a real call site from any
     secondary window other than the one #falls behaviorally exercises. Exclude the declaration
     line explicitly, and compare against the actual number of `new JSDOM(` constructions
     (the real, unambiguous count of windows that need wiring) rather than a hardcoded floor. */
  const src = fs.readFileSync('test.mjs', 'utf8');
  const helperIdx = src.indexOf('function wireErrs(w2){');
  ok('the wireErrs helper is defined in test.mjs', helperIdx >= 0);
  const declLine = src.slice(0, src.indexOf('\n', helperIdx));
  const bodySrc = src.replace(declLine, '');
  const callSites = (bodySrc.match(/wireErrs\(w[23]?\)/g) || []).length;
  const domConstructions = (src.match(/new JSDOM\(/g) || []).length;
  ok('wireErrs is called from every window construction in test.mjs, not just the primary one',
     domConstructions >= 2 && callSites === domConstructions,
     callSites + ' call sites vs ' + domConstructions + ' new JSDOM(...) constructions');
}

console.log('\n' + FAILS + ' failing harness self-test(s)');
console.log('DONE');
process.exit(FAILS ? 1 : 0);
