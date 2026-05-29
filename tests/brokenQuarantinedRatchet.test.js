// brokenQuarantinedRatchet — pins the explicit quarantine state of Qs that
// the chaos-doctor + Opus cold-validate suggested a c-flip on, but where
// the existing q.e_en defends the current c and no verbatim Hazzard PDF
// quote (per v9.81 rule) has been obtained to resolve the disagreement.
//
// 2026-05-24 entries (PR for P2 of the audit-8 R1.5 carryover batch):
//   - idx 2096: Cardiology, Hazzard Ch 74 / Harrison Ch 286, conf 85 — STILL PARKED
//   - idx 3618: Urology,    Hazzard Ch 38 / GRS8 Ch 49-53,   conf 70 — RESOLVED 2026-05-29
//
// 2026-05-29: idx 3618 reopened via its documented reopen path. The verbatim
// GRS8 source question (Q#203, ANSWER: D) confirms c=3 — measure postvoid
// residual urine BEFORE adjusting medications, to exclude diphenhydramine-
// induced retention; a normal PVR averts the need to stop the diphenhydramine
// that gives good symptom control. The chaos-doctor's conf-70 flip to "stop
// diphenhydramine" is explicitly rejected by the GRS8 rationale. c confirmed
// unchanged; status/broken/broken_reason removed. idx 2096 stays parked — no
// verbatim Harrison Ch 286 / Hazzard Ch 74 disposition quote obtained for the
// low-risk elderly chest-pain-after-negative-serial-troponins scenario.
//
// Reopen path: obtain verbatim PDF quote, flip c (or confirm c stays),
// remove status field + delete this ratchet entry, set broken=false.
//
// This test exists so an automated "fix wrong answers" pass cannot silently
// re-enter the chaos-doctor's flip suggestion as a c-edit — see the
// `Curator-override re-flip` Known Trap in CLAUDE.md for the analogous
// pattern that produced the curator-overrides ratchet.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const Q_PATH = resolve(process.cwd(), 'data', 'questions.json');
const questions = JSON.parse(readFileSync(Q_PATH, 'utf-8'));

describe('broken-quarantined ratchet', () => {
  const quarantined = questions
    .map((q, idx) => ({ idx, q }))
    .filter(({ q }) => q.status === 'broken-quarantined');

  it('has exactly 1 quarantined Q (idx 2096; idx 3618 resolved 2026-05-29)', () => {
    expect(quarantined.length).toBe(1);
  });

  it('every status=broken-quarantined Q is also broken=true', () => {
    for (const { idx, q } of quarantined) {
      expect(q.broken, `idx ${idx} status=broken-quarantined but broken!=true`).toBe(true);
    }
  });

  it('every status=broken-quarantined Q has a QUARANTINED-prefixed broken_reason', () => {
    for (const { idx, q } of quarantined) {
      expect(
        typeof q.broken_reason === 'string' && q.broken_reason.startsWith('QUARANTINED '),
        `idx ${idx} broken_reason does not start with 'QUARANTINED ': ${q.broken_reason?.slice(0, 60)}`
      ).toBe(true);
    }
  });

  it('quarantine reasons reference the v9.81 PDF-verbatim rule', () => {
    for (const { idx, q } of quarantined) {
      expect(
        q.broken_reason.includes('v9.81 rule'),
        `idx ${idx} broken_reason missing v9.81 rule reference`
      ).toBe(true);
    }
  });

  it('the expected index (2096) carries the quarantine', () => {
    const indices = quarantined.map(({ idx }) => idx).sort((a, b) => a - b);
    expect(indices).toEqual([2096]);
  });

  it('the quarantined Q cites its original textbook references intact', () => {
    expect(questions[2096].ref).toContain('Hazzard Ch 74');
    expect(questions[2096].ref).toContain('Harrison Ch 286');
  });
});
