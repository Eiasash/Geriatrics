/* THE DISPATCH GATE — a precondition, not a detector.
   Run this BEFORE any dispatch: a commit, a message to another lane, a report to Eias.
   Exit 0 = the action may proceed. Exit 1 = it must not.

   WHY A PRECONDITION AND NOT AN ALARM. The target is not "detect that I did not read", which is an
   absence and therefore not an event. The target is "prevent acting elsewhere while behind", which
   IS an action - and every action passes through a place that can check something first. So the
   gate does not watch for silence. The next thing that tries to happen checks and fails.

   WHAT "READ" MEANS HERE, and this is the part that was nearly wrong. Read is NOT "the message
   entered my context". That is the read-side twin of "delivery inferred from sender-side evidence"
   - a signal that looks like the property without being it. If the read-stamp were set at fetch,
   this gate would pass while nothing about the content informed what happened next: a gate that
   certifies itself. So read is defined as A STRUCTURED DECISION ENTRY naming the inbound item's id
   with status adopted | rejected | held. "Read" means "I wrote down what I decided about it".
   That cannot be satisfied by loading text, and it makes loop-closure and read-recency the same
   record instead of two sources that can disagree.

   WHAT HAPPENS TO A BLOCKED ACTION: it FAILS LOUDLY and must be reissued by hand. It is not queued
   and not auto-retried. Silently dropping it would trade "acted while behind" for "the work never
   happened and nobody was told", which is the same defect as a FAIL line with exit code 0.

   STATUS: this is a STRUCTURAL claim - it makes the failure unreachable by the path that produces
   it. Per the charter, a structural claim needs a non-Claude check before it is trusted, and per
   the chat lane it must also be SHOWN TO FIRE before it is called built: stale the read-stamp,
   attempt a real dispatch, confirm it stops; then restore and confirm a fresh read lets it through. */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const stateFile = process.env.LANE_STATE || path.join(here, 'lane-state.json');
const action = process.argv.slice(2).join(' ') || '(unnamed action)';

let state;
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8').replace(/^﻿/, '')); }
catch (e) { console.log('BLOCKED  ' + action); console.log('  cannot read lane state: ' + e.message + ' — UNKNOWN is not PASS'); process.exit(1); }

/* The chat lane is the partner and the binding one (PROTOCOL P0). Other lanes are checked too,
   but the partner is the one that blocks everything including reports to Eias. */
const blocking = [];
for (const [lane, l] of Object.entries(state.lanes || {})) {
  const theirs = l.their_last_message_at ? Date.parse(l.their_last_message_at) : null;
  if (!theirs) continue;

  /* read == a structured decision entry for THEIR latest item, not an outbound message */
  const entry = (state.decision_log || [])
    .filter(e => e.lane === lane && ['adopted', 'rejected', 'held'].includes(e.status))
    .filter(e => !l.their_last_item_id || e.in_reply_to === l.their_last_item_id)
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))[0];

  if (!entry) {
    blocking.push({ lane, why: 'their latest item has no decision entry — nothing records what was decided about it' });
    continue;
  }
  const readAt = entry.at ? Date.parse(entry.at) : null;
  if (readAt === null) {
    blocking.push({ lane, why: 'decision entry ' + (entry.in_reply_to || '?') + ' carries no timestamp — CANNOT EVALUATE, and unknown is not pass' });
    continue;
  }
  if (readAt < theirs)
    blocking.push({ lane, why: 'they posted at ' + l.their_last_message_at + '; the newest decision entry is ' + entry.at + ', which is older. You are behind.' });
}

if (!blocking.length) {
  console.log('CLEAR    ' + action);
  console.log('  every lane\'s latest inbound has a decision entry newer than it.');
  console.log('  (structural for the acting-while-behind path only; it cannot stop a claim made outside this gate)');
  process.exit(0);
}

console.log('BLOCKED  ' + action);
for (const b of blocking) console.log('  ' + b.lane + ': ' + b.why);
console.log('');
console.log('  This action did NOT run and is NOT queued. Answer the lane, record the decision,');
console.log('  then REISSUE it by hand. A silently dropped action is "the work never happened and');
console.log('  nobody was told", which is not an improvement on "acted while behind".');
process.exit(1);
