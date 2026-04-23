#!/usr/bin/env python3
"""
sept24_basis_fix.py — Apply c-value + img-URL fixes for Sept 30 2024 basis exam.

Uses VERIFIED idx mappings (not algorithmic matching). Each change is explicit.
Answer key source: IMA revised key (לאחר ערעור), publication 138.

Usage:
    python3 sept24_basis_fix.py              # dry run, print diff
    python3 sept24_basis_fix.py --apply      # write changes to questions.json
"""
import json, sys
from pathlib import Path

REPO = Path('/home/claude/Geriatrics')
WORK = Path('/home/claude/sept24_work')
QJ = REPO / 'data' / 'questions.json'
BACKUP = WORK / 'questions.before_fix.json'

IMG_BASE = "https://krmlzwwelqvlfslwltol.supabase.co/storage/v1/object/public/question-images"

# Verified idx → fix mapping for Sept 30 2024 basis exam
# Each entry: (q_num_in_PDF, idx_in_questions_json, fix_dict)
# fix_dict supports: 'c' (new c value), 'img' (new img URL), 'accepted' (list for documentation)
# Match verified by manual inspection of question text + answer options
FIXES = [
    # --- Image URL fixes (point to correct Sept 2024 basis files) ---
    # Q8: 90yo face skin lesion. Currently points to geri_2024_al_q8.png (wrong — that's על version).
    (8, 286, {
        'img': f"{IMG_BASE}/geri_Sep24_al_q8_tmuna1.jpeg",
        'accepted': [1],
        'c': 1,
        'reason': 'Q8 img was geri_2024_al_q8.png; should be Sep24 al file'}),

    # Q31: PVD foot wound. Two entries exist (idx=309 מאי24, idx=437 ספט24).
    # Answer key: כל התשובות מתקבלות (all 4 accepted). Current c=3 and c=2 both "correct".
    # Just fix img URLs on both.
    (31, 309, {
        'img': f"{IMG_BASE}/geri_Sep24_al_q31_tmuna2.jpeg",
        'accepted': [0, 1, 2, 3],
        'reason': 'Q31 May24 duplicate — link to Sep24 img'}),
    (31, 437, {
        'img': f"{IMG_BASE}/geri_Sep24_al_q31_tmuna2.jpeg",
        'accepted': [0, 1, 2, 3],
        'reason': 'Q31 Sep24 — link to Sep24 img'}),

    # Q53: pressure ulcer dressing. idx=444 (ספט 24) already correct. No change.
    # Answer key: א+ב accepted. Current c=0 ✓

    # Q69: Bullous pemphigoid. idx=449 (ספט 24) already correct ✓

    # Q93: Ogilvie. idx=462. URL is 'geri_Sep24_shared_q93_tmuna5.jpeg' — keep (also valid).
    # Also idx=370 (מאי 24) — same question, link it too
    (93, 462, {
        'img': f"{IMG_BASE}/geri_Sep24_al_q93_tmuna5.jpeg",
        'c': 1,
        'accepted': [1],
        'reason': 'Q93 standardize URL to al_q93_tmuna5'}),
    (93, 370, {
        'img': f"{IMG_BASE}/geri_Sep24_al_q93_tmuna5.jpeg",
        'c': 1,
        'accepted': [1],
        'reason': 'Q93 May24 dupe - link to Sep24 img'}),

    # Q102: blood smear. idx=379 (מאי 24). Current c=3, CORRECT c=1 (B12 deficiency).
    (102, 379, {
        'c': 1,
        'img': f"{IMG_BASE}/geri_Sep24_basis_extra_q102_tmuna6.jpeg",
        'accepted': [1],
        'reason': 'Q102 WRONG c=3, correct=1 (B12 def). Link img.'}),

    # Q110: ECG. idx=387 (מאי 24). Current c=2, CORRECT c=1 (Citalopram → QT).
    (110, 387, {
        'c': 1,
        'img': f"{IMG_BASE}/geri_Sep24_basis_extra_q110_tmuna7.jpeg",
        'accepted': [1],
        'reason': 'Q110 WRONG c=2, correct=1 (Citalopram). Fix img URL.'}),

    # Q115: VT rhythm. idx=392 (מאי 24). c=2 ✓. Fix img URL.
    (115, 392, {
        'img': f"{IMG_BASE}/geri_Sep24_basis_extra_q115_tmuna8.jpeg",
        'c': 2,
        'accepted': [2],
        'reason': 'Q115 img was q131_tmuna8 (wrong); should be q115_tmuna8'}),

    # Q144: hypercalcemia ECG. idx=420 (מאי 24). Current c=3, CORRECT c=1 (hypercalcemia).
    (144, 420, {
        'c': 1,
        'img': f"{IMG_BASE}/geri_Sep24_basis_extra_q144_tmuna9.jpeg",
        'accepted': [1],
        'reason': 'Q144 WRONG c=3, correct=1 (hypercalcemia, not hyperkalemia)'}),

    # --- Additional c-value fixes from revised key (no image) ---
    # Q54: RA criteria. Current c=1, correct c=2 (elderly woman with bilateral hand synovitis + RF pos)
    (54, 373, {'c': 2, 'accepted': [2], 'reason': 'Q54 WRONG c=1, correct=2 (Option ג per answer key)'}),

    # Q62: antipsychotic start. Current c=3, correct c=2 (hip fracture patient pulling medical equipment)
    (62, 459, {'c': 2, 'accepted': [2], 'reason': 'Q62 WRONG c=3, correct=2 (option ג per answer key)'}),

    # Q103: pleural fluid. Current c=0, correct c=3 (RA - low glucose)
    (103, 380, {'c': 3, 'accepted': [3], 'reason': 'Q103 WRONG c=0, correct=3 (RA pleural - low glucose)'}),

    # Q105: rectal pain + diarrhea. Current c=1, correct c=0 (rectal exam first)
    (105, 382, {'c': 0, 'accepted': [0], 'reason': 'Q105 WRONG c=1, correct=0 (rectal exam first)'}),

    # Q108: endocarditis prophylaxis for TAVI pt + colonoscopy. Current c=0, correct c=3 (no ppx needed)
    (108, 385, {'c': 3, 'accepted': [3], 'reason': 'Q108 WRONG c=0, correct=3 (no IE prophylaxis indicated)'}),

    # Q109: Takotsubo. Current c=0 (anterior wall), correct c=1 (ST elevation)
    (109, 386, {'c': 1, 'accepted': [1], 'reason': 'Q109 WRONG c=0, correct=1 (ST elevation typical)'}),

    # Q111: pulsus paradoxus. Current c=1, correct c=2 (severe COPD)
    (111, 388, {'c': 2, 'accepted': [2], 'reason': 'Q111 WRONG c=1, correct=2 (severe COPD)'}),

    # Q112: bloody diarrhea. Current c=1 (rotavirus), correct c=2 (E.coli after family meal)
    (112, 389, {'c': 2, 'accepted': [2], 'reason': 'Q112 WRONG c=1, correct=2 (E.coli EHEC)'}),

    # Q114: late MI complication. Current c=2, correct c=0 (LV aneurysm)
    (114, 391, {'c': 0, 'accepted': [0], 'reason': 'Q114 WRONG c=2, correct=0 (LV aneurysm is late)'}),

    # Q119: congenital bleeding PT 17 INR 1.9 PTT normal. Current c=1, correct c=0 (Factor VII)
    (119, 396, {'c': 0, 'accepted': [0], 'reason': 'Q119 WRONG c=1, correct=0 (isolated PT prolongation = F VII def)'}),

    # Q120: ascites. Current c=0, correct c=1 (SAAG ≥1.1 → portal HTN)
    (120, 397, {'c': 1, 'accepted': [1], 'reason': 'Q120 WRONG c=0, correct=1 (SAAG ≥1.1 = portal HTN)'}),

    # Q122: IPF (UIP). Current c=2, correct c=0 (honeycombing on HRCT)
    (122, 399, {'c': 0, 'accepted': [0], 'reason': 'Q122 WRONG c=2, correct=0 (honeycombing)'}),

    # Q125: variceal bleed in cirrhosis. Current c=1, correct c=2 (20-30% mortality counseling)
    (125, 402, {'c': 2, 'accepted': [2], 'reason': 'Q125 WRONG c=1, correct=2'}),

    # Q126: post-splenectomy. Current c=0, correct c=1 (3-5% lifetime severe infection)
    (126, 403, {'c': 1, 'accepted': [1, 2], 'reason': 'Q126 WRONG c=0, correct=1 or 2 (lifetime 3-5% severe infection)'}),

    # Q127: B12 deficiency markers. Current c=3, correct c=0 (low retic index)
    (127, 404, {'c': 0, 'accepted': [0, 2], 'reason': 'Q127 WRONG c=3, correct=0 or 2'}),

    # Q129: HOCM murmur. Current c=0, correct c=2 (mid-systolic)
    (129, 406, {'c': 2, 'accepted': [2], 'reason': 'Q129 WRONG c=0, correct=2 (mid-systolic)'}),

    # Q130: OSA CPAP. Current c=3, correct c=2 (nasal congestion is CPAP side effect)
    (130, 407, {'c': 2, 'accepted': [2], 'reason': 'Q130 WRONG c=3, correct=2 (nasal congestion is CPAP SE)'}),

    # Q131: TAVI vs surgical AVR. Current c=3, correct c=2 (higher pacemaker rate post-TAVI)
    (131, 408, {'c': 2, 'accepted': [2], 'reason': 'Q131 WRONG c=3, correct=2 (TAVI → higher pacemaker rate)'}),

    # Q132: H. pylori post-ulcer Rx. Current c=1, correct c=3 (liquids 48h post-endoscopy)
    (132, 409, {'c': 3, 'accepted': [3], 'reason': 'Q132 WRONG c=1, correct=3 (liquids 48h)'}),

    # Q133: polyuria with SIADH-like pattern. Current c=0, correct c=2 (hypercalcemia from paraneoplastic)
    (133, 410, {'c': 2, 'accepted': [2], 'reason': 'Q133 WRONG c=0, correct=2 (hypercalcemia)'}),

    # Q136: Gout. Current c=0, correct c=2 (upper extremity in elderly)
    (136, 413, {'c': 2, 'accepted': [2], 'reason': 'Q136 WRONG c=0, correct=2 (hands/wrist/elbow in elderly)'}),

    # Q137: thrombosis in nephrotic syndrome. Current c=2, correct c=1 (AT-III loss via kidney)
    (137, 414, {'c': 1, 'accepted': [1], 'reason': 'Q137 WRONG c=2, correct=1 (loss of anticoag factors)'}),

    # Q138: massive hemoptysis. Current c=3, correct c=0 (bronchial artery embolization)
    (138, 415, {'c': 0, 'accepted': [0], 'reason': 'Q138 WRONG c=3, correct=0 (embolization first)'}),

    # Q139: cardiac cirrhosis ABG. Current c=1, correct c=2 (high AG metabolic acidosis)
    (139, 416, {'c': 2, 'accepted': [2], 'reason': 'Q139 WRONG c=1, correct=2 (HAG MAc)'}),

    # Q141: alcoholic hepatitis. Current c=3, correct c=1 (28-day steroids if response)
    (141, 418, {'c': 1, 'accepted': [1], 'reason': 'Q141 WRONG c=3, correct=1 (28-day steroid course)'}),

    # Q142: cancer & infection. Current c=0, correct c=1 (Colon CA → Strep bovis)
    (142, 419, {'c': 1, 'accepted': [1], 'reason': 'Q142 WRONG c=0, correct=1 (Strep bovis - colon CA)'}),

    # Q145: hyperkalemia protocol. Current c=1 (furosemide), correct c=0 (NaHCO3 IV is NOT standard)
    (145, 421, {'c': 0, 'accepted': [0], 'reason': 'Q145 WRONG c=1, correct=0 (NaHCO3 50ml not standard)'}),

    # Q148: SOFA score. Current c=0 (platelets), correct c=3 (respiratory rate not in SOFA - it's qSOFA)
    (148, 424, {'c': 3, 'accepted': [3], 'reason': 'Q148 WRONG c=0, correct=3 (RR is qSOFA not SOFA)'}),

    # Q149: FUO workup. Current c=0 (US), correct c=2 (ANA is in workup)
    (149, 425, {'c': 2, 'accepted': [2, 3], 'reason': 'Q149 WRONG c=0, correct=2 or 3'}),

    # Q72: RF. Current c=2, correct c=0
    (72, 577, {'c': 0, 'accepted': [0], 'reason': 'Q72 WRONG c=2, correct=0'}),

    # Q104: Tumor lysis syndrome. Current c=0, correct c=1
    (104, 579, {'c': 1, 'accepted': [1], 'reason': 'Q104 WRONG c=0, correct=1'}),

    # Q128: aminoglycoside. Current c=3, correct c=1 (can appear a week later)
    (128, 759, {'c': 1, 'accepted': [1], 'reason': 'Q128 WRONG c=3, correct=1'}),

    # Q135: PBC. Current c=1, correct c=2
    (135, 590, {'c': 2, 'accepted': [2], 'reason': 'Q135 WRONG c=1, correct=2'}),
]

def main():
    apply = '--apply' in sys.argv
    with open(QJ, encoding='utf-8') as f:
        qs = json.load(f)
    if apply and not BACKUP.exists():
        with open(BACKUP, 'w', encoding='utf-8') as f:
            json.dump(qs, f, ensure_ascii=False, indent=1)
        print(f"Backup saved: {BACKUP}")

    changes_applied = 0
    mismatches = []

    for q_num, idx, fix in FIXES:
        if idx >= len(qs):
            mismatches.append(f"Q{q_num}: idx={idx} out of range")
            continue
        q = qs[idx]
        changes_this = []
        for field in ('c', 'img'):
            if field in fix:
                current = q.get(field, None)
                if current != fix[field]:
                    changes_this.append(f"{field}: {current!r} → {fix[field]!r}")

        if changes_this:
            print(f"\nQ{q_num} @ idx={idx} [{q.get('t')}]")
            print(f"  Reason: {fix.get('reason','')}")
            for c in changes_this:
                print(f"    {c}")
            print(f"  q: {q.get('q','')[:100]}")

            if apply:
                if 'c' in fix: qs[idx]['c'] = fix['c']
                if 'img' in fix: qs[idx]['img'] = fix['img']
                changes_applied += 1

    if mismatches:
        print("\n=== MISMATCHES ===")
        for m in mismatches:
            print(f"  {m}")

    print(f"\n=== SUMMARY ===")
    print(f"Total fixes planned: {len(FIXES)}")
    if apply:
        print(f"Applied: {changes_applied}")
        with open(QJ, 'w', encoding='utf-8') as f:
            json.dump(qs, f, ensure_ascii=False, indent=1)
        print(f"Wrote: {QJ}")
    else:
        print("DRY RUN — no changes written. Use --apply to commit.")

if __name__ == '__main__':
    main()
