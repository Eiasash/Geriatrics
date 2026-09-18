# Stage A - round 7 work order

Single source of truth for the round-7 harness repairs. Written by Cowork after all
review lanes finished and every finding was verified in source. Claude Code works this
file top to bottom and does NOT take work from chat relays; a correction is an edit to
this file, not a new message.

Base commit: 522d4cf. Every line number below is Cowork's own, read from that commit -
not a reviewer's citation (ChatGPT's ran 1-2 lines high).

## Why this order

P0 first because it is a dependency, not a preference. Until the certifier is sound,
every "the guard goes red" proof in this repo is worth less than it looks - including
the proofs for the fixes below it. Fix the instrument, re-measure, then fix the findings.

---

## P0 - the certifier is broken, and the meta-guard cannot see it

**P0.1 classifyMutant credits by substring.**
`mutants-classify.mjs`: `const caught = lines.some(l => l.startsWith('FAIL') && l.includes(needle))`.
Any needle that is also a substring of a DIFFERENT guard's label lets that other guard
turn red and certify the named guard.

Measured: 8 of 236 needles match more than one of the 604 distinct `ok()` labels.
Run for real against the suite, 7 of the 8 are latent (the correct guard bites anyway).
ONE is actively false:

- mutation at `mutants.mjs:1004-1007`, needle `freezes the header's auto-hide`
- `test.mjs:890` `a live selection freezes the header's auto-hide` -> stays GREEN
- `test.mjs:897` `clearing the selection un-freezes the header's auto-hide` -> goes RED
- "un-freezes" contains "freezes", so the negation certifies the assertion.

Confirmed three ways: Codex CLI at low (structural), Codex at high (isolated in-memory
reproduction), and the real end-to-end suite with jsdom installed.

Fix: match the whole guard label, not a substring.

**P0.2 --static must reject an ambiguous needle.**
`mutants.mjs --static` already requires each mutation TARGET to occur exactly once in
index.html and prints AMBIG. The same discipline was never applied to the needle: the
NEEDLE check only asks `suite.includes(needle)` - at least one match, never exactly one.
Add AMBIG-NEEDLE, symmetric with the target check.

**P0.3 disambiguate the 8 needles** so the suite is green under the stricter rule.
Lengthen each needle until unique. Do NOT shorten a guard label to suit a needle.
The 8: `text size` (5 labels), `moves focus into it` (3), and two each for
`SEEN where it was`, `before the first paint`, `44px tap target`, `with a real border`,
`does not also answer or advance the background practice question`,
`freezes the header's auto-hide`.

**P0.4 harness-selftest.mjs cannot catch any of this - rebuild its classifier tests.**
All four classifier tests pass against a stand-in classifier that ignores the needle
entirely and credits CAUGHT for any completed run containing any FAIL. The positive
fixture's own label already contains its shorter needle; the "no matching FAIL" fixture
contains no FAIL line at all. Neither can distinguish the intended guard from a
colliding one.

Required new fixtures:
- a completed, above-floor run whose ONLY failure is a different guard's
  substring-colliding label -> assert MISSED
- a genuine-target control -> assert CAUGHT
Both must fail against the current substring classifier and pass after P0.1.

Same file, same shape, baseline tests: all four pass against a faulty baseline accepting
`startsWith('DONE')`, which also accepts `DONE_WITH_ERRORS` - the exact weakness a
comment in that file claims to have fixed. Add a fixture that pins it.

Also `harness-selftest.mjs:180-184` asserts `callSites >= 9` while its own regex finds
TEN occurrences, because it counts the `wireErrs` declaration at `test.mjs:32` as a call
site. One real window can lose its wiring and stay green. Correct the count and make it
exact, not `>=`. And `178-179` checks `helperIdx >= 0` for the helper's definition, which
a commented-out line satisfies.

## P1 - re-measure (no code, this is the instrument reading)

After P0 lands, run the full mutation set and report which mutations change verdict from
CAUGHT to MISSED. That number is the real blind count, and we have never had it. Report
it before starting P2.

## P2 - facts.mjs: a verified clinical fact can change value and still pass

`facts.mjs:5-10` asserts `norm(sec.textContent).includes(norm(f.text))`. Containment, no
boundary, no uniqueness. Counted over all 129 facts in facts.json:

- 11 expectations END IN A DIGIT, so a trailing digit still passes. Sharpest:
  `#sleep` "ferritin is under 75" passes at 750; `#hf` "HR 0.79" passes at 0.795;
  `#falls` "rate ratio 0.98"; `#thyroid` "consider treating at 7.0-9.9";
  `#rehab` "no hip flexion beyond 90".
- 16 expectations are under 12 characters - `98%`, `55%`, `52%`, `27%`, `76.5%`,
  `23.2%`, `threefold`, `12-fold`, `for 21`. These match ANYWHERE in the section, so the
  guard does not even establish the fact is attached to the right sentence.

Note the failure direction: an ordinary substitution (5 -> 9) IS caught. Extension and
incidental matching are not. That is the worst possible shape for a drug dose.

Fix, part one: reject a match extended by a digit or word character on either side, and
require each expectation to occur exactly once in its section - the same uniqueness rule
mutants.mjs already applies to its targets.

**P2.2 - re-anchor the 29 weak expectations. This needs NO clinical re-verification.**

Read this carefully, because the obvious reading of P2 is wrong. Lengthening an
expectation does not re-check a figure. The figure was verified when the fact was written
and carries its own `src` stamp. What is broken is ANCHORING: the guard currently hunts a
bare token anywhere in the section. The repair is to lengthen each expectation to the
surrounding sentence **as it already appears on the page**, so the number is checked in
its own context. That is a mechanical string operation against index.html, with no
clinical judgement in it and no Hazzard lookup.

Do not transcribe a list of 29 strings from chat - derive them. Write a one-off script in
stage-a/build (delete it after, do not commit it) that, for every fact in facts.json whose
normalised text ends in a digit OR is shorter than 12 characters:
- locates the expectation in `document.getElementById(f.sec).textContent`, normalised the
  same way facts.mjs normalises;
- expands LEFT to the previous sentence terminator and RIGHT to the next one;
- if that span exceeds 160 characters, pulls in to about 60 characters either side and
  snaps back OUT to whitespace boundaries;
- **slices those offsets verbatim. Never rejoin words** - a reassembled string is not a
  substring of the page and the new guard will not match. This was a real bug in the first
  version of the script and it produced three silently unusable candidates;
- reports the occurrence count of both the old and the new string in that section.

Run at 522d4cf this yields 29 weak facts and 29 unique verbatim anchors, none failing to
locate. Expect to reproduce those numbers; if you do not, stop and say so.

**FOUR facts are matching ambiguously TODAY** - the current expectation appears more than
once in its own section, so the guard may be passing on the wrong occurrence:
`#falls` "27%" (3 occurrences), `#stroke` "for 21" (2), `#bpsd` "98%" (2),
`#dementia` "55%"/"12-fold" (in an APOE table). Flag these four in the PR body with their
old and new strings so Eias can eyeball that the anchor landed on the intended sentence.
The other 25 need no review.

DO NOT change any clinical content, any fact text's MEANING, or any page text to make a
check pass. Lengthening an expectation to its own surrounding sentence is not a content
change; altering a number, a unit or a claim is, and is forbidden. If a fact fails under
the stricter rule, report it and stop - it goes to the project chat against the Hazzard
chapter, never fixed in the guard.

## P3 - sweep.mjs and dashtest.mjs pass an inert page

sweep.mjs, 6 of 8 blind. The extracted body EXITS 0 with every navigation and annotation
function a no-op, inert chapter buttons, search returning only "No results for <query>",
and a `data-sec` pointing at a button instead of a section. Specifically: `7-8` calls
show/annotateSection with exception capture only; `9-10` counts attempted clicks and
never selects the `.go2` buttons its own comment promises; `11-12` accepts "No results
for CRT" as containing "CRT"; `13-14` opens drill without exercising either mode;
`19-20` accepts any existing element as a `data-sec` target.
Clean and not to be touched: duplicate-abbreviation detection (18) and the captured-error
gate (5, 26) - both rejected their defect controls.

dashtest.mjs, 6 of 8 blind: `11-12` accepts `Read ch 999999`; `14-16` passes when Read
opens papers instead of the chapter; `18-21` accepts any nonempty filter label; `23-27`
passes a visible mock card with no questions if the counter says 1; `29-34` accepts an
unrelated row and a whitespace-only title; `41-42` accepts whitespace-only summaries.
Clean: modal closure and staying on falls (36-39), and the runtime-error gate (44-46).

## P4 - audit.mjs (already specified, lowest priority - finish or defer)

Six blind gates plus one mislabelled row. Full detail was relayed earlier; if that relay
did not survive, re-derive from audit.mjs directly: `26-27` and `42-43` test
getElementById instead of membership in the `secs` array that line 29 already builds;
`39-40` accepts a whitespace display name; `45` calls a 10-space answer non-empty while
failing a legitimate 9-character one; `51-52` accepts a whitespace option; `57` subtracts
total captions from total tables with nothing binding a caption to its own table.
Line 53's flagged-options row claims "already disclosed in-app" with nothing verifying
the disclosure still exists.

## P5 - docs (no code)

stage-a/AGENTS.md, and the consolidated review-lane doctrine section in
.claude/skills/stage-a-supervised-change/SKILL.md.

Note for AGENTS.md specifically: the REPO-ROOT AGENTS.md describes `shlav-a-mega.html`, a
different app. AGENTS.md is what Codex reads, walking up from cwd, so every Codex review
of a Stage A PR so far has run with rules for the wrong application. That is the reason
stage-a/AGENTS.md exists; say so in it.

---

# P6 - data repair. RULED BY THE CONTENT LANE, NOT BY A REVIEWER.

These are decisions Eias's content lane already made. They are not findings to be
weighed - they are rulings to implement. Separate PR from P0-P4: this is data, not
harness. Do not start it before P1 has reported.

**P6.1 Re-derive ch/pg from `src`, never from the existing fields** - those fields are
the corrupted output. Three passes, not one regex:
- strip the table/figure suffix first (`טבלה NN-N`, `תמונה N`) so it cannot bleed into
  digit runs;
- recover the chapter from an explicit chapter marker where present, otherwise by matching
  the recovered page against the 8e contents range;
- recover the page as a standalone 3-or-4 digit run or an explicit range, never as
  leftover digits after a fixed-width split.
Cross-check every recovered pair against the real 108-row contents table. A pair that
still does not fit is a PARSE FAILURE, not "close enough".
Anything unresolved gets `ch: null, pg: null`. **A null is honest and visible; a
wrong-but-plausible number is what is testing him right now.** 380 of 404 recent Hazzard
records have a source-supported proposal; 24 stay null.

**P6.2 Exclude unresolved items** from the chapter-frequency tables, the
every-sitting-chapter table and the reading-lane weighting, **and state the denominator on
the page** - "based on N of 407 chaptered items; M excluded as unresolved". An honestly
smaller N beats a confidently wrong one in a table that decides what he studies next.

**P6.3 2026-06 Q38 is ruled ch 42, pg 621** - by hand, do not re-derive it. Its `src`
says so in words, the content is the Clinical Frailty Scale matching ch 42 Table 42-3, and
the competing `8124` / `F 8-2` fragment is a mangled figure reference. The other 24 nulls
stay null unless they have comparably unambiguous TEXTUAL evidence; range-plausibility
alone is not enough.

**P6.4 Split the 7 merged options, do not drop them.** All seven come from the same
PDF-column-merge bug and the real text for both halves survives - re-split at the embedded
letter marker. Nothing is invented.
**2021-12 Q65 first: it is a live scoring bug** - a blank option is currently gradeable as
correct. Split option 3 at its embedded 4th-letter marker so the key points at real text.
The other six (2021-12 Q29/Q44/Q66/Q76, 2022-06 Q98, 2024-05 Q26) already have keys on
intact options - same fix, lower urgency.

**P6.5 Fix every hardcoded-100 denominator.** The 14 missing question numbers are
confirmed absent and the arithmetic is clean (each sitting is 100 minus its gap count).
Whether they were committee-cancelled or lost in extraction cannot be settled without the
official IMA PDFs read as page images, and that does not block this: any percentage
computed against a literal 100 must use the sitting's actual item count, or every
"X% of every sitting" claim is quietly off.

**P6.6 The repaired bank is authoritative; replace the hand-audited figures outright.**
The displayed 299-across-69 and the core-nine ch-61 count of 18 reconcile against nothing
checkable - not the contents table, not any subset of the five sittings (327/322/318/320/
329), not the per-item citations. **Do not keep both with a caveat note**: a caveat is the
silent-mixing failure wearing a disclaimer, and a reader skimming still leaves with 299.
Compute every frequency, the core-nine membership and the Q/400-style labels from the
repaired bank, state the real denominator beside each figure, and make `schedStats()`
actually read `PQ` instead of regex-parsing the hardcoded `SCHED` strings sitting next to
it. If a true 299-style figure is ever recovered from the original papers it returns as a
separate, labelled, sourced number.

**P6.7** The 69 chapter-1 assignments in 2020-2022 have zero source support; those
sittings are excluded from all 8th-edition frequency claims.

**Not yours, do not attempt:** identifying the four-sitting cohort behind "/400"
(Cowork is running `git blame` on the commit that introduced it), and cancelled-vs-lost
for the 14 missing numbers (needs the IMA PDFs as page images).

---

## Standing rules for every item above

- Every fix gets a guard; every guard gets a red test. Revert the fix, confirm the guard
  fails, restore it. A guard that has never been seen red is not a guard.
- Every new guard gets a mutants.mjs entry, and after P0 that entry's needle must be
  unique against all 604 labels.
- Run everything in stage-a/build before committing: test.mjs, audit.mjs, facts.mjs,
  sweep.mjs, dashtest.mjs, mutants.mjs. Locally run mutants.mjs --static plus the
  mutations touched; let CI run the full set. Do not poll CI in a loop.
- jsdom is NOT a dependency - it is nowhere in package.json and CI installs it per run
  with `npm i --no-save jsdom@24`. Do the same locally.
- Never edit a fact, a guard label, or page text to make a check pass.
- Say plainly when something does not reproduce. Several items above were verified by
  reading rather than running, and are marked as such.
