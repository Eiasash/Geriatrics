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
