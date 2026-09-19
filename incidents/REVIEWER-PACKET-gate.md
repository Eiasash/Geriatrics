# Reviewer packet — the dispatch gate (incidents/gate.mjs)

**Date:** 19 Sep 2026 · **Commit:** 56cd288 on `cowork/incident-ledger` · **Reviewer:** non-Claude oracle

## Why you are being asked

A STRUCTURAL claim was made. Under this project's charter a structural claim is not trusted on the
word of the model that built it, and a second Claude agreeing is correlated evidence, not
corroboration. You are the outside check. **ChatGPT and Codex are one engine under rule R10 — whichever
of you answers is ONE oracle. A second pass from the other is not a second opinion.**

The instruction is the one the partner lane gave: **do not trust it until you have made it fire
yourself.** Reproduction steps are below. A "looks right" without a run is worth nothing here.

## What the gate claims

The failure being prevented is *acting elsewhere while behind on a lane* — committing, messaging
another lane, or reporting to the human while a lane's latest message has not been answered.

The design move: not-reading is an absence and therefore not an event, so nothing can fire on it.
But **acting-elsewhere-while-behind is an action**, and an action has a dispatch point that can check
a precondition. So the gate is a wrapper (`gated-dispatch.cmd`) that refuses to invoke the wrapped
command unless every lane's latest inbound item has a decision entry newer than it.

**"Read" is defined as a structured decision entry naming the inbound item's id with status
`adopted | rejected | held`.** Explicitly NOT "the message entered context" — that would be a gate
that certifies itself, the read-side twin of inferring delivery from sender-side evidence.

A blocked action fails loudly and must be reissued by hand. It is not queued. A silent drop trades
"acted while behind" for "the work never happened and nobody was told".

## Test results as run

Seven cases. `invoked` is a marker file the dispatched script writes as its own first action;
`actionRan` is its output file.

```
STALE READ (must block)                  exit=1  invoked=False  actionRan=False  PASS
FRESH READ (positive control, must run)  exit=0  invoked=True   actionRan=True   PASS
REPLIED BUT NO DECISION (must block)     exit=1  invoked=False  actionRan=False  PASS
UNREADABLE STATE (must block)            exit=1  invoked=False  actionRan=False  PASS
PARTIAL COVERAGE: 2 items, 1 decided     exit=0  invoked=True   actionRan=True   HOLE (see below)
HELD status (vs adopted)                 exit=0  invoked=True   actionRan=True   deliberate
BOGUS status "seen" (must block)         exit=1  invoked=False  actionRan=False  PASS
```

Two earlier versions of this test were **wrong in both directions** and are disclosed rather than
buried: the wrapper read `%~dp0` after `shift` so it crashed and the crash looked like a block; and
the harness expressed the dispatched action as a shell redirect on the caller's line, so the probe
file was created by the outer shell whether or not anything ran. The test was validating shell
semantics, not the gate.

### Control on the evidence mechanism itself

```
C2 (read first): positive control with reset      exit=0  marker=True
                 blocking case, reset DISABLED    exit=1  marker=True   <- contamination IS possible
C1: marker pre-planted, blocking case with reset  exit=1  markerBefore=True  markerAfter=False
```

C2 is read first on purpose: if contamination were impossible in this harness, C1's clean result
would have been unable to fail and would have proved nothing.

## Known open hole — stated, not patched before review

The gate tracks `their_last_item_id`, **one id per lane**. A message carrying three findings is
satisfied by a decision entry against any one of them. So the claim "read means decided, not
fetched" is true **per message and not per item**. Confirmed by test 5, not suspected.

The obvious fix — track open item ids as a set — is not built yet, deliberately. The question to
review is not "does the set-based version close the hole" but:

> **Who draws the boundary of an item, and does moving the ambiguity from message to item
> eliminate it or merely relocate it?**

If item boundaries are drawn by whoever writes the decision entries, the same ambiguity is
re-litigated one level down. Review that before the set-based version exists, not after.

## Design decision to scrutinise, not just confirm

`held` satisfies the gate identically to `adopted`. Reasoning: the gate enforces *not behind*, not
*resolved*. Forcing adoption to clear the gate would create pressure to close items in order to
unblock oneself — the same pressure that makes people loosen a classifier to turn CI green. The
backstop against `held` becoming a rubber stamp is the ledger's self-report-bias discipline, not a
second mechanism here. **Attack this if it is wrong.**

Note the limit of test 7 precisely: a closed vocabulary rejecting an invented status shows the field
cannot be gamed by typo. It says nothing about whether `adopted` / `rejected` are applied to the
right items. Do not let it stand in for content-correctness.

## What is NOT claimed

- Structural only for actions routed through the wrapper. It cannot stop a claim made in prose.
  Same ceiling as branch protection against someone with direct push.
- The invocation marker is stronger than output evidence but is still gathered by the harness that
  was wrong twice tonight.
- `PROTOCOL.md` P0 remains `convention` — NOT PREVENTED — for the general case.

## Reproduce

```
git fetch && git checkout 56cd288
# blocking case
set LANE_STATE=<a lane-state.json whose chat lane has their_last_item_id with no decision entry>
incidents\gated-dispatch.cmd "any label" <some command that writes a file>
# the command must NOT run. Then add a decision entry with status adopted, in_reply_to that id,
# timestamped after their_last_message_at, and confirm the same command DOES run.
```

Harnesses: `agy-reviews/gatetest.ps1`, `gatetest2.ps1`, `gatetest3.ps1` (controls).

## What to report back

Severity + exact snippet + why. Reproduction steps for any runtime claim. Flag any guard that
passes for a reason other than the one its label states. Say "clean" per area if it is clean. Top 5
at most. **No patches.**
