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

/* test.mjs's ok() prints 'FAIL  ' + label + optionally '  — ' + extra. The LABEL, exactly, is
   the text from immediately after that prefix up to the '  — ' separator or end-of-string —
   whichever comes first. Bounding the match here (rather than testing a needle against the
   whole line) closes a false-CAUGHT gap: a needle that is a true substring of the `extra`
   detail text, or of an entirely different FAIL line's label, previously credited a mutation
   for a label it never actually named. */
export function failLabels(lines) {
  return lines
    .filter(l => l.startsWith('FAIL'))
    .map(l => {
      const rest = l.slice(4).replace(/^\s+/, ''); // 'FAIL' consumed; leading spaces are the print's own '  '
      const sep = rest.indexOf('  — ');
      return sep < 0 ? rest : rest.slice(0, sep);
    });
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

/* Shared tail: everything after "do we have a caught/not-caught verdict candidate" is common
   to the label-keyed path (classifyMutant, below — kept for its own extensive coverage and as
   the one-time "does the red test actually go red on the old path" check the review-lane ruling
   asked for) and the id-keyed path (classifyById, further below — the actual production path
   after this fix). Extracting it once means a change to DONE/INCONSISTENT/BROKE/WEAK-WITNESS
   semantics can't drift between the two by accident. */
function finishVerdict(name, caught, weakWitness, how, lines, passes, brokeThreshold, rec, baselinePasses, exitStatus) {
  /* exact line match, not startsWith: test.mjs only ever prints a bare "DONE" line, so this
     was already safe in practice, but startsWith('DONE') would also credit a line like
     "DONE_WITH_ERRORS" or any other line that happens to begin with the same four letters
     (ChatGPT third-model audit round 4, paired with the same weakness below in baselineOk) */
  const done = lines.some(l => l === 'DONE');
  if (!done) return 'INCOMPLETE ' + name + '  — the suite stopped after ' + passes + ' checks without reaching DONE; not a verdict';
  /* The DONE line proves the child reached its own last line of code, not that its exit code
     agrees with what it just printed. test.mjs's own contract is `process.exit(FAILS ||
     process.exitCode ? 1 : 0)` — FAILS is what the ##RUN record's `failures` field carries,
     but `process.exitCode` can be set by a path FAILS never sees (the unhandledRejection
     handler sets it directly, without touching FAILS, specifically so a late rejection after
     every check has already passed still fails the run). A run that prints a clean ##RUN
     record and then exits 1 anyway is exactly that case — contaminated in a way `caught`/
     `done` alone cannot see. Checked only when a real exit status was actually captured: the
     mutation subprocess wrapper on this path used to discard it entirely (fixed alongside this
     check, not before it — a status nobody captured cannot be cross-checked against anything). */
  if (rec.run && typeof exitStatus === 'number') {
    const expectStatus = rec.run.failures > 0 ? 1 : 0;
    if (exitStatus !== expectStatus) return 'INCONSISTENT ' + name + '  — ##RUN reports ' +
      rec.run.failures + ' failure(s) (expected exit ' + expectStatus + ') but the process exited ' +
      exitStatus + '; something failed after the last check that FAILS never counted. Not a verdict.';
  }
  /* the file stopped parsing, so everything failed. That is not the guard biting. */
  if (caught && passes < brokeThreshold) return 'BROKE  ' + name + '  — mutation broke the parse (' +
    passes + ' passed, below ' + brokeThreshold + (typeof baselinePasses === 'number' ? ' = 10% of the ' + baselinePasses + '-check baseline' : ', the no-baseline fallback floor') + '); it proves nothing';
  if (weakWitness) return 'WEAK-WITNESS ' + name + '  — ' + weakWitness + '. Not CAUGHT.';
  if (caught) return 'CAUGHT ' + name + (how === 'identity' ? '' : '  [' + how + ']');
  return 'MISSED ' + name + (how === 'identity' ? '' : '  [' + how + ']');
}

export function classifyMutant(name, needle, out, baselinePasses, exitStatus) {
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
  let caught, how = 'identity', weakWitness = null;
  if (rec.guards.length) {
    const r = resolveNeedle(rec.guards.map(g => g.label), needle);
    if (!r.ok) {
      return 'UNCERTIFIABLE ' + name + '  — the needle cannot be resolved to one guard: ' +
        r.reason + (r.matches.length ? '; matches: ' + r.matches.slice(0, 3).map(m => '"' + m + '"').join(', ') : '') +
        '. No verdict either way.';
    }
    const named = rec.guards.filter(g => g.label === r.label);
    const failed = named.filter(g => g.verdict === 'fail');
    caught = failed.length > 0;
    /* threw-as-fail (test.mjs's ok(): a thunk that throws counts as a failure, so the suite
       cannot be silently killed mid-run by one dead selector) is the right call for the SUITE
       — it must not lose 600 other checks to one crash. It is a WEAK WITNESS for a mutation
       verdict, though: `threw != null` on the only failing record for this label proves a
       selector threw — the element the check reaches for is gone, or the crash happened before
       the check's own predicate ever ran — not that the BEHAVIOUR the label names is broken.
       R7 requirement 2 ("wrong oracle"): crediting that as CAUGHT certifies the label's claim on
       evidence that never actually exercised it. Distinct from UNCERTIFIABLE above, which is
       about the needle naming no guard or several — this needle resolved cleanly to exactly one
       guard; the guard itself is what didn't do its job. Checked later, not returned here: a
       run that also never reached DONE, or whose exit code contradicts its own ##RUN record,
       is INCOMPLETE/INCONSISTENT regardless of how the guard failed — those are stronger, more
       fundamental defects in the run itself and take priority over this one. */
    weakWitness = caught && failed.every(g => g.threw != null) ?
      'every failing record for "' + r.label + '" threw (' +
        failed.map(g => '"' + g.threw + '"').slice(0, 2).join('; ') + ') rather than evaluating the ' +
        'labelled behaviour; a crashed selector is not a witness for what the label claims' : null;
    if (r.how !== 'exact') how = 'identity via a needle that is a unique substring of "' + r.label + '"';
  } else {
    /* Exact label-boundary match, not `.includes(needle)`. A FAIL line's own shape (test.mjs's
       ok(): 'FAIL  ' + label + optionally '  — ' + extra) means the label is everything from
       the prefix up to the '  — ' separator or end-of-string, whichever comes first — never
       the whole line, which would never match anything once `extra` is present (the same
       defect this identity work exists to close, one layer further out: a needle that is a
       true substring of some UNRELATED FAIL line's label, or of its `extra` detail text past
       the separator, used to credit a mutation for text it never actually witnessed). This
       path only fires when the run produced no ##GUARD records at all — today that means the
       run crashed before the first check ever ran, since every live ok() call emits one; it
       is a defensive floor for that case, not the everyday path. */
    /* bounded to the label, substring rather than full equality: needles are designed
       throughout this file as unique substrings of a label (resolveNeedle's own "unique
       substring" mode is a first-class, accepted resolution — not a compromise), so requiring
       full-string equality here would silently turn many needles that legitimately match
       today into MISSED the one time this path fires. What actually needed fixing is the
       BOUNDARY: matching inside `extra` (the text after the '  — ' separator) or inside some
       OTHER unrelated FAIL line credited a mutation for text its own label never contained.
       Bounding the haystack to just the label closes that; it does not also require the whole
       label. */
    caught = failLabels(lines).some(label => label.includes(needle));
    how = 'SUBSTRING FALLBACK — the run emitted no guard records, so this is not an identity';
  }
  return finishVerdict(name, caught, weakWitness, how, lines, passes, brokeThreshold, rec, baselinePasses, exitStatus);
}

/* ---- id-keyed certification (review-lane P1 fix) ----

   The defect classifyMutant (above) still carries, even after 2(a)/2(b)/2(c)/WEAK-WITNESS:
   resolveNeedle is called AGAIN, from scratch, against the MUTANT run's own labels — never
   against the baseline. A needle that is genuinely ambiguous at baseline (two labels contain
   it) can resolve UNIQUELY against a mutant run in which the mutation exists to make ONE of
   those two guards disappear entirely — and the certifier reports CAUGHT, citing the guard
   that never had anything to do with the mutation, because removing the intended witness
   REMOVED THE AMBIGUITY that would otherwise have refused the verdict. Confirmed by
   reproduction (harness-selftest.mjs): baseline g0001 "target"/g0002 "target neighbour" both
   PASS (needle "target" is ambiguous here); mutant omits g0001 entirely, g0002 FAILS for an
   unrelated reason; classifyMutant returns CAUGHT via g0002. The needle was never wrong; the
   MOMENT of resolution was.

   The fix: resolve ONCE, against the baseline ONLY (resolveTargetId), and carry the resolved
   guard's stable ALLOCATED ID — not its label, which a rename can still silently reassign —
   into the mutant-run classification (classifyById). Absence of that id in the mutant run's
   own records is then visible as exactly what it is: no witness ran, not "the witness passed"
   and not "some other guard, coincidentally, failed". */

/* Resolve a needle to exactly one guard's stable id, against the BASELINE only. Everything
   downstream (classifyById) trusts this id and never re-derives it from a label. */
export function resolveTargetId(baselineOut, needle) {
  const rec = guardRecords(baselineOut);
  if (rec.bad.length) return { ok: false, reason: 'the baseline emitted ' + rec.bad.length + ' malformed guard record(s); a needle cannot be trusted against a baseline that cannot be parsed' };
  if (!rec.guards.length) return { ok: false, reason: 'the baseline emitted no guard records at all' };
  const r = resolveNeedle(rec.guards.map(g => g.label), needle);
  if (!r.ok) return { ok: false, reason: r.reason, matches: r.matches };
  const matching = rec.guards.filter(g => g.label === r.label);
  /* the SAME exact label carried by records with different ids inside one baseline run is a
     duplicate/retired-id-reuse defect in the allocator or a hand-edit, not something a needle
     resolution can paper over — refuse rather than pick one arbitrarily */
  const distinctIds = new Set(matching.map(g => g.id));
  if (distinctIds.size > 1) return { ok: false, reason: 'the label "' + r.label + '" is carried by records with different ids in the baseline: ' + [...distinctIds].join(', ') };
  const id = matching[0].id;
  /* an ok() call with no {id:...} meta yet (never run through allocate-guard-ids.mjs, or the
     literal token was stripped) has nothing stable to carry — falling back to its label would
     just re-import the exact fragility this function exists to remove */
  if (id == null) return { ok: false, reason: 'the resolved guard "' + r.label + '" has no allocated id (meta.id is null) — nothing stable to carry into the mutant run', label: r.label };
  return { ok: true, id, label: r.label, how: r.how };
}

export function classifyById(name, target, out, baselinePasses, exitStatus) {
  if (!target.ok) return 'UNCERTIFIABLE ' + name + '  — the needle could not be resolved against the baseline: ' +
    target.reason + (target.matches && target.matches.length ? '; matches: ' + target.matches.slice(0, 3).map(m => '"' + m + '"').join(', ') : '') +
    '. No verdict either way.';
  const lines = out.split('\n');
  const passes = lines.filter(l => l.startsWith('PASS')).length;
  const brokeThreshold = (typeof baselinePasses === 'number' && baselinePasses > 0)
    ? Math.max(1, Math.round(baselinePasses * BROKE_FRACTION))
    : 50;
  const rec = guardRecords(out);
  /* Validate the WHOLE stream before awarding any verdict — a malformed record elsewhere in
     the run means the run's own reporting is not trustworthy, even if the target's own record
     happens to look fine. A run this broken is not a witness for anything it printed. */
  if (rec.bad.length) return 'UNCERTIFIABLE ' + name + '  — this run emitted ' + rec.bad.length +
    ' malformed guard record(s); nothing it reports can be trusted, including a record that happens to name "' + target.id + '"';
  /* no synthetic substring fallback here (that was the old SUBSTRING FALLBACK path, itself a
     substring-matching path this fix exists to remove) — zero guard records at all in a run
     that was supposed to certify by id is refused, not silently downgraded to text matching */
  if (!rec.guards.length) return 'UNCERTIFIABLE ' + name + '  — this run emitted no guard records at all; nothing to certify against';
  /* Found live, chasing a real MISSED after this fix shipped: a call site inside a loop (the
     search-highlighting guard, one id, fired once per search term with the term baked into the
     label) legitimately produces several records sharing one id with DIFFERENT labels in a
     single run. Refusing on "id shared by disagreeing labels" alone — the first cut of this
     check — made that guard UNCERTIFIABLE every time, a false refusal on a guard that was
     working correctly. The real target of a "shared-id different-case" collision is narrower:
     records that agree on BOTH id and the resolved label but disagree on what happened —
     genuine self-contradiction, not "this call site also fired for a different search term".
     Matching on the id+label PAIR (not id alone) is what the baseline resolution already
     promised: target.label is the exact string resolveTargetId resolved this id to, and a
     sibling record under the same id with a different label was never a candidate witness for
     THIS target to begin with — it is simply a different firing of the same loop, irrelevant
     noise, not evidence of anything. */
  const matches = rec.guards.filter(g => g.id === target.id && g.label === target.label);
  const distinctVerdicts = new Set(matches.map(g => g.verdict));
  if (matches.length > 1 && distinctVerdicts.size > 1) return 'UNCERTIFIABLE ' + name + '  — id "' + target.id +
    '" with label "' + target.label + '" disagrees with itself in this run (' +
    [...distinctVerdicts].join(' and ') + ') — genuinely self-contradictory, not a verdict either way';
  /* THE FIX, this is the line that matters: absence is its own outcome, not "passed" and not
     "some other guard failed instead". MISSED still means exactly what it always meant — the
     intended check ran and did not detect the defect. Nothing here was detected because
     nothing here ran — including the case where this id fired for OTHER loop iterations but
     never for the one this target actually names. */
  if (!matches.length) return 'UNCERTIFIABLE ' + name + '  — no record with id "' + target.id + '" ("' +
    target.label + '") appears in this run; the guard the mutation exists to exercise never ran — not that it passed, and not that some other guard caught it instead';
  const failed = matches.filter(g => g.verdict === 'fail');
  const caught = failed.length > 0;
  const weakWitness = caught && failed.every(g => g.threw != null) ?
    'every failing record for "' + target.label + '" threw (' +
      failed.map(g => '"' + g.threw + '"').slice(0, 2).join('; ') + ') rather than evaluating the ' +
      'labelled behaviour; a crashed selector is not a witness for what the label claims' : null;
  return finishVerdict(name, caught, weakWitness, 'identity', lines, passes, brokeThreshold, rec, baselinePasses, exitStatus);
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
