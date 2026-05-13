// Regression pin for chaos-doctor-bot v4 persona/corpus framing.
// The v4 file was originally adapted from the FM/IM sibling bot and the
// SYS_DOCTOR_PICK / _JUDGE / _SOURCE prompts and citation regex were left
// FM-framed until v10.64.113. A re-port from FM or copy-edit from a sibling
// repo could trivially re-leak "family-medicine" or peds textbook names
// (Goroll/Nelson/AFP) into the geriatric bot. These tests fail fast on that.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../scripts/chaos-doctor-bot-v4.mjs'),
  'utf8',
);

// Extract just the const-string bodies for the three SYS_DOCTOR prompts so
// the FM-sibling comments at lines 9 / 187 / 347 / 378 (legitimate context
// references) don't false-trigger.
function extractPrompt(name) {
  const re = new RegExp(`const ${name}\\s*=\\s*\`([\\s\\S]*?)\`;`, 'm');
  const m = SRC.match(re);
  if (!m) throw new Error(`could not locate ${name} prompt in chaos-doctor-bot-v4.mjs`);
  return m[1];
}

const PICK = extractPrompt('SYS_DOCTOR_PICK');
const JUDGE = extractPrompt('SYS_DOCTOR_JUDGE');
const EXPLAIN = extractPrompt('SYS_DOCTOR_EXPLAIN');  // v10.64.118 — audit-1 split
const SOURCE = extractPrompt('SYS_DOCTOR_SOURCE');

describe('chaos-doctor-bot v4 — Geri persona pins', () => {
  describe('SYS_DOCTOR_PICK', () => {
    it('persona is a geriatrician, not a family-medicine physician', () => {
      expect(PICK.toLowerCase()).toMatch(/\bgeriatrician\b/);
      expect(PICK.toLowerCase()).not.toMatch(/family.medicine|family.physician/);
    });
    it('names the exam (Shlav A, P005-2026)', () => {
      expect(PICK).toMatch(/Shlav A|P005-2026/);
    });
    it('cites Geri-canon textbooks (Hazzard / Harrison / GRS8)', () => {
      expect(PICK).toMatch(/Hazzard/);
    });
  });

  describe('SYS_DOCTOR_JUDGE (audit-3 — answer-correctness only)', () => {
    it('attending is geriatric, not family-medicine', () => {
      expect(JUDGE.toLowerCase()).toMatch(/geriatric medicine attending/);
      expect(JUDGE.toLowerCase()).not.toMatch(/family.medicine attending/);
    });
    it('app description references geriatric medicine, not family medicine', () => {
      // v10.64.118: phrasing shifted from "board prep" to "board-exam" with the
      // axis split. The geriatric-medicine framing remains; the family-medicine
      // exclusion remains the load-bearing assertion.
      expect(JUDGE.toLowerCase()).toMatch(/geriatric.medicine board.exam|geriatric medicine board prep/);
      expect(JUDGE.toLowerCase()).not.toMatch(/family.medicine board/);
    });
    it('evidence corpus is the geri-canon (Hazzard 8e / Harrison 22e / GRS8 / MOH)', () => {
      expect(JUDGE).toMatch(/Hazzard 8e/);
      expect(JUDGE).toMatch(/Harrison 22e/);
      expect(JUDGE).toMatch(/GRS8/);
    });
    it('axis-isolation: judge does NOT evaluate explanation prose (audit-1) or source citation (audit-2)', () => {
      // v10.64.118 axis-split contract: JUDGE handles only answer-correctness
      // (audit-3). The explicit "audit-1 separate / audit-2 separate" carve-out
      // is what stops the channel from rediscovering c-correctness as
      // "unsound explanation" (the 75% noise mode the 2026-05-13 pilot fixed).
      expect(JUDGE.toLowerCase()).toMatch(/audit-1.{0,40}separate|that's audit-1/);
      expect(JUDGE.toLowerCase()).toMatch(/audit-2.{0,40}separate|that's audit-2/);
    });
  });

  describe('SYS_DOCTOR_EXPLAIN (audit-1 — explanation-text soundness, v10.64.118)', () => {
    it('explicit axis-exclusion: assumes answer correct, judges text only', () => {
      // The load-bearing carve-out — without it, the channel rediscovers
      // c-correctness instead of explanation-text soundness.
      expect(EXPLAIN).toMatch(/ASSUME THE CLAIMED CORRECT ANSWER IS CORRECT/);
      expect(EXPLAIN.toLowerCase()).toMatch(/audit-3/);
    });
    it('three-axis decomposition is present', () => {
      // Sound-reasoning / distractor-accuracy / prose-well-formed.
      expect(EXPLAIN).toMatch(/1\..*[Ss]ound medical reasoning/);
      expect(EXPLAIN).toMatch(/2\..*distractors/);
      expect(EXPLAIN).toMatch(/3\..*Hebrew/);
    });
    it('output schema has axis_failures + sound + confidence', () => {
      expect(EXPLAIN).toMatch(/"axis_failures"/);
      expect(EXPLAIN).toMatch(/"sound"/);
      expect(EXPLAIN).toMatch(/"confidence"/);
    });
    it('no FM-sibling persona leak', () => {
      expect(EXPLAIN.toLowerCase()).not.toMatch(/family.medicine|goroll|nelson|\bafp\b/);
    });
  });

  describe('SYS_DOCTOR_SOURCE (audit-2 — ref-faithfulness, v10.64.118 redesign)', () => {
    it('Geri-canon present, no FM-textbook leak', () => {
      // v10.64.118: the source prompt's Geri-corpus markers shifted from
      // verbatim "Hazzard" / "Harrison" name-drops to "audit-grade chapter
      // assignment from question_chapters.json" + concrete Geri-canon
      // examples (Ch 88 CANCER, Ch 91 LUNG CANCER). The FM-leak guard
      // remains load-bearing.
      expect(SOURCE.toLowerCase()).toMatch(/hazzard|cancer|geriatric|audit-grade chapter/);
      expect(SOURCE).not.toMatch(/Goroll/);
      expect(SOURCE).not.toMatch(/Nelson/);
      expect(SOURCE).not.toMatch(/\bAFP\b/);
      expect(SOURCE).not.toMatch(/Lerner/);
    });
    it('axis-isolation: source does NOT evaluate explanation prose (audit-1) or answer correctness (audit-3)', () => {
      expect(SOURCE.toLowerCase()).toMatch(/audit-1/);
      expect(SOURCE.toLowerCase()).toMatch(/audit-3/);
    });
    it('peer-chapter carve-out is present (idx 1954 case)', () => {
      // The 1954-class carve-out — Ch 91 LUNG vs Ch 88 CANCER-GEN as
      // peer-chapter specificity, not chapter drift. Without this clause
      // the audit-2 channel re-flags curatorially-specific refs as false
      // positives (validated empirically 2026-05-13).
      expect(SOURCE.toLowerCase()).toMatch(/peer chapter|peer-chapter/);
    });
    it('takes audit-grade chapter assignment as INPUT (per the structural redesign)', () => {
      expect(SOURCE).toMatch(/audit-grade chapter assignment/);
    });
  });

  describe('citation regex', () => {
    // Two citation-regex sites (one on .quiz-source, one on explanation).
    // Pull the raw regex literal lines and assert each carries the Geri
    // textbook tokens, not FM ones. Using a loose match for the regex line
    // so we don't have to mirror its full character class here.
    it('uses the Geri textbook list (Hazzard / Harrison / GRS / Brookdale + Hebrew)', () => {
      const sites = SRC.split('\n').filter((ln) => /\.match\(\/\(/.test(ln) && /\\d\{1,3\}/.test(ln));
      expect(sites.length).toBeGreaterThanOrEqual(2);
      for (const site of sites) {
        expect(site).toMatch(/Hazzard/);
        expect(site).toMatch(/Harrison/);
        expect(site).toMatch(/GRS/);
        expect(site).not.toMatch(/Goroll/);
        expect(site).not.toMatch(/Nelson/);
        expect(site).not.toMatch(/\bAFP\b/);
      }
    });
  });

  describe('userPrompt3 framing (source-check user message)', () => {
    it('says "Hebrew geriatric medicine question", not family-medicine', () => {
      expect(SRC).toMatch(/Hebrew geriatric medicine question/);
      expect(SRC).not.toMatch(/Hebrew family.medicine question/);
    });
  });

  describe('no peds leak anywhere in prompt/code body', () => {
    // Strip line-comments (sibling-FM mentions live in comments and are correct).
    const codeOnly = SRC.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    it('no "Nelson" string in code (peds-leak from FM sibling)', () => {
      expect(codeOnly).not.toMatch(/Nelson/);
    });
    it('no "Goroll" string in code (FM-textbook leak)', () => {
      expect(codeOnly).not.toMatch(/Goroll/);
    });
    it('no "family-medicine" string in code', () => {
      expect(codeOnly.toLowerCase()).not.toMatch(/family.medicine/);
    });
  });
});
