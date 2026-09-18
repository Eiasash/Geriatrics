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
/* The machine-readable stream test.mjs now prints alongside its prose. Parsing is total: a
   malformed record is surfaced rather than dropped, because a silently skipped record is a
   guard that quietly stops existing as far as certification is concerned. */
export function guardRecords(out) {
  const guards = [], bad = [];
  let run = null;
  for (const l of out.split('\n')) {
    if (l.startsWith('##GUARD ')) {
      try { guards.push(JSON.parse(l.slice(8))); } catch (e) { bad.push(l); }
    } else if (l.startsWith('##RUN ')) {
      try { run = JSON.parse(l.slice(6)); } catch (e) { bad.push(l); }
    }
  }
  return { guards, run, bad };
}

/* Resolve what a mutation entry POINTS AT to exactly one guard, against the labels the run
   actually emitted.

   This is the whole point of the change. The old certifier asked "does some failing line
   contain this needle", which conflates three different situations:

     - the needle names one guard, and that guard failed        -> a real witness
     - the needle names one guard, and a DIFFERENT guard failed
       whose label also contains it                              -> credited the wrong guard
     - the needle names no guard at all                          -> can never credit anything

   The second is invisible to any static check, because the label the needle points at exists.
   Here both are visible, because the universe of labels is read from the run itself. A needle
   that resolves to zero or to more than one guard yields no verdict — it is reported as
   uncertifiable, never as CAUGHT and never as MISSED. */
export function resolveNeedle(labels, needle) {
  const exact = labels.filter(l => l === needle);
  if (exact.length === 1) return { ok: true, label: exact[0], how: 'exact' };
  if (exact.length > 1) return { ok: false, reason: 'two guards share this exact label', matches: exact };
  const hits = labels.filter(l => l.includes(needle));
  if (hits.length === 1) return { ok: true, label: hits[0], how: 'unique substring' };
  if (hits.length === 0) return { ok: false, reason: 'no guard label contains it', matches: [] };
  return { ok: false, reason: 'it matches ' + hits.length + ' distinct guard labels', matches: hits };
}

/* The fraction of the baseline's own PASS count below which a "caught" mutation is judged to
   have broken the parse rather than been legitimately caught. Was a literal `50`, pinned to
   whatever the suite's check count happened to be the day that line was written (per the
   instruction set: "a range chosen for a value inherently about two things matching only
   holds once one side is externally anchored" — 50 was anchored to nothing, and would silently
   mean something different every time a check was added or removed). Relative to the actual
   baseline instead: a mutation that dies before completing even a tenth of the SAME run's own
   checks broke parsing, whatever the suite's current size. */
const BROKE_FRACTION = 0.1;

export function classifyMutant(name, needle, out, baselinePasses) {
  const lines = out.split('\n');
  const passes = lines.filter(l => l.startsWith('PASS')).length;
  /* callers with no real baseline to measure against (harness-selftest.mjs's canned-string
     fixtures) get the old literal floor rather than a division by an undefined denominator —
     documented here, not silently defaulted, because "no baseline provided" and "baseline
     provided" are different claims about how much trust the threshold below deserves */
  const brokeThreshold = (typeof baselinePasses === 'number' && baselinePasses > 0)
    ? Math.max(1, Math.round(baselinePasses * BROKE_FRACTION))
    : 50;
  const rec = guardRecords(out);
  /* Identity first, prose only where the run emitted no records at all (audit-runner output,
     or a child so broken it never reached the first check). The fallback is named in the
     verdict string so a reader is never left thinking a substring match was an identity. */
  let caught, how = 'identity';
  if (rec.guards.length) {
    const r = resolveNeedle(rec.guards.map(g => g.label), needle);
    if (!r.ok) {
      return 'UNCERTIFIABLE ' + name + '  — the needle cannot be resolved to one guard: ' +
        r.reason + (r.matches.length ? '; matches: ' + r.matches.slice(0, 3).map(m => '"' + m + '"').join(', ') : '') +
        '. No verdict either way.';
    }
    caught = rec.guards.some(g => g.label === r.label && g.verdict === 'fail');
    if (r.how !== 'exact') how = 'identity via a needle that is a unique substring of "' + r.label + '"';
  } else {
    caught = lines.some(l => l.startsWith('FAIL') && l.includes(needle));
    how = 'SUBSTRING FALLBACK — the run emitted no guard records, so this is not an identity';
  }
  /* exact line match, not startsWith: test.mjs only ever prints a bare "DONE" line, so this
     was already safe in practice, but startsWith('DONE') would also credit a line like
     "DONE_WITH_ERRORS" or any other line that happens to begin with the same four letters
     (ChatGPT third-model audit round 4, paired with the same weakness below in baselineOk) */
  const done = lines.some(l => l === 'DONE');
  if (!done) return 'INCOMPLETE ' + name + '  — the suite stopped after ' + passes + ' checks without reaching DONE; not a verdict';
  /* the file stopped parsing, so everything failed. That is not the guard biting. */
  if (caught && passes < brokeThreshold) return 'BROKE  ' + name + '  — mutation broke the parse (' +
    passes + ' passed, below ' + brokeThreshold + (typeof baselinePasses === 'number' ? ' = 10% of the ' + baselinePasses + '-check baseline' : ', the no-baseline fallback floor') + '); it proves nothing';
  if (caught) return 'CAUGHT ' + name + (how === 'identity' ? '' : '  [' + how + ']');
  return 'MISSED ' + name + (how === 'identity' ? '' : '  [' + how + ']');
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
