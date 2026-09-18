# AGENTS.md — Stage A console (`stage-a/`)

**The AGENTS.md at the repository root is about a different artifact.** It describes
`shlav-a-mega.html` — the exam PWA, with `data/*.json`, a version trinity, a
vitest suite and `codex/<slug>` branches. None of that exists here. This folder
is a separate single-file study console with its own harness, its own CI
workflow and its own rules. When you are working in `stage-a/`, this file wins;
the root file applies to everything outside it.

Live: https://eiasash.github.io/Geriatrics/stage-a/

## What is here

```
stage-a/
├── index.html        # the whole console: HTML, CSS and JS in one file, ~14,800 lines, no build
├── sw.js             # offline cache
├── README.md         # the reader-facing description
└── build/            # the guards — never shipped, never loaded by the page
    ├── test.mjs            # behaviour suite, ~640 checks, jsdom; exits 1 on any FAIL
    ├── audit.mjs           # structural sweep: dead links, blind gates, runtime errors
    ├── facts.mjs           # chapter-verified strings pinned to the sections that cite them
    ├── sweep.mjs           # opens every section, clicks every link
    ├── dashtest.mjs        # dashboard and table pop-out
    ├── mutants.mjs         # breaks index.html on purpose; each break must turn its named guard red
    ├── mutants-classify.mjs# the CAUGHT/MISSED/INCOMPLETE verdict, split out so it can be tested
    ├── harness-selftest.mjs# tests the harness itself (NOT in CI — see "Gaps" below)
    ├── clock.mjs           # pins the page clock so a guard means the same thing every day
    ├── facts.json          # the verified strings
    └── ACCEPTANCE-round5.md# the standing bar for anything touching persistence — read it from disk
```

## Setup & commands

```bash
cd stage-a/build && npm i --no-save jsdom@24

node test.mjs ../index.html          # the suite (default clock: a reading week)
STAGEA_DATE=2026-08-30 node test.mjs ../index.html   # before the block
STAGEA_DATE=2027-01-12 node test.mjs ../index.html   # the consolidation period
node audit.mjs ../index.html         # must print "runtime errors: 0" and no FAIL line
node facts.mjs ../index.html
node sweep.mjs ../index.html
node dashtest.mjs ../index.html
node mutants.mjs --static ../index.html   # every mutation still has exactly one target — run this first, it is seconds
node mutants.mjs ../index.html            # the full run, ~20 min locally
node harness-selftest.mjs
```

`MUTANT_ONLY=<substring>,<substring>` runs just the mutations whose names match,
which is how you check a new guard in about a minute instead of twenty.
Run mutations under `TZ=Asia/Jerusalem` — one existing guard is only red in a
zone with daylight saving, which is what CI uses.

## Hard rules

1. **Branch `claude/<slug>` → PR → CI green.** Never push to `main`; Pages
   deploys it.
2. **Every fix gets a guard, every guard gets a red test.** Break the fix,
   watch the new check fail, restore it. A guard you have not seen fail is not
   a guard.
3. **Every guard gets a `mutants.mjs` entry.** A green suite and a blind suite
   look identical from the outside; the mutation is what tells them apart. The
   entry's needle must appear in the FAIL line of the check that catches it.
4. **When `facts.mjs` fails, go back to the chapter.** Never edit the fact to
   make it pass.
5. **A structural guard must not promise behaviour it does not test.** Matching
   the source is deliberate here and is fine — but if the label says what the
   app *does*, something in the file has to drive it. `test.mjs` fails on any
   `ok()` whose predicate cannot fail (a bare `true`, or a body whose only
   return is `return true`).
6. **`code` has block comments stripped; `html` does not.** Anchor structural
   guards on real code, never on comment text, or commenting a guard out leaves
   the suite green.
7. **Persistence changes are judged against `build/ACCEPTANCE-round5.md`.**
   Read it from disk at the start of the work, not from memory.

## How the harness thinks

- **The clock is pinned** (`clock.mjs`). The console shows a 16-week schedule,
  so what the page renders depends on the date; without pinning, a guard means
  something different every day. Time still advances from the pin, and
  `window.__stageaClock.set('2026-10-12T00:00:05')` moves it mid-test, which is
  how the midnight checks cross a day. Two windows get two independent pins —
  put the second on the first's clock before comparing timestamps across them.
- **Secondary windows are real tabs.** `test.mjs` builds separate JSDOM
  instances sharing one `store` object and one lock manager, so two "tabs"
  genuinely contend. Every window must get `pinClock`, `wireErrs` and
  `wireLocks` in its `beforeParse`; `harness-selftest.mjs` counts the call
  sites against the `new JSDOM(` count.
- **A run that never reaches `DONE` is not a verdict.** `mutants-classify.mjs`
  reports INCOMPLETE rather than crediting a coincidental FAIL line. If a
  mutation comes back INCOMPLETE, it is too destructive to be a red test —
  reshape it to break one thing.

## Persistence, in one paragraph

Saves go through `mergeSave(key, getMine, mergeFn, apply)`: read what is on
disk, three-way-merge this tab's changes against a *seen* baseline, write.
`withLock(name, fn)` wraps the check-then-write in a real Web Lock so another
tab's write cannot land in the gap. The mock run carries an identity
(`mockRunId` / `mockRunSeq` / `mockRunClaimed` / `mockRunObservedId`) so a
checkpoint can tell "my run" from "a run someone else took over" from "a legacy
record being migrated". Storage keys the backup writes are listed in `BKEYS`.
If you are about to change any of this, the three questions that have caught
real bugs are: *what does a second tab see*, *what happens when this write
lands late*, and *what does the record on disk look like if it was written by
an older build*.

## CI

`.github/workflows/stage-a-ci.yml`, triggered on any change under `stage-a/`.
The main app's CI does not scan this folder — its checkers hardcode
`shlav-a-mega.html`, so this workflow is the console's only automated gate.
`guards` runs the suite at three dates plus audit/facts/sweep/dashtest and
`mutants --static`; `mutants` runs the full mutation set across 10 shards.
Everything runs in `TZ=Asia/Jerusalem`.

Required for merge: `validate`, `js-integrity`, `scan`, `claude-review`.
**`mutants` and `guards` are not required checks** — a mutation regression can
merge. Read the shard results before merging rather than trusting the merge
button.

## Gaps worth knowing

- `harness-selftest.mjs` is not wired into CI. It guards the mutation runner's
  own verdict logic and only runs when someone runs it by hand.
- `.agents/skills/` at the repository root holds a byte-identical copy of two
  skills that already exist in `.claude/skills/`. Nothing in the repo
  references it.
