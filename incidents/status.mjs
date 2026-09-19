/* THE REPORT EIAS SEES, RENDERED — not narrated.
   Ratified by the chat lane as point 4: "Don't order two reports. Collapse them. If what Eias sees
   isn't a narrated completion but a rendered view gated by the open-loop computation itself — an
   item simply cannot render as complete while any loop feeding it is open — then sequencing isn't
   a rule you apply, it's a property of how the view is built."

   That is the difference between LOUD and UNREACHABLE. lane-loops.mjs DETECTS an open loop and
   complains. This REFUSES TO EMIT THE WORDS: there is no code path below that prints a completion
   for an item whose feeding lane is unanswered.

   HONEST CEILING, stated because overselling it would be the exact defect this ledger exists to
   catch: it closes the ACCIDENTAL premature report - the pattern logged four times on 19 Sep. It
   does not philosophically stop a privileged actor saying "done" out loud outside this renderer,
   the same way branch protection never stopped a direct push by someone with the access to make
   one. That is the same ceiling every structural fix here has, not a flaw unique to this one.

   LOOP CLOSURE IS NOT "A MESSAGE EXISTS". Per the chat lane: a bare "noted, thanks" satisfies a
   timestamp. Closure requires a DECISION-LOG ENTRY referencing the inbound item's specific id and
   carrying adopted | rejected | held. That reuses the ratification structure which already has its
   own audit, rather than inventing a second unaudited content check. A hollow entry is then a
   LEDGER problem, caught by the self-report-bias discipline already in the charter. */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const read = f => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(here, f), 'utf8').replace(/^﻿/, ''));

const state = read(process.argv[2] || 'lane-state.json');
const work = read(process.argv[3] || 'work-items.json');

/* POINT 3: the lane roster is DERIVED FROM THE DISPATCH LOG, not a list maintained by hand.
   "Which locations do I even scan" is where self-report bias creeps back in - a source the scan
   does not know about cannot be reported missing. Dispatching to a lane is itself a logged action,
   so the scan enumerates lanes from that log. */
const dispatched = [...new Set((state.dispatch_log || []).map(d => d.lane))];
const known = Object.keys(state.lanes || {});
const unscanned = dispatched.filter(l => !known.includes(l));

const openLanes = new Set();
for (const [name, l] of Object.entries(state.lanes || {})) {
  if (l.last_speaker !== 'me') { openLanes.add(name); continue; }
  const inbound = l.their_last_item_id;
  if (!inbound) continue;
  const closed = (state.decision_log || []).some(e =>
    e.lane === name && e.in_reply_to === inbound &&
    ['adopted', 'rejected', 'held'].includes(e.status));
  if (!closed) openLanes.add(name);
}

let blocked = 0;
const out = ['STATUS — rendered from lane state, not narrated.', ''];

for (const item of work.items) {
  if (unscanned.length) {
    out.push('  ?? ' + item.what);
    out.push('     CANNOT RENDER — lanes dispatched to but never scanned: ' + unscanned.join(', '));
    blocked++;
    continue;
  }
  const feeding = (item.fed_by || []).filter(l => openLanes.has(l));
  if (feeding.length) {
    /* deliberately no branch here that can print a completion */
    out.push('  ## ' + item.what);
    out.push('     NOT REPORTABLE — open loop with: ' + feeding.join(', ') +
      '. The lane that produced this has not been answered, so it cannot be called done.');
    blocked++;
    continue;
  }
  if (!item.done) {
    out.push('  .. ' + item.what);
    out.push('     IN PROGRESS — ' + (item.blocker || 'no blocker recorded'));
    continue;
  }
  out.push('  OK ' + item.what);
  if (item.evidence) out.push('     evidence: ' + item.evidence);
}

out.push('');
out.push(blocked
  ? blocked + ' item(s) CANNOT be reported complete. Answer the lane first — the renderer has no ' +
    'branch that prints done while a feeding loop is open.'
  : 'every reported item has its feeding lanes answered (guard ceiling: this proves a structured ' +
    'decision entry exists, not that the decision was good)');

console.log(out.join('\n'));
process.exit(blocked ? 1 : 0);
