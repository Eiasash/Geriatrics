// Regression tests for chaos-doctor-bot v4 served↔canonical option
// resolution. Anchors the fix for the 2026-05-08 triage finding: ~240/241
// flagged questions were false positives caused by the bot mixing
// coordinate frames between the AI's letter space (display order, A..D)
// and `data-i` (canonical order in `q.o`).
//
// Smoking-gun reproduction: FM idx 84 ("ulcer over Medial Malleolus,
// most common cause"). Canonical `q.o[3] = "Venous Insufficiency"` and
// `q.c = 3`. The bot served:
//
//   [A] Venous Insufficiency      data-i=3
//   [B] ANCA associated Vasculitis data-i=2
//   [C] Atherosclerosis            data-i=0
//   [D] Arterial Hypertension      data-i=1
//
// `detectAppCorrectIdx` returns 3 (canonical, the .ok button's data-i).
// The pre-fix bot wrote "App claims D" (`'ABCD'[3]`) which the judge
// model interpreted against served labels — D was Arterial Hypertension.
// False-positive "drift" verdict followed.
//
// See `~/repos/.audit_logs/triage_2026-05-08/REPORT_2026-05-10.md` for
// the full pattern. Do NOT delete these tests without first re-reading
// that report.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canonicalToDisplay,
  displayToCanonical,
  resolveAppVerdict,
  textResolveAgainstQZ,
} from '../scripts/lib/optionResolver.mjs';

describe('chaos-doctor-bot v4 optionResolver — coordinate-frame translation', () => {
  // The canonical FM idx 84 served-options snapshot, taken verbatim from
  // the chaos-reports JSONL on 2026-05-08T05:01:49.832Z (run id
  // v4-overnight-20260508T045637-fix3).
  const fmIdx84Served = [
    { idx: 3, text: 'Venous Insufficiency' },
    { idx: 2, text: 'ANCA associated Vasculitis' },
    { idx: 0, text: 'Atherosclerosis' },
    { idx: 1, text: 'Arterial Hypertension' },
  ];

  describe('canonicalToDisplay', () => {
    it('locates a canonical idx at its served display position', () => {
      // canonical 3 (Venous Insufficiency) is at display position 0 (A)
      expect(canonicalToDisplay(fmIdx84Served, 3)).toBe(0);
      // canonical 1 (Arterial Hypertension) is at display position 3 (D)
      expect(canonicalToDisplay(fmIdx84Served, 1)).toBe(3);
    });

    it('returns null when the canonical idx is not in served options', () => {
      expect(canonicalToDisplay(fmIdx84Served, 99)).toBeNull();
    });

    it('handles invalid input shapes', () => {
      expect(canonicalToDisplay(null, 0)).toBeNull();
      expect(canonicalToDisplay([], 0)).toBeNull();
      expect(canonicalToDisplay(fmIdx84Served, null)).toBeNull();
    });

    it('matches even when idx came in as a string (data-i is text)', () => {
      const stringy = [{ idx: '3', text: 'a' }, { idx: '0', text: 'b' }];
      expect(canonicalToDisplay(stringy, 3)).toBe(0);
      expect(canonicalToDisplay(stringy, 0)).toBe(1);
    });
  });

  describe('displayToCanonical', () => {
    it('translates a display position to the canonical data-i value', () => {
      // display position 0 → canonical 3
      expect(displayToCanonical(fmIdx84Served, 0)).toBe(3);
      // display position 3 → canonical 1
      expect(displayToCanonical(fmIdx84Served, 3)).toBe(1);
    });

    it('returns null on out-of-range display positions', () => {
      expect(displayToCanonical(fmIdx84Served, -1)).toBeNull();
      expect(displayToCanonical(fmIdx84Served, 4)).toBeNull();
      expect(displayToCanonical(fmIdx84Served, null)).toBeNull();
    });

    it('is the inverse of canonicalToDisplay across all served indices', () => {
      for (let i = 0; i < fmIdx84Served.length; i++) {
        const canon = displayToCanonical(fmIdx84Served, i);
        expect(canonicalToDisplay(fmIdx84Served, canon)).toBe(i);
      }
    });
  });

  describe('resolveAppVerdict — the FM idx 84 smoking-gun scenario', () => {
    it('resolves canonical idx 3 to display letter A with the correct option text', () => {
      // The bot's `appIdx` is canonical 3 (data-i on the .ok button).
      // The judge model sees options labeled in DISPLAY order (A=Venous,
      // B=ANCA, C=Athero, D=ArtHTN). The pre-fix bot wrote "App claims D"
      // and quoted Arterial Hypertension; the post-fix bot must write
      // "App claims A (Venous Insufficiency)".
      const verdict = resolveAppVerdict(fmIdx84Served, 3);
      expect(verdict).not.toBeNull();
      expect(verdict.displayIdx).toBe(0);
      expect(verdict.displayLetter).toBe('A');
      expect(verdict.canonicalText).toBe('Venous Insufficiency');
      // Anti-regression: the verdict must NOT quote Arterial Hypertension
      // (the served-position-3 occupant in the buggy frame).
      expect(verdict.canonicalText).not.toBe('Arterial Hypertension');
    });

    it('returns null when appIdx cannot be located (defensive)', () => {
      expect(resolveAppVerdict(fmIdx84Served, null)).toBeNull();
      expect(resolveAppVerdict(fmIdx84Served, 99)).toBeNull();
      expect(resolveAppVerdict([], 3)).toBeNull();
    });

    it('handles identity (unshuffled) options correctly — Geri-style display frame', () => {
      // When canonical idx == display position (no shuffle), the resolver
      // collapses to identity. This pins the contract that the resolver
      // is safe to wrap around bots that already operate in display frame
      // (e.g. Geri's monolith renders <button onclick="pick(origI)"> in
      // shuffled DOM order but exposes no `data-i`, so the bot's
      // `option.idx` falls back to the loop counter == display position).
      const identity = [
        { idx: 0, text: 'Aleph' },
        { idx: 1, text: 'Bet' },
        { idx: 2, text: 'Gimel' },
        { idx: 3, text: 'Dalet' },
      ];
      for (let i = 0; i < 4; i++) {
        const v = resolveAppVerdict(identity, i);
        expect(v.displayIdx).toBe(i);
        expect(v.displayLetter).toBe('ABCD'[i]);
        expect(v.canonicalText).toBe(identity[i].text);
      }
    });

    it('respects custom letter tables (>=5 options for GRS8 imports)', () => {
      const fiveOpts = [
        { idx: 4, text: 'epsilon' },
        { idx: 0, text: 'alpha' },
        { idx: 1, text: 'beta' },
        { idx: 2, text: 'gamma' },
        { idx: 3, text: 'delta' },
      ];
      const v = resolveAppVerdict(fiveOpts, 4, ['A', 'B', 'C', 'D', 'E']);
      expect(v.displayLetter).toBe('A');
      expect(v.canonicalText).toBe('epsilon');
    });
  });

  describe('end-to-end: judge-prompt sentence reconstruction', () => {
    // This is the primary contract test: given the FM idx 84 record, the
    // bot's judge prompt must include the canonical option text — not
    // the served-position-N text under the old appIdx-as-letter mapping.
    it('FM idx 84: judge sentence quotes Venous Insufficiency, not Arterial Hypertension', () => {
      const appIdx = 3; // canonical, data-i on the .ok button
      const verdict = resolveAppVerdict(fmIdx84Served, appIdx);
      const judgeSentence = `App's claimed correct answer: ${verdict.displayLetter} (${verdict.canonicalText})`;
      expect(judgeSentence).toBe("App's claimed correct answer: A (Venous Insufficiency)");
      expect(judgeSentence).not.toContain('Arterial Hypertension');
      expect(judgeSentence).not.toMatch(/\(D\)|claimed correct answer: D/);
    });
  });

  // ============================================================
  // 2026-05-13: Geri JSONL schema contract — optionCanonicalIdx
  // is emitted as null because Geri's DOM has no data-i, so the
  // identity placeholder was a type-correct lie that silently
  // mislead downstream consumers (dedup keys, audit-3 lookups).
  // See chaos-doctor-bot-v4.mjs:456 comment + the 2026-05-13
  // calibration pilot for the surfacing run.
  // ============================================================
  describe('Geri JSONL schema contract: optionCanonicalIdx is null', () => {
    it('bot source emits null at the JSONL record site (file-level pin)', () => {
      // Reading the source file is the most reliable contract pin —
      // refactors that re-introduce the identity-array emission will
      // fail this test even if the bot is never executed in CI.
      const src = readFileSync(
        new URL('../scripts/chaos-doctor-bot-v4.mjs', import.meta.url),
        'utf-8'
      );
      // Find the record-finding block and confirm the field is null.
      const recordBlock = src.match(/optionCanonicalIdx:[^,\n]*/);
      expect(recordBlock).not.toBeNull();
      expect(recordBlock[0]).toMatch(/optionCanonicalIdx:\s*null/);
      // Anti-regression: the identity-array form must NOT reappear.
      expect(recordBlock[0]).not.toMatch(/q\.options\.map/);
    });
  });

  describe('textResolveAgainstQZ — sanctioned consumer-side mapping helper', () => {
    // The use case: a JSONL post-processor (audit-3 dedup, c-flip
    // candidate generator, threshold-tuning script) reads a Geri row
    // where `optionCanonicalIdx: null` and needs to recover the
    // display→canonical mapping. Substring-matching against QZ[idx].o
    // is slow but correct; the alternative (assuming identity) silently
    // produces wrong dedup keys and was the surfacing bug in the
    // 2026-05-13 v4-long calibration pilot triage.

    it('recovers the canonical permutation from shuffled Geri-frame options', () => {
      // Real Geri row: NSCLC esophagitis (QZ idx 1913, c=3).
      // Canonical order: [PEG, TPN, NG tube, speech path]
      // Display order seen by bot: [speech path, TPN, NG tube, PEG]
      // Expected display→canonical map: [3, 1, 2, 0]
      const display = [
        'טיפול אינטנסיבי בבליעה עם פתולוג תקשורת (speech pathologist)',
        'תזונה פרנטרלית מלאה (TPN)',
        'האכלה דרך NG tube',
        'הנחת PEG tube',
      ];
      const canonical = [
        'הנחת PEG tube',
        'תזונה פרנטרלית מלאה (TPN)',
        'האכלה דרך NG tube',
        'טיפול אינטנסיבי בבליעה עם פתולוג תקשורת (speech pathologist)',
      ];
      expect(textResolveAgainstQZ(display, canonical)).toEqual([3, 1, 2, 0]);
    });

    it('Geri-frame and FM-frame inputs produce the same canonical mapping', () => {
      // For an FM row (carries data-i directly), the canonical mapping is:
      const fmCanonical = fmIdx84Served.map((o) => o.idx);
      // For an equivalent Geri row (same options shuffled the same way
      // but no data-i), textResolveAgainstQZ should produce the same
      // permutation when given the QZ canonical order.
      const displayTexts = fmIdx84Served.map((o) => o.text);
      const canonicalOrdered = [
        fmIdx84Served.find((o) => o.idx === 0).text, // canonical 0
        fmIdx84Served.find((o) => o.idx === 1).text,
        fmIdx84Served.find((o) => o.idx === 2).text,
        fmIdx84Served.find((o) => o.idx === 3).text,
      ];
      const geriResolved = textResolveAgainstQZ(displayTexts, canonicalOrdered);
      expect(geriResolved).toEqual(fmCanonical);
    });

    it('handles truncation (bot stores text.slice(0,120))', () => {
      // The bot truncates option text in the JSONL row to 120 chars.
      // The resolver must tolerate prefix matches when display is
      // strictly shorter than canonical.
      const canonical = ['Standard of care is broad-spectrum antibiotic coverage with vancomycin plus piperacillin-tazobactam'];
      const display = ['Standard of care is broad-spectrum antibiotic coverage with']; // truncated
      expect(textResolveAgainstQZ(display, canonical)).toEqual([0]);
    });

    it('returns null in slots where no match is found (truncation OR drift)', () => {
      const display = ['Aleph', 'Bet', 'unknown-option'];
      const canonical = ['Aleph', 'Bet', 'Gimel'];
      expect(textResolveAgainstQZ(display, canonical)).toEqual([0, 1, null]);
    });

    it('handles invalid input shapes (defensive)', () => {
      expect(textResolveAgainstQZ(null, ['a'])).toEqual([]);
      expect(textResolveAgainstQZ(['a'], null)).toEqual([]);
      expect(textResolveAgainstQZ(['a'], [])).toEqual([null]);
      expect(textResolveAgainstQZ([null, 'b'], ['a', 'b'])).toEqual([null, 1]);
    });

    it('refuses spurious prefix matches under 20 chars (avoids false positives)', () => {
      // A 3-char display string is not a safe prefix match for a 50-char
      // canonical even if it happens to match. Threshold is min 20 chars
      // on the shorter side.
      const display = ['Yes'];
      const canonical = ['Yes, with reservations about renal dosing in CKD-3a patients'];
      // 'Yes' is 3 chars — too short for safe prefix match.
      expect(textResolveAgainstQZ(display, canonical)).toEqual([null]);
    });
  });
});
