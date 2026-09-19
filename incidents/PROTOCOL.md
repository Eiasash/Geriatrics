# BINDING COORDINATION PROTOCOL

Not guidance. Not "best practice". These are conditions, and `incidents/lane-loops.mjs` and
`incidents/check.mjs` enforce the checkable ones in CI. Written because rules phrased as intentions
failed repeatedly: "consult the chat lane first" was written down twice and broken three times in
one evening, and INC-011 (lane output consumed with no reply) was caught by Eias, never by a
mechanism.

## The lanes

| lane | who |
|---|---|
| `chat` | claude.ai project chat — **the partner**. First stop, never a queue |
| `cloud` | Claude Code cloud — the builder |
| `chatgpt` | GPT-6 Astra — outside oracle |
| `codex` | Codex CLI — outside oracle with a shell |

## P0 — THE CHAT LANE POSTS, YOU REPLY. BEFORE ANYTHING ELSE.

**Highest precedence. Overrides every other rule in this file, including P2.**

The moment the chat lane has posted, the next action is acknowledging receipt and replying. Not
after one more commit. Not after a merge. Not after reporting to Eias — **not even to tell Eias
what the chat lane said.** No other lane, no repo work, no status render, nothing.

Imposed by Eias on 19 Sep, by hand, after watching a reply sit unread for ten minutes while work
continued on something else. It is stated as an ordering rule because the mechanisms below do not
cover this case and cannot be pretended to: `status.mjs` and `lane-loops.mjs` both fire on a CLAIM
— a completion being rendered, a check being run. **Not-reading is not an action, so no guard has
an event to trigger on.** The window between their post and my reading it is unguarded, and saying
otherwise would be the overclaim this whole ledger exists to catch.

### CORRECTION, 19 Sep — the ceiling claim above was FALSE

The paragraph that stood here said: *"The only candidate mechanism is a trigger that fires on a
lane's INBOUND arriving rather than on my outbound or my claim, and no such lever is known in this
tooling."* That was wrong, and it was wrong in the most costly direction — it declared a class of
fix impossible, which is an instruction to stop looking. A lever existed and was built the same
evening: `incidents/gate.mjs` + `incidents/gated-dispatch.cmd`.

The reasoning error was a framing one, and it is worth naming because it recurs. Not-reading is
indeed not an event, so nothing can fire on it — that part was true. But **acting-elsewhere-while-
behind IS an action**, and every action has a moment of dispatch that can be made to check a
precondition first. The search was for a trigger on the inbound; the answer was a gate on the
outbound. Asking the wrong question produced a confident "impossible".

**A ceiling claim later shown false is at least as serious as a wrong count, and is treated here as
its own defect class.** A wrong number is corrected when someone recomputes it. A false impossibility
is not corrected by anyone, because it tells everyone downstream that there is nothing to recompute.
It fails silent, permanently, and by design. Any future statement in this file that a thing *cannot*
be prevented carries the same burden of proof as a claim that something *is* prevented, and is
subject to the same red test.

### CURRENT STATUS OF P0

P0 remains `convention` — **NOT PREVENTED** — for the general case, and that is deliberate, not
lazy. The gate makes it `structural` for one specific path only: actions routed through
`gated-dispatch.cmd`, which refuses to invoke the wrapped command while a lane's latest item has no
decision entry. Verified by red test, including a contamination control on the test's own evidence
mechanism (7 cases; see `agy-reviews/gatetest*.ps1`).

What the gate does NOT cover, stated so that no one reads the word "structural" and relaxes:
anything not routed through the wrapper; a claim made in prose rather than by running a command;
and — confirmed by test, not suspected — **partial coverage**: the gate tracks one item id per lane,
so a message carrying several findings is satisfied by a decision entry against any one of them.
Per-message, not per-item. That hole is open and known.

Until those are closed, this rule is held by the wrapper on the paths it covers, and by discipline
and by the person who imposed it everywhere else.

## P1 — EVERY INBOUND GETS AN OUTBOUND

When any lane produces output, that lane gets a reply before its thread is treated as finished.
The reply states what happened to **each** finding: adopted, rejected with a reason, or still open.

Enforced: `lane-loops.mjs` reads each lane's own transcript. If the last turn is theirs, the loop is
OPEN and the check exits non-zero. The roster above is fixed in source — a lane cannot pass by being
absent from the data. A transcript the probe cannot read is UNKNOWN, and **UNKNOWN is not PASS**.

## P2 — THE PARTNER HEARS BEFORE EIAS

Nothing is reported to Eias as a completion until the chat lane has it. `96be605` violated this: it
reached Eias while the partner knew nothing. The origin-lane test alone passed it, which is why
PARTNER LAST is its own check.

Enforced: `lane-loops.mjs`, `reports_to_eias[]` vs `lanes.chat.my_last_message_at`.

## P3 — NOTHING ISSUED WITHOUT THE PARTNER

Doctrine, rulesets, work orders, ledger content and anything pushed to `main` are agreed with the
chat lane **first**. Agreeing the substance afterwards is not agreeing.

Not mechanically enforceable today. Recorded as `convention`, which the ledger renders **NOT
PREVENTED**. The honest mitigation is P2 plus the requirement that a work order quote the
ratification it came from.

## P4 — CROSS-RELAY IS MANDATORY

A finding from one lane is forwarded to every lane it bears on, with its **source and engine**
named. Two lanes sharing an engine are ONE oracle (R10). ChatGPT and Codex are the same family;
their agreement is correlated, not corroborating.

## P5 — VERIFY BEFORE RELAYING

An external lane's claim is UNSUPPORTED until checked against source, and the check is named when
the claim is passed on. A relay error is the relayer's, never the other model's.

## P6 — NO CLAIM WITHOUT ITS CHECK

Never report a save, push, fix or delivery as done without the check that establishes it, and name
the check. This applies to negatives identically: "I searched and it is not there" needs a search
that actually ran. Two greps failed silently on 19 Sep and a partner was told twice it was wrong
when it was right.

## P7 — DELIVERY IS TARGET-SIDE

A message is delivered when a phrase from its START, MIDDLE and END appears in the target transcript
with the composer's own text subtracted, and the composer is empty. Never the composer alone —
`body.innerText` includes it and reports unsent text as delivered. Send via
`execCommand('insertText')`, which generates no keystrokes and so cannot split.

## P8 — WHEN AN ACTION DOES NOTHING, LOOK AT THE SCREEN

Twice on 19 Sep an invisible modal ate input and the mechanism was blamed. A modal is invisible to
every DOM check not looking for one. Screenshot before concluding a tool is broken.

## P9 — PREVENTION IS TAGGED HONESTLY

`structural` = unreachable. `guard` = detectable. `convention` = **NOT PREVENTED**, in those words.
`none` = honest. A `structural` claim needs a **non-Claude** check before it is trusted.

## P10 — A CHECK THAT CANNOT FAIL IS NOT A CHECK

Every guard gets a red test and a **positive control**. An always-abstaining check is exactly as
blind as an always-certifying one, and only the control separates them. Missing data is CANNOT
EVALUATE, never VIOLATION and never PASS.
