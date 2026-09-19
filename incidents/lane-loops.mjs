/* OPEN-LOOP CHECK — INC-011.
   A lane's output gets consumed and never answered. Nothing detects it, because acting on the
   output produces visible work and the missing reply produces nothing visible at all.

   WHAT THIS IS, honestly: a GUARD, not a structural prevention. It makes an open loop LOUD. It
   does not make one impossible. incidents.jsonl records it as guard for that reason.

   WHAT MAKES IT MORE THAN A CHECKLIST: the timestamps are not asserted by me. They are produced
   by a fixed probe that reads each lane's own transcript (browser DOM for the chat/cloud/ChatGPT
   lanes, file mtimes for Codex) into lane-state.json. I cannot mark a loop closed by deciding it
   is closed — closing requires an outbound message to actually exist in the transcript.

   THE THREE HOLES, stated because a guard that hides its blind spots is the thing this project
   keeps getting wrong:
     1. A worthless reply closes a loop. "Noted, thanks" satisfies a timestamp. MIN_REPLY_CHARS
        below is a weak mitigation, not a solution: it measures length, which is a proxy for
        substance. Named as a proxy on purpose.
     2. It cannot see a loop I never opened — if a lane's output was never read there is no
        inbound timestamp. Closed by ROSTER below: a lane silent in BOTH directions past
        STALE_HOURS is reported as UNATTENDED rather than passing quietly.
     3. Running the probe is still a convention. That is why a violation exits non-zero and is
        routed to Eias by the scheduled tick, so the person who notices is not only me. */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const file = process.argv[2] || path.join(here, 'lane-state.json');

/* The roster is FIXED here, not derived from the state file. A lane cannot disappear from the
   check by being absent from the data — that is exactly how Codex went unanswered for a day. */
const ROSTER = ['chat', 'cloud', 'chatgpt', 'codex'];
const MIN_REPLY_CHARS = 400;
const STALE_HOURS = 6;

let fails = 0;
const fail = m => { console.log('FAIL  ' + m); fails++; };
const warn = m => console.log('WARN  ' + m);

let state;
try { state = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
catch (e) { console.log('FAIL  cannot read lane state: ' + e.message); process.exit(1); }

const now = state.probed_at ? Date.parse(state.probed_at) : Date.now();
const hrs = ms => ((now - ms) / 3600000).toFixed(1);

for (const lane of ROSTER) {
  const l = state.lanes?.[lane];
  if (!l) { fail(lane + ': NOT PROBED — a lane missing from the state file is unattended, not fine'); continue; }

  /* WHO SPOKE LAST is the property, and it is directly observable in every lane's own
     transcript — no timestamps needed, nothing for me to assert. If the last turn is theirs,
     the loop is open. This replaced a timestamp comparison because message times are not
     reliably in the DOM, and a check that needs data the probe cannot actually read would have
     been a rule that quietly never ran. */
  if (l.last_speaker !== 'them' && l.last_speaker !== 'me') {
    fail(lane + ': last_speaker is "' + l.last_speaker + '" — the probe could not read the ' +
      'transcript. UNKNOWN is not PASS.');
    continue;
  }

  if (l.last_speaker === 'them') {
    fail(lane + ': OPEN LOOP — the last turn in that transcript is theirs. They spoke; I did not answer.');
    continue;
  }

  const inbound = l.their_last_message_at ? Date.parse(l.their_last_message_at) : null;
  const outbound = l.my_last_message_at ? Date.parse(l.my_last_message_at) : null;

  /* the weak one, and labelled as weak */
  if (outbound && typeof l.my_last_message_chars === 'number' && l.my_last_message_chars < MIN_REPLY_CHARS)
    warn(lane + ': reply was ' + l.my_last_message_chars + ' chars — closes the loop by timestamp, ' +
      'but length is a PROXY for substance. Check it actually answered what they asked.');

  /* only meaningful when the probe actually captured times. Without them this fired on every
     lane with an absurd age, which is a check reporting a finding it cannot evaluate. */
  const newest = Math.max(inbound || 0, outbound || 0);
  if (newest > 0 && (now - newest) / 3600000 > STALE_HOURS)
    warn(lane + ': silent both ways for ' + hrs(newest) + 'h — not an open loop, but nobody is driving it');
}

/* SEQUENCING — Eias's actual complaint. A completion reported to him before the lane that
   produced it has been told is a violation, and it is checkable from the same two timestamps. */
for (const r of state.reports_to_eias || []) {
  const l = state.lanes?.[r.origin_lane];
  if (!l) { fail('report "' + r.what + '" names origin lane ' + r.origin_lane + ', which is not probed'); continue; }
  const told = l.my_last_message_at ? Date.parse(l.my_last_message_at) : null;
  const toEias = Date.parse(r.at);

  /* A missing timestamp means CANNOT EVALUATE, not VIOLATION. Reporting a violation from absent
     data is the false-UNCERTIFIABLE defect the build lane found in the certifier, reproduced
     here in the checker meant to catch this class. Caught by the positive control. */
  if (told === null) { warn('sequencing for "' + r.what + '": CANNOT EVALUATE — no my_last_message_at for ' + r.origin_lane); continue; }
  if (told > toEias)
    fail('SEQUENCING: "' + r.what + '" was reported to Eias before the originating lane (' +
      r.origin_lane + ') was told. The lane that did the work hears last.');

  /* The rule Eias actually cares about is broader than the originating lane: the PARTNER hears
     before he does. 96be605 went to him while the chat lane still knew nothing about it — the
     origin-lane test alone would have passed that, because the cloud lane had been written to. */
  const chatTold = state.lanes?.chat?.my_last_message_at ? Date.parse(state.lanes.chat.my_last_message_at) : null;
  if (chatTold === null) warn('partner-first for "' + r.what + '": CANNOT EVALUATE — no my_last_message_at for chat');
  else if (chatTold > toEias)
    fail('PARTNER LAST: "' + r.what + '" reached Eias before the chat lane. The partner is the first stop, not the last.');
}

console.log('');
console.log(fails ? 'FAILED — ' + fails + ' open/unattended loop(s)'
  : 'all ' + ROSTER.length + ' lanes answered (guard only: this proves a reply EXISTS, not that it was worth sending)');
process.exit(fails ? 1 : 0);
