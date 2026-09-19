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
import { classifyMutant, baselineOk, guardRecords, resolveNeedle, failLabels, resolveTargetId, classifyById } from './mutants-classify.mjs';
import { assertNoProductionClassifyMutant, assertMutantsFileIsClean } from './production-path-guard.mjs';

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

/* ---- (4b) id-keyed certification — the review-lane P1 fix ----

   classifyMutant (above) resolves the needle against the MUTANT run's own labels, every time —
   never against the baseline. A needle genuinely ambiguous at baseline (two labels contain it)
   resolves UNIQUELY against a mutant run in which the mutation makes the intended guard vanish
   entirely: removing the witness removes the ambiguity that would otherwise refuse the verdict,
   and classifyMutant reports CAUGHT, citing the wrong guard. Reproduced here exactly as the
   review specified — adopted verbatim, not paraphrased — and confirmed red against the OLD
   (label-keyed) path before any fix code existed, per "a red test you never saw go red is not
   a red test". */
{
  const G = (id, label, verdict, threw) => '##GUARD ' + JSON.stringify({ id, label, verdict, threw: threw || null });
  const bodyN = (lines, run) => lines.join('\n') + '\n' + (run || '##RUN ' + JSON.stringify({ completed: true, failures: 1 })) + '\nDONE\n' + Array(60).fill('PASS x').join('\n');

  const baseline = bodyN([G('g0001', 'target', 'pass'), G('g0002', 'target neighbour', 'pass'), G('g0003', 'filler', 'pass')],
    '##RUN ' + JSON.stringify({ completed: true, failures: 0 }));
  const baselinePasses = 3;
  /* the mutant: g0001 ("target") is OMITTED ENTIRELY — the guard the mutation exists to
     exercise never fired at all — while g0002 ("target neighbour") fails for a reason that has
     nothing to do with this mutation, and g0003 still passes */
  const mutantAbsent = bodyN(['FAIL  target neighbour', G('g0002', 'target neighbour', 'fail'), G('g0003', 'filler', 'pass')]);

  /* THE RED TEST, confirmed red against the OLD path first. classifyMutant re-resolves
     "target" against the MUTANT's own labels, where it now names exactly one guard —
     "target neighbour" — because the guard it was meant to name is silently absent. */
  const oldVerdict = classifyMutant('m', 'target', mutantAbsent, baselinePasses, 1);
  ok('CONFIRMED RED, old label-keyed path: an absent intended guard is falsely CAUGHT via an unrelated neighbour that happens to fail',
     oldVerdict.startsWith('CAUGHT'), oldVerdict);

  /* THE FIX: resolve once, against the baseline, and carry the id — not the label — into the
     mutant-run classification. */
  const target = resolveTargetId(baseline, 'target');
  ok('resolveTargetId resolves the ambiguous-by-label needle to exactly one id against the baseline (exact match beats substring)',
     target.ok === true && target.id === 'g0001' && target.label === 'target', JSON.stringify(target));

  const newVerdict = classifyById('m', target, mutantAbsent, baselinePasses, 1);
  ok('THE FIX: the same absent-guard case is UNCERTIFIABLE under id-keyed classification, not CAUGHT via the neighbour',
     newVerdict.startsWith('UNCERTIFIABLE'), newVerdict);

  /* POSITIVE CONTROL — without this, an always-abstaining classifier (UNCERTIFIABLE no matter
     what) would pass the test above for the wrong reason. A classifier that certifies nothing
     is exactly as blind as one that certifies everything; only this tells them apart. */
  const mutantCaught = bodyN(['FAIL  target', G('g0001', 'target', 'fail'), G('g0002', 'target neighbour', 'pass'), G('g0003', 'filler', 'pass')]);
  const controlVerdict = classifyById('m', target, mutantCaught, baselinePasses, 1);
  ok('POSITIVE CONTROL: the intended guard genuinely failing is still CAUGHT — this is not an always-abstaining classifier',
     controlVerdict === 'CAUGHT m', controlVerdict);

  /* Four variants that must each REFUSE certification outright. */
  const nullIdBaseline = bodyN([G(null, 'target', 'pass'), G('g0002', 'filler', 'pass')], '##RUN ' + JSON.stringify({ completed: true, failures: 0 }));
  const nullIdTarget = resolveTargetId(nullIdBaseline, 'target');
  ok('VARIANT — null target id: a guard resolved at baseline but never allocated an id refuses, rather than falling back to its label',
     nullIdTarget.ok === false, JSON.stringify(nullIdTarget));

  const zeroRecordsMutant = ['FAIL  target', '##RUN ' + JSON.stringify({ completed: true, failures: 1 }), 'DONE', ...Array(60).fill('PASS x')].join('\n');
  const zeroVerdict = classifyById('m', target, zeroRecordsMutant, baselinePasses, 1);
  ok('VARIANT — zero structured records: a mutant run with no ##GUARD lines at all refuses (no synthetic substring fallback)',
     zeroVerdict.startsWith('UNCERTIFIABLE'), zeroVerdict);

  const malformedMutant = bodyN(['##GUARD {not json', G('g0001', 'target', 'fail')]);
  const malformedVerdict = classifyById('m', target, malformedMutant, baselinePasses, 1);
  ok('VARIANT — malformed record beside a valid target failure: one unparseable record anywhere in the stream refuses the whole run, even though the target itself looks fine',
     malformedVerdict.startsWith('UNCERTIFIABLE'), malformedVerdict);

  /* VARIANT — shared-id different-case, corrected shape. The first draft of this check refused
     on ANY id shared by disagreeing labels within a run — which turned out to be exactly the
     shape of a legitimate loop-driven guard (search highlighting fires the same id once per
     search term, with the term baked into the label) and produced a false UNCERTIFIABLE on a
     guard that was working correctly (found live, on this PR, chasing a real MISSED after this
     fix shipped). The genuine collision this must still refuse is narrower: the SAME id AND the
     SAME resolved label disagreeing with itself — not two different labels sharing an id, which
     is just two different loop iterations and not a collision at all. */
  const trueSelfContradiction = bodyN([G('g0001', 'target', 'fail'), G('g0001', 'target', 'pass')]);
  const contradictionVerdict = classifyById('m', target, trueSelfContradiction, baselinePasses, 1);
  ok('VARIANT — shared-id different-case (corrected): the SAME id+label pair disagreeing with itself within one run refuses, rather than picking one',
     contradictionVerdict.startsWith('UNCERTIFIABLE'), contradictionVerdict);

  /* the loop-guard regression this correction exists for: one id, several records with
     DIFFERENT labels in the same run (different search terms) — not a collision, and the
     target's own specific label must still be classified correctly (CAUGHT here) rather than
     refused just because a sibling loop iteration used the same id */
  const loopGuardMutant = bodyN([G('g0001', 'target', 'fail'), G('g0001', 'target: a different loop iteration', 'pass')]);
  const loopGuardVerdict = classifyById('m', target, loopGuardMutant, baselinePasses, 1);
  ok('REGRESSION GUARD — a loop-driven guard (one id, several differently-labelled records in one run) is classified on its OWN label, not refused for a sibling iteration sharing the id',
     loopGuardVerdict === 'CAUGHT m', loopGuardVerdict);

  /* and the mirror: the target's OWN label never fired at all, even though the id fired for
     OTHER loop iterations — this is absence for THIS target, same as if the id never appeared */
  const loopGuardAbsentMutant = bodyN([G('g0001', 'target: a different loop iteration', 'pass')]);
  const loopGuardAbsentVerdict = classifyById('m', target, loopGuardAbsentMutant, baselinePasses, 1);
  ok('REGRESSION GUARD — a loop-driven guard whose id fired for OTHER iterations but never for this target’s own label is UNCERTIFIABLE (absence), not credited via a sibling',
     loopGuardAbsentVerdict.startsWith('UNCERTIFIABLE'), loopGuardAbsentVerdict);

  /* Also refuse at the BASELINE side of the same defect: two records sharing one label but
     carrying different ids — resolveTargetId must not silently pick one. */
  const dupIdBaseline = bodyN([G('g0001', 'target', 'pass'), G('g0002', 'target', 'pass')], '##RUN ' + JSON.stringify({ completed: true, failures: 0 }));
  const dupIdTarget = resolveTargetId(dupIdBaseline, 'target');
  ok('VARIANT — the same label carried by two different ids in the baseline refuses at resolution time',
     dupIdTarget.ok === false, JSON.stringify(dupIdTarget));
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

/* ---- (5b) allocate-guard-ids.mjs: two independent allocations against a shared base collide,
   and the allocator must refuse rather than accept — review-lane items 5 and 6 ----

   The four existing allocator assertions above are all SEQUENTIAL, SINGLE-STREAM: one scratch
   copy, one registry, one allocation at a time. None of them proves two independent allocations
   CANNOT collide — they prove ids get assigned, never that assignment is safe under the shape
   that actually broke it: two branches, each starting from the same registry.next, each picking
   the same never-before-used id for a DIFFERENT new check, then merged. That is exactly how
   g0630 collided. Built here as two real scratch copies from one shared base, allocated
   independently, then merged the way a git merge would — two call sites in one file, each
   already carrying the literal token {id:'g0630'}. */
{
  const os = await import('os');
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-id-merge-base-'));
  const branchADir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-id-merge-a-'));
  const branchBDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-id-merge-b-'));
  const run = (...args) => execFileSync('node', ['allocate-guard-ids.mjs', ...args], { encoding: 'utf8' });
  try{
    const baseFile = path.join(baseDir, 'test.mjs');
    const baseRegistry = path.join(baseDir, 'guard-ids.json');
    fs.copyFileSync('test.mjs', baseFile);
    run('--write', '--file', baseFile, '--registry', baseRegistry);
    const baseReg = JSON.parse(fs.readFileSync(baseRegistry, 'utf8'));
    const nextId = 'g' + String(baseReg.next).padStart(4, '0');
    const doneLine = 'console.log("DONE");';
    const baseSrc = fs.readFileSync(baseFile, 'utf8');

    /* branch A: one new check, allocated from the shared base registry */
    const fileA = path.join(branchADir, 'test.mjs');
    const registryA = path.join(branchADir, 'guard-ids.json');
    fs.writeFileSync(fileA, baseSrc.replace(doneLine, "ok('scratch: branch A adds this check', true);\n" + doneLine), 'utf8');
    fs.copyFileSync(baseRegistry, registryA);
    run('--write', '--file', fileA, '--registry', registryA);
    const regA = JSON.parse(fs.readFileSync(registryA, 'utf8'));
    ok('branch A allocates the shared next id for its own new check',
       regA.guards[nextId] && regA.guards[nextId].label.includes('branch A'), JSON.stringify(regA.guards[nextId]));

    /* branch B: a DIFFERENT new check, allocated independently from the SAME shared base
       registry — neither branch has seen the other's allocation */
    const fileB = path.join(branchBDir, 'test.mjs');
    const registryB = path.join(branchBDir, 'guard-ids.json');
    fs.writeFileSync(fileB, baseSrc.replace(doneLine, "ok('scratch: branch B adds a different check', true);\n" + doneLine), 'utf8');
    fs.copyFileSync(baseRegistry, registryB);
    run('--write', '--file', fileB, '--registry', registryB);
    const regB = JSON.parse(fs.readFileSync(registryB, 'utf8'));
    ok('branch B independently allocates the SAME shared next id for its own, different new check — the collision',
       regB.guards[nextId] && regB.guards[nextId].label.includes('branch B'), JSON.stringify(regB.guards[nextId]));

    /* the merge: both new ok() calls, each already carrying the literal {id:'g0630'}-shaped
       token, land in one file — exactly what a real git merge of both branches produces */
    const mergedSrc = fs.readFileSync(fileA, 'utf8').replace(doneLine,
      "ok('scratch: branch B adds a different check', true, '', {id:'" + nextId + "'});\n" + doneLine);
    const mergedFile = path.join(baseDir, 'test-merged.mjs');
    fs.writeFileSync(mergedFile, mergedSrc, 'utf8');

    let threw = null;
    try{ run('--file', mergedFile, '--registry', baseRegistry); }
    catch(e){ threw = (e.stderr || '') + (e.stdout || '') + (e.message || ''); }
    ok('THE MERGE-COLLISION FIX: the allocator refuses (throws) rather than silently accepting two call sites that share one id',
       threw != null && /DUPLICATE IDS/.test(threw), threw ? threw.slice(0, 200) : '(did not throw)');

    /* and the sibling case item 5 also names: a hand-edited or badly-merged file that reuses
       an id the registry already knows as retired must refuse too */
    const retiredScratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-id-retired-reuse-'));
    try{
      const rFile = path.join(retiredScratchDir, 'test.mjs');
      const rRegistry = path.join(retiredScratchDir, 'guard-ids.json');
      fs.copyFileSync(baseFile, rFile);
      /* a synthetic id well outside the real 629, so this exercises ONLY the retired-reuse
         path — reusing a real active id (e.g. g0001) would trip the duplicate-id check first,
         since that id is still claimed by its own real call site in the base file */
      const retiredReg = { ...baseReg, retired: { ...baseReg.retired, g9001: { label: 'anything', file: 'test.mjs', status: 'retired', retired_reason: 'test fixture', retired_at: new Date().toISOString() } } };
      fs.writeFileSync(rRegistry, JSON.stringify(retiredReg, null, 2), 'utf8');
      const rSrc = fs.readFileSync(rFile, 'utf8');
      fs.writeFileSync(rFile, rSrc.replace(doneLine, "ok('scratch: reuses a retired id', true, '', {id:'g9001'});\n" + doneLine), 'utf8');
      let threwRetired = null;
      try{ run('--file', rFile, '--registry', rRegistry); }
      catch(e){ threwRetired = (e.stderr || '') + (e.stdout || '') + (e.message || ''); }
      ok('VARIANT — retired id reused: the allocator refuses a hand-edited or badly-merged reuse of an id the registry already retired',
         threwRetired != null && /RETIRED ID REUSED/.test(threwRetired), threwRetired ? threwRetired.slice(0, 200) : '(did not throw)');
    } finally {
      fs.rmSync(retiredScratchDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
    fs.rmSync(branchADir, { recursive: true, force: true });
    fs.rmSync(branchBDir, { recursive: true, force: true });
  }
}

/* ---- (6) production-path-guard.mjs: closes the risk that classifyMutant (label-keyed)
   silently becomes a production path again in mutants.mjs — TASK 2 of the review-lane ruling
   that also produced the id-keyed P1 fix above. Canned-string red/green pair first (pure,
   deterministic, independent of what mutants.mjs currently says), then a live check against
   the REAL mutants.mjs on disk — which is the thing that actually matters, since the
   continuously-enforced half of this guard is wired into mutants.mjs's own --static block,
   not into this file. ---- */
{
  const productionCall = 'function worker(){\n  results[i] = classifyMutant(name, needle, out, BASELINE_PASSES, status);\n}';
  const red = assertNoProductionClassifyMutant(productionCall);
  ok('RED — a real call to classifyMutant( outside any comment or string is reported, not silently accepted',
     red.ok === false && red.hits.length === 1, JSON.stringify(red));

  const commentMention = 'function worker(){\n  /* classifyMutant() requires an exact DONE line, so an audit run through it fails */\n  results[i] = classifyById(name, TARGETS.get(i), out, BASELINE_PASSES, status);\n}';
  const greenComment = assertNoProductionClassifyMutant(commentMention);
  ok('GREEN — the exact wording already live in mutants.mjs today (a comment that spells classifyMutant() with its own parens) does not trip the guard',
     greenComment.ok === true, JSON.stringify(greenComment));

  const stringMention = 'function worker(){\n  const note = "call classifyMutant(a, b) if you ever need the old path";\n  results[i] = classifyById(name, TARGETS.get(i), out, BASELINE_PASSES, status);\n}';
  const greenString = assertNoProductionClassifyMutant(stringMention);
  ok('GREEN — a string literal mentioning classifyMutant( does not trip the guard either (never itself a call site)',
     greenString.ok === true, JSON.stringify(greenString));

  const importLine = "import { classifyMutant, classifyById } from './mutants-classify.mjs';\nresults[i] = classifyById(name, TARGETS.get(i), out, BASELINE_PASSES, status);";
  const greenImport = assertNoProductionClassifyMutant(importLine);
  ok('GREEN — importing the identifier without calling it (no open-paren immediately after) does not trip the guard',
     greenImport.ok === true, JSON.stringify(greenImport));

  /* the live check: enforces this against the file that actually matters, right now, in this
     PR's own state — not just against canned fixtures above */
  const real = assertMutantsFileIsClean();
  ok('the real mutants.mjs currently calls classifyMutant nowhere outside a comment or string (production dispatch is id-keyed only)',
     real.ok === true, JSON.stringify(real));
}

console.log('\n' + FAILS + ' failing harness self-test(s)');
console.log('DONE');
process.exit(FAILS ? 1 : 0);
