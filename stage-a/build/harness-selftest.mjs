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
import path from 'path';
import { classifyMutant, baselineOk, guardRecords, resolveNeedle, failLabels } from './mutants-classify.mjs';

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

/* ---- (4) certification by guard identity, not by substring ----

   Each case here is a way the old substring certifier produced a confident verdict it had no
   right to. They are written against canned child output so they need no subprocess. */
{
  const G = (label, verdict, threw) => '##GUARD ' + JSON.stringify({ id: null, label, verdict, threw: threw || null });
  const RUN = '##RUN {"completed":true}';
  const body = lines => lines.join('\n') + '\nDONE\n' + Array(60).fill('PASS x').join('\n');

  /* the defect that motivated all of this: the needle names guard A, guard B failed, and B's
     label happens to contain the needle. The old certifier said CAUGHT. */
  const twoLabels = body([
    'FAIL  the chapter-top meta line meets 44px tap targets with 12px gaps',
    G('both jump buttons keep a 44px tap target', 'pass'),
    G('the chapter-top meta line meets 44px tap targets with 12px gaps', 'fail'), RUN]);
  ok('a needle matching two different guard labels yields NO verdict, rather than crediting whichever one failed',
     classifyMutant('m', '44px tap target', twoLabels).startsWith('UNCERTIFIABLE'),
     classifyMutant('m', '44px tap target', twoLabels).slice(0, 80));

  /* the same defect from the other side: the needle names nothing, so the mutation can only
     ever report MISSED — which reads as "the suite is blind here" when the truth is "this
     witness was never wired up" */
  const deadNeedle = body([
    'FAIL  some guard that did fire',
    G('some guard that did fire', 'fail'), RUN]);
  ok('a needle that names no guard at all yields NO verdict, rather than a MISSED that reads as a blind suite',
     classifyMutant('m', 'a label nobody wrote', deadNeedle).startsWith('UNCERTIFIABLE'),
     classifyMutant('m', 'a label nobody wrote', deadNeedle).slice(0, 80));

  /* and the case it must still get right */
  const clean = body(['FAIL  the guard fired', G('the guard fired', 'fail'), RUN]);
  ok('a needle naming exactly one guard, which failed, is CAUGHT',
     classifyMutant('m', 'the guard fired', clean) === 'CAUGHT m');
  const notFired = body(['PASS  the guard fired', G('the guard fired', 'pass'), RUN]);
  ok('a needle naming exactly one guard, which passed, is MISSED',
     classifyMutant('m', 'the guard fired', notFired) === 'MISSED m');

  /* ---- weak-witness: a guard that failed by THROWING is not a witness for its own label ----
     R7 requirement 2 ("wrong oracle"), from the review-lane ruling on #469. test.mjs's ok()
     counts a thrown predicate as a failure so one crashed selector never kills the other 600
     checks — correct for the SUITE. For a MUTATION verdict it proves only that a selector threw
     (the element it reaches for is gone), never that the labelled BEHAVIOUR broke; crediting it
     CAUGHT certifies a claim the check never actually evaluated. */
  const threwOnly = body([
    'FAIL  the guard fired',
    G('the guard fired', 'fail', "Cannot read properties of null (reading 'style')"), RUN]);
  ok('a guard whose only failing record threw is WEAK-WITNESS, not CAUGHT',
     classifyMutant('m', 'the guard fired', threwOnly).startsWith('WEAK-WITNESS m'),
     classifyMutant('m', 'the guard fired', threwOnly).slice(0, 80));

  /* and the case it must still get right: a real evaluated failure (threw: null) is still
     CAUGHT — this is a NEW class of verdict for a NEW kind of evidence, not a general
     downgrade of every failure */
  const evaluatedFail = body(['FAIL  the guard fired', G('the guard fired', 'fail', null), RUN]);
  ok('a guard that failed by evaluating false (no throw) is still plain CAUGHT',
     classifyMutant('m', 'the guard fired', evaluatedFail) === 'CAUGHT m');

  /* a label that fires more than once (e.g. inside a loop) never actually reaches the
     threw-check above with more than one record to look at: resolveNeedle already refuses
     TWO records sharing the exact label ("two guards share this exact label") before
     classifyMutant gets this far, and its unique-substring path counts occurrences the same
     way. Checked directly here rather than assumed, since that's the premise the weak-witness
     logic above relies on to treat a single `failed` record as the whole story. */
  const twoFires = body([
    'FAIL  the guard fired',
    'FAIL  the guard fired',
    G('the guard fired', 'fail', 'boom'),
    G('the guard fired', 'fail', null), RUN]);
  ok('a label that fired twice is UNCERTIFIABLE before the weak-witness check ever runs, not CAUGHT via one of the two records',
     classifyMutant('m', 'the guard fired', twoFires).startsWith('UNCERTIFIABLE'),
     classifyMutant('m', 'the guard fired', twoFires).slice(0, 60));

  /* completion and consistency still outrank this: a thrown-only failure paired with no DONE,
     or with a contradicted exit code, reports THAT problem, not WEAK-WITNESS — both are more
     fundamental claims about whether the run itself can be trusted at all */
  const threwNoDone = ['FAIL  the guard fired', G('the guard fired', 'fail', 'boom')].join('\n');
  ok('a thrown-only failure with no DONE line is still INCOMPLETE, not WEAK-WITNESS',
     classifyMutant('m', 'the guard fired', threwNoDone).startsWith('INCOMPLETE'));
  const threwInconsistent = body(['FAIL  the guard fired', G('the guard fired', 'fail', 'boom'),
    '##RUN {"completed":true,"failures":0}']);
  ok('a thrown-only failure whose ##RUN record disagrees with its exit code is still INCONSISTENT, not WEAK-WITNESS',
     classifyMutant('m', 'the guard fired', threwInconsistent, undefined, 1).startsWith('INCONSISTENT'));

  /* identity is membership in the FAILING set, not presence in the output. A guard that
     passed while an unrelated one failed must not be credited. */
  const otherFailed = body([
    'FAIL  an unrelated guard',
    G('an unrelated guard', 'fail'), G('the guard fired', 'pass'), RUN]);
  ok('a guard that PASSED is not credited because some other guard failed in the same run',
     classifyMutant('m', 'the guard fired', otherFailed) === 'MISSED m');

  /* completion still outranks everything: no DONE is no verdict */
  const noDone = ['FAIL  the guard fired', G('the guard fired', 'fail')].join('\n');
  ok('a run that never reached DONE is INCOMPLETE even when the named guard is in the failing set',
     classifyMutant('m', 'the guard fired', noDone).startsWith('INCOMPLETE'));

  /* a malformed record is surfaced, never silently dropped */
  const rec = guardRecords('##GUARD {not json\n' + G('a', 'pass') + '\n' + RUN);
  ok('a malformed guard record is reported rather than skipped',
     rec.bad.length === 1 && rec.guards.length === 1 && rec.run && rec.run.completed === true,
     rec.bad.length + ' bad, ' + rec.guards.length + ' good');

  /* ---- BROKE threshold is relative to the baseline, not a literal pinned to one day's
     check count ---- */
  {
    const bodyN = (lines, n) => lines.join('\n') + '\nDONE\n' + Array(n).fill('PASS x').join('\n');
    /* none of the fixed lines above (FAIL, ##GUARD, ##RUN) start with 'PASS', so the filler
       count IS the total passes count classifyMutant will read — no off-by-N to track */
    const caughtOut = n => bodyN(['FAIL  the guard fired', G('the guard fired', 'fail'), RUN], n);

    /* a small suite (100 baseline checks): a mutation that still completed 30% of them and
       caught the guard is a legitimate catch. The OLD literal-50 rule would have called this
       BROKE (30 < 50) and thrown away a real result — exactly the drift the instruction set
       named: a threshold anchored to nothing means something different at every suite size. */
    const smallSuiteCatch = caughtOut(30);
    ok('a mutation reaching 30% of a 100-check baseline and catching its guard is CAUGHT, not BROKE (the old literal-50 rule would have discarded this)',
       classifyMutant('m', 'the guard fired', smallSuiteCatch, 100) === 'CAUGHT m',
       classifyMutant('m', 'the guard fired', smallSuiteCatch, 100));

    /* the reverse and more consequential direction: a large suite (1000 baseline checks)
       where a mutation dies after only 60 — 6% of the way through. The OLD literal-50 rule
       (60 > 50) would have called this a normal result and credited whatever FAIL line
       happened to be sitting in that truncated output as a real CAUGHT — silently trusting
       parse wreckage. The new rule (60 < 100 = 10% of 1000) correctly calls it BROKE. */
    const largeSuiteBreak = caughtOut(60);
    ok('a mutation dying after 6% of a 1000-check baseline is BROKE, not credited as CAUGHT (the old literal-50 rule would have trusted this)',
       classifyMutant('m', 'the guard fired', largeSuiteBreak, 1000).startsWith('BROKE'),
       classifyMutant('m', 'the guard fired', largeSuiteBreak, 1000));

    /* no baseline supplied at all (a caller like this file's OWN fixtures above, which have no
       real child process to measure): falls back to the old literal 50, not to zero or
       Infinity — a missing baseline must not silently disable the guard against parse
       wreckage, nor silently resurrect the exact drift this item exists to remove */
    ok('with no baseline argument, the fallback floor is the old literal 50, not disabled and not zero',
       classifyMutant('m', 'the guard fired', caughtOut(30)).startsWith('BROKE') &&
       classifyMutant('m', 'the guard fired', caughtOut(60)) === 'CAUGHT m');
  }

  /* the resolver itself */
  ok('resolveNeedle prefers an exact label over a longer one that contains it',
     resolveNeedle(['text size applies', 'text size applies before the first paint'], 'text size applies').how === 'exact');
  ok('resolveNeedle refuses when two labels contain the needle and neither is exact',
     resolveNeedle(['a text size row', 'another text size row'], 'text size').ok === false);

  /* ---- the substring-fallback path (no ##GUARD records at all) is bounded to the LABEL,
     not the whole FAIL line ---- */
  {
    ok('failLabels bounds each FAIL line to its label, stopping at the  — separator',
       JSON.stringify(failLabels(['FAIL  something unrelated  — the detail mentions catchme by accident', 'PASS  x', 'FAIL  no detail here'])) ===
       JSON.stringify(['something unrelated', 'no detail here']));

    /* the exact gap this closes: a needle that only appears in the EXTRA detail text (after
       the separator) used to credit the mutation via a whole-line substring match, even
       though the FAIL line's own label never named it */
    const noGuards = 'FAIL  something unrelated  — the detail mentions catchme by accident\nDONE\n' +
      Array(60).fill('PASS x').join('\n');
    ok('the substring fallback does not credit a needle that only appears in a FAIL line’s extra detail text, past the separator',
       classifyMutant('m', 'catchme', noGuards).startsWith('MISSED'),
       classifyMutant('m', 'catchme', noGuards));
    ok('the substring fallback still credits a needle that is genuinely inside the label',
       classifyMutant('m', 'unrelated', noGuards).startsWith('CAUGHT'),
       classifyMutant('m', 'unrelated', noGuards));
  }

  /* ---- exit status, once actually captured, is cross-checked against the ##RUN record's own
     failure count — the gap named in Eias's review: the mutation subprocess wrapper used to
     discard it entirely on the test.mjs path (fixed alongside this check) ---- */
  {
    const cleanRun = body([G('the guard fired', 'pass'),
      '##RUN ' + JSON.stringify({ completed: true, checks: 60, failures: 0 })]);
    ok('a clean ##RUN record (0 failures) paired with a clean exit (0) is not flagged — the ordinary case',
       !classifyMutant('m', 'the guard fired', cleanRun, undefined, 0).startsWith('INCONSISTENT'));

    /* the exact scenario this exists for: every check the ##RUN record knows about passed,
       but the process exited 1 anyway — test.mjs's own unhandledRejection handler does exactly
       this, setting process.exitCode without ever touching the FAILS variable ##RUN reports */
    ok('a clean ##RUN record (0 failures) paired with a non-zero exit is INCONSISTENT, not silently trusted',
       classifyMutant('m', 'the guard fired', cleanRun, undefined, 1).startsWith('INCONSISTENT'),
       classifyMutant('m', 'the guard fired', cleanRun, undefined, 1));

    const failedRun = body(['FAIL  the guard fired', G('the guard fired', 'fail'),
      '##RUN ' + JSON.stringify({ completed: true, checks: 60, failures: 1 })]);
    ok('a ##RUN record reporting 1 failure paired with exit 1 is consistent — still CAUGHT, not flagged',
       classifyMutant('m', 'the guard fired', failedRun, undefined, 1) === 'CAUGHT m');
    ok('a ##RUN record reporting 1 failure paired with exit 0 IS flagged — the exit code contradicts the record',
       classifyMutant('m', 'the guard fired', failedRun, undefined, 0).startsWith('INCONSISTENT'));

    /* no exit status captured at all (every OTHER fixture in this file, and any caller that
       predates this) must be completely unaffected — the check is opt-in on real evidence */
    ok('with no exitStatus argument at all, nothing here changes: the plain ##RUN case above still just works',
       classifyMutant('m', 'the guard fired', failedRun) === 'CAUGHT m');
  }
}

/* ---- (5) allocate-guard-ids.mjs: retirement is real, and an id is never handed back out ----

   Runs the actual allocator (not a re-implementation of its logic) against a throwaway copy
   of test.mjs in os.tmpdir(), because the property under test — a freed id staying freed
   across a retire-then-allocate cycle — only means something if it survives the real
   insert/retire code path, not a mock of it. */
{
  const os = await import('os');
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-id-selftest-'));
  const scratchFile = path.join(scratchDir, 'test.mjs');
  const scratchRegistry = path.join(scratchDir, 'guard-ids.json');
  const run = (...args) => execFileSync('node', ['allocate-guard-ids.mjs', ...args], { encoding: 'utf8' });
  try{
    fs.copyFileSync('test.mjs', scratchFile);
    const common = ['--file', scratchFile, '--registry', scratchRegistry];

    run('--write', ...common);
    const before = JSON.parse(fs.readFileSync(scratchRegistry, 'utf8'));
    ok('a fresh allocation pass gives every ok() call an id and starts the counter at 1',
       Object.keys(before.guards).length >= 600 && before.guards.g0001, 'guards: ' + Object.keys(before.guards).length);

    run(...common);
    const unchanged = JSON.parse(fs.readFileSync(scratchRegistry, 'utf8'));
    ok('re-running with no source changes allocates nothing and retires nothing',
       unchanged.next === before.next && Object.keys(unchanged.retired).length === 0);

    /* delete the ok() call that owns g0002 ('week section exists') and re-run */
    const src = fs.readFileSync(scratchFile, 'utf8');
    const line = "ok('week section exists', !!d.getElementById('week'), '', {id:'g0002'});\n";
    if(src.includes(line)){
      fs.writeFileSync(scratchFile, src.replace(line, ''), 'utf8');
      run('--write', ...common);
      const afterRetire = JSON.parse(fs.readFileSync(scratchRegistry, 'utf8'));
      ok('deleting a call retires its id, with the label frozen, rather than deleting the record',
         !afterRetire.guards.g0002 && afterRetire.retired.g0002 && afterRetire.retired.g0002.label.includes('week section exists'));

      /* now add a brand-new check and confirm the retired slot is never reissued */
      const src2 = fs.readFileSync(scratchFile, 'utf8');
      const doneLine = 'console.log("DONE");';
      fs.writeFileSync(scratchFile, src2.replace(doneLine,
        "ok('scratch: a brand-new check added after a retirement', true);\n" + doneLine), 'utf8');
      run('--write', ...common);
      const afterNew = JSON.parse(fs.readFileSync(scratchRegistry, 'utf8'));
      const newId = afterNew.next - 1;
      ok('a new check after a retirement gets the next never-used id, not the one just freed',
         !afterNew.guards.g0002 && afterNew.retired.g0002.status === 'retired' &&
         afterNew.guards['g' + String(newId).padStart(4, '0')]);
    } else {
      ok('the retirement fixture line still exists in test.mjs (update this test if it moved)', false,
         'expected line not found — allocate-guard-ids.mjs itself is unverified by this run');
    }
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

console.log('\n' + FAILS + ' failing harness self-test(s)');
console.log('DONE');
process.exit(FAILS ? 1 : 0);
