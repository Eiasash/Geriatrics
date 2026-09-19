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
import crypto from 'node:crypto';

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
  if (readAt < theirs) {
    blocking.push({ lane, why: 'they posted at ' + l.their_last_message_at + '; the newest decision entry is ' + entry.at + ', which is older. You are behind.' });
    continue;
  }

  /* DIRECT-FETCH REQUIREMENT (INC-012). Lanes listed in direct_fetch_lanes have a transcript that
     can be fetched directly, so a decision about one of their items may not rest on a paraphrase or
     a relay of it. The entry must carry source evidence produced BY reading that lane's own page:
     the character count and a digest of the fetched text.

     WHAT THIS CLOSES: the INC-012 path, where text presented as the lane's arrived through another
     channel and a decision entry was written against it without ever opening the lane.

     CORRECTION, from the non-Claude oracle, and it was right. This comment used to end with:
     "Producing a digest requires having the page text, so a relayed paraphrase cannot satisfy it
     BY CONSTRUCTION." That sentence was FALSE and it was the strongest claim in the file.

     The check below verifies the STRING src.via, not the acquisition channel. It rejects a record
     that is HONEST about being a relay. It does not detect relayed content: a paraphrase recorded
     as via:"direct-fetch", with a digest computed over that paraphrase, passes every check here.
     The oracle demonstrated it with a fixture of locally invented text that never touched a page.

     So the "relay blocked" test proves rejection of the relay TAG, not detection of relayed
     content, and the ceiling disclaimer below - which was honest - did not cover this, because the
     disclaimer conceded the digest's provenance while this sentence claimed the channel's.

     WHAT IT DOES NOT CLOSE, stated so the label is not read as more than it is: it does not prove
     the digest came from that page. A digest can be computed over any text. It raises the cost of
     the failure from "accept a paraphrase" to "fabricate a source record", which is a different and
     more deliberate act - it does not make it impossible. And it applies ONLY to lanes with a
     fetchable transcript; a verbal report, a screenshot, or anything without a direct source is
     outside it entirely, which is most of the general problem. */
  const fetchLanes = state.direct_fetch_lanes || [];
  if (fetchLanes.includes(lane)) {
    const src = entry.source;
    if (!src) {
      blocking.push({ lane, why: 'decision entry ' + (entry.in_reply_to || '?') + ' carries no source record. This lane requires a DIRECT FETCH of its own page — a relay or paraphrase does not count (INC-012).' });
      continue;
    }
    if (src.via !== 'direct-fetch') {
      blocking.push({ lane, why: 'source.via is "' + src.via + '", not "direct-fetch". Relayed content cannot back a decision entry for this lane (INC-012).' });
      continue;
    }
    if (!Number.isInteger(src.chars) || src.chars <= 0 || !src.digest) {
      blocking.push({ lane, why: 'source record is incomplete (needs chars and digest read off the lane page) — CANNOT EVALUATE, and unknown is not pass' });
      continue;
    }

    /* DIGEST STABILITY (found in the first live use of the rule above, and it had already passed).
       The first digest recorded under this rule was computed over the rendered DOM node, which
       carries the app's thinking-header preamble. That preamble's repeat count is not stable, so the
       same unchanged message hashed to two different values minutes apart (2900 then 2794 chars).
       A digest that moves on unchanged content identifies nothing: it cannot detect a substitution
       and cannot be reproduced. The rule accepted it because it only checked that a digest EXISTED -
       a proxy standing in for the property, inside the mechanism built to stop exactly that.

       So the record must now name the extractor that produced the digest, and carry at least two
       INDEPENDENT reads that agreed. Disagreement between reads is a blocking condition, not a note.

       WHAT THIS CANNOT DO, stated so the label is not read as more than it is: the gate cannot
       verify the reads actually happened. It checks that the record claims two and that the claimed
       values are self-consistent. The reads remain SELF-REPORTED. This is a consistency check on the
       record, not proof of the reading - and calling it hardened would be the same overclaim again. */
    if (!src.extractor) {
      blocking.push({ lane, why: 'source record names no extractor — a digest over raw rendered text includes UI chrome and is not stable. CANNOT EVALUATE.' });
      continue;
    }
    const reads = Array.isArray(src.reads) ? src.reads : [];
    if (reads.length < 2) {
      blocking.push({ lane, why: 'source record carries ' + reads.length + ' read(s); at least 2 independent reads must be recorded and agree (digest stability)' });
      continue;
    }
    const disagree = reads.some(r => r.chars !== src.chars || r.digest !== src.digest);
    if (disagree) {
      blocking.push({ lane, why: 'the recorded reads DISAGREE with each other or with the headline digest — the digest is not stable, so it identifies nothing' });
      continue;
    }
    /* PERSISTED CAPTURE (the foundation fix). Everything above measures a windowed DOM render.
       Measured directly: a lane message was gone from the page 2 minutes 8 seconds after it was
       hashed. So a digest over it is unverifiable FOREVER after that - not merely unreliable. An
       honest, perfectly stable digest over a vanished object sits in the same position as a
       fabricated one, because nobody can recompute either.

       This is ONE finding about the foundation, not two findings of increasing severity: the
       non-persistence is what made the stability question undecidable, rather than a worse version
       of it. Scraping a transient render was the wrong substrate, and measuring it more carefully
       was the same mistake twice - the shape of the substring certifier and its bounded-substring
       "fix" that was still a substring match.

       So the fetched text is persisted at fetch time and the gate RECOMPUTES the digest from that
       file. This is the first check here that verifies rather than inspects: a wrong digest cannot
       be written past it, because the file is the authority and it is in the repo.

       CEILING, unchanged by this: it does not close the fabrication path. A capture I invent and a
       capture I fetched are indistinguishable to the gate. It closes only the proven gap - that the
       evidence became unrecoverable in principle. */
    if (!src.capture) {
      blocking.push({ lane, why: 'source record has no persisted capture. The lane transcript is windowed (a message was gone 2m08s after hashing), so a digest with no durable object is unverifiable forever.' });
      continue;
    }
    let capText;
    try { capText = fs.readFileSync(path.join(here, '..', src.capture), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').trim(); }
    catch (e) { blocking.push({ lane, why: 'capture file ' + src.capture + ' cannot be read: ' + e.message + ' — CANNOT EVALUATE' }); continue; }
    const recomputed = 'sha256:' + crypto.createHash('sha256').update(capText, 'utf8').digest('hex');
    if (!recomputed.startsWith(src.digest.replace(/\.\.\.$/, ''))) {
      blocking.push({ lane, why: 'RECOMPUTED digest of the capture does not match the recorded digest.\n      recorded:   ' + src.digest + '\n      recomputed: ' + recomputed });
      continue;
    }
    if (capText.length !== src.chars) {
      blocking.push({ lane, why: 'capture is ' + capText.length + ' chars, record says ' + src.chars + ' — the capture and the record describe different text' });
      continue;
    }

    const fetchedAt = src.fetched_at ? Date.parse(src.fetched_at) : null;
    if (fetchedAt === null) {
      blocking.push({ lane, why: 'source record has no fetched_at — cannot tell whether the fetch predates their message' });
      continue;
    }
    if (fetchedAt < theirs)
      blocking.push({ lane, why: 'the source was fetched at ' + src.fetched_at + ', BEFORE they posted at ' + l.their_last_message_at + '. The decision rests on a stale fetch.' });
  }
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
