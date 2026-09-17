/* Pure classification helpers, pulled out of mutants.mjs so they can be unit-tested with
   canned child-output strings instead of needing a real subprocess (see
   harness-selftest.mjs). Both entry points take exactly what mutants.mjs already has in
   hand after a child run finishes — its captured stdout+stderr and, for the baseline, its
   exit status — so importing this module changes nothing about what mutants.mjs actually
   does; it only makes the decision itself independently checkable. */

/* ChatGPT third-model audit of main ee44f96: this used to check `caught` before `done`, so
   a child that printed a coincidentally-matching FAIL line and then died before DONE (for
   any reason — a crash, a timeout, an unrelated bug) was credited CAUGHT. The comment that
   used to sit above this logic claimed the opposite ("a run that never reaches DONE is now
   INCOMPLETE here, never MISSED") — true for MISSED, never actually wired for CAUGHT.
   Completion is established first: no DONE means INCOMPLETE regardless of a matching FAIL. */
export function classifyMutant(name, needle, out) {
  const lines = out.split('\n');
  const caught = lines.some(l => l.startsWith('FAIL') && l.includes(needle));
  const passes = lines.filter(l => l.startsWith('PASS')).length;
  /* exact line match, not startsWith: test.mjs only ever prints a bare "DONE" line, so this
     was already safe in practice, but startsWith('DONE') would also credit a line like
     "DONE_WITH_ERRORS" or any other line that happens to begin with the same four letters
     (ChatGPT third-model audit round 4, paired with the same weakness below in baselineOk) */
  const done = lines.some(l => l === 'DONE');
  if (!done) return 'INCOMPLETE ' + name + '  — the suite stopped after ' + passes + ' checks without reaching DONE; not a verdict';
  /* the file stopped parsing, so everything failed. That is not the guard biting. */
  if (caught && passes < 50) return 'BROKE  ' + name + '  — mutation broke the parse (' + passes + ' passed); it proves nothing';
  if (caught) return 'CAUGHT ' + name;
  return 'MISSED ' + name;
}

/* ChatGPT third-model audit: the baseline check read only stdout/stderr text (FAIL lines,
   the presence of "DONE"), discarding the child's actual exit status — the execFileSync
   throw was caught and its status dropped. So a baseline that exited non-zero while still
   printing DONE and no FAIL lines (e.g. test.mjs failing through process.exitCode, which it
   now also does for the unexpected-runtime-error check above) was announced "baseline
   green". Exit status is now part of the verdict, not just the printed text. */
export function baselineOk(out, exitStatus) {
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
  /* exact line match, not a bare substring test: /DONE/.test(out) also matches inside a line
     like "NOT_DONE" or "DONE_WITH_ERRORS" — a baseline that printed either of those and
     exited 0 would have been reported green (ChatGPT third-model audit round 4) */
  const hasDone = out.split('\n').some(l => l === 'DONE');
  return { ok: fails.length === 0 && hasDone && exitStatus === 0, fails, hasDone, exitStatus };
}
