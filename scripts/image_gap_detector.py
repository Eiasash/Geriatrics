#!/usr/bin/env python3
"""
Image Gap Detector — finds questions whose stems imply a missing visual.

Usage:
    python3 image_gap_detector.py <path-to-questions.json> <path-to-notes.json> [--out report.json]

Outputs:
    - Console summary ranked by topic
    - JSON report with every flagged question (id, topic, stem, matched triggers, priority)

Detection strategy:
    1. Regex library of image-implying phrases (EN + HE) grouped by modality
    2. Priority scoring: hard triggers (e.g. "shown in the figure") = P1, softer ("a CXR reveals") = P2
    3. Skip questions that already have img field
    4. Group results by topic, by modality, with exam-frequency weight
"""
import json
import re
import sys
import argparse
from collections import defaultdict, Counter

# --- TRIGGER LIBRARY ------------------------------------------------------

# P1 = almost certainly had an image in the original Q
# P2 = likely relies on visual pattern recognition
# P3 = could benefit from an image (lower confidence)

TRIGGERS = {
    # Direct image references
    "figure_reference": {
        "priority": 1,
        "modality": "unknown",
        "patterns": [
            r"\bshown in (?:the )?(?:figure|image|photo|picture)\b",
            r"\bsee (?:the )?(?:figure|image|photo|picture|attached)\b",
            r"\b(?:figure|image|photo) (?:below|above|shows|demonstrates)\b",
            r"\bin the (?:accompanying|following) (?:figure|image)\b",
            r"בתמונה\s*(?:ה)?(?:רצ|מצ|שלפ|הבאה)",
            r"רואים בתמונה",
            r"בצילום\s*(?:ה)?(?:רצ|מצ|שלפ)",
            r"בסריקה\s*(?:ה)?(?:רצ|מצ|שלפ)",
            r"מוצגת תמונה",
            r"בתרשים\s*(?:ה)?(?:רצ|מצ|שלפ|הבא)",
            r"בתרשים הבא",
        ],
    },
    # ECG
    "ecg": {
        "priority": 1,
        "modality": "ECG",
        "patterns": [
            r"\bECG (?:shows|reveals|demonstrates|is obtained|taken|performed)\b",
            r"\bEKG (?:shows|reveals|demonstrates|is obtained|taken|performed)\b",
            r"\b(?:the )?(?:ECG|EKG) (?:below|above|attached)\b",
            r"\b12-lead (?:ECG|EKG)\b.*(?:shows|reveals|demonstrates)",
            r"אק(?:״|\")?ג\s*(?:מראה|מתאר|מתועד|שנעשה|שבוצע|הבא|המצורף)",
            r"תרשים אק",
            r"ניטור אק(?:״|\")?ג",
            r"הולטר(?: אק)?",
        ],
    },
    # Chest X-ray
    "cxr": {
        "priority": 1,
        "modality": "CXR",
        "patterns": [
            r"\b(?:CXR|chest X-?ray|chest (?:radiograph|film))\s*(?:shows|reveals|demonstrates|is obtained)\b",
            r"\bchest radiograph\b.*(?:shows|reveals|demonstrates)",
            r"\bchest film\b.*(?:shows|reveals|demonstrates)",
            r"צילום חזה\s*(?:מראה|מתאר|הבא|המצורף|מדגים)",
            r"צילום ריאות\s*(?:מראה|מתאר|הבא|המצורף)",
        ],
    },
    # CT / MRI
    "ct_mri": {
        "priority": 1,
        "modality": "CT/MRI",
        "patterns": [
            r"\bCT (?:scan|of the|shows|reveals|demonstrates|brain|chest|abdomen|head)\b.{0,80}(?:shows|reveals|demonstrates|is obtained|mass|lesion|finding)",
            r"\bMRI (?:shows|reveals|demonstrates|of the|brain|spine)\b.{0,80}(?:shows|reveals|demonstrates|lesion|mass|finding)",
            r"\b(?:head|brain|abdominal|chest|pelvic) CT\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\bMR(?:I)? (?:angiogram|venogram|angiography)\b",
            r"CT\s*(?:של ה|מוח|בטן|חזה|ראש).{0,60}(?:מראה|מדגים|מתאר)",
            r"MRI\s*(?:של ה|מוח|עמוד שדרה).{0,60}(?:מראה|מדגים|מתאר)",
            r"דימות\s*(?:CT|MRI)",
            r"הדמיית\s*(?:CT|MRI|מוח|ראש|חזה|בטן)",
        ],
    },
    # Ultrasound
    "ultrasound": {
        "priority": 2,
        "modality": "US",
        "patterns": [
            r"\b(?:US|ultrasound|sonogram)\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\b(?:abdominal|renal|cardiac|pelvic) (?:US|ultrasound)\b.{0,50}(?:shows|reveals)",
            r"\becho(?:cardiogram|cardiography)?\b.{0,50}(?:shows|reveals|demonstrates)",
            r"אולטרה\s*סאונד.{0,60}(?:מראה|מדגים)",
            r"אקו\s*(?:לב)?\s*(?:מראה|מדגים|הראה)",
        ],
    },
    # Peripheral smear / histopath
    "microscopy": {
        "priority": 1,
        "modality": "Smear/Histopath",
        "patterns": [
            r"\b(?:peripheral (?:blood )?smear|blood smear)\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\bbone marrow (?:biopsy|aspirate|smear)\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\bbiopsy (?:shows|reveals|demonstrates|specimen)\b",
            r"\bhistopathology\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\b(?:microscopy|microscopic examination)\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\b(?:H&E|hematoxylin and eosin) stain\b",
            r"\b(?:Gram|Wright|Giemsa|acid-fast) stain\b.{0,50}(?:shows|reveals)",
            r"משטח (?:דם|היקפי).{0,40}(?:מראה|מדגים)",
            r"ביופסיה.{0,40}(?:מראה|מדגימה)",
            r"צביעת\s*(?:גראם|רייט|גימזה|H&E)",
            r"בדיקה מיקרוסקופית",
        ],
    },
    # Fundoscopy / eye
    "fundus": {
        "priority": 1,
        "modality": "Fundus/Eye",
        "patterns": [
            r"\bfundus(?:copy|copic)?\b.{0,50}(?:shows|reveals|demonstrates|examination)",
            r"\b(?:slit lamp|slit-lamp)\b.{0,50}(?:shows|reveals)",
            r"\bretinal (?:exam|examination|photograph)\b",
            r"\bophthalmoscop(?:y|ic)\b.{0,50}(?:shows|reveals)",
            r"בדיקת קרקעית\s*(?:העין|עיניים)",
            r"פונדוס(?:קופיה)?",
            r"אופטלמוסקופיה",
        ],
    },
    # Dermatology
    "derm": {
        "priority": 1,
        "modality": "Derm",
        "patterns": [
            r"\brash\b.{0,60}(?:shown|pictured|illustrated|described)",
            r"\bskin lesion\b.{0,60}(?:shown|pictured|demonstrated)",
            r"\b(?:erythematous|vesicular|bullous|papular|pustular|macular) (?:rash|lesion|eruption)\b",
            r"\bphotograph of (?:the )?(?:rash|lesion|skin)",
            r"פריחה\s*(?:כפי שנראת|המופיעה בתמונה|בתמונה)",
            r"נגע\s*עור(?:י)?\s*(?:המופיע|כפי שנראה)",
        ],
    },
    # EEG
    "eeg": {
        "priority": 1,
        "modality": "EEG",
        "patterns": [
            r"\bEEG\b.{0,50}(?:shows|reveals|demonstrates|recording)",
            r"\belectroencephalogra(?:m|phy)\b.{0,50}(?:shows|reveals)",
            r"אא(?:״|\")?ג.{0,40}(?:מראה|מדגים)",
        ],
    },
    # Other imaging
    "other_imaging": {
        "priority": 2,
        "modality": "Other imaging",
        "patterns": [
            r"\bPET(?:/CT)?\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\b(?:bone scan|bone scintigraphy|DEXA|DXA)\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\bmammogra(?:m|phy)\b.{0,50}(?:shows|reveals)",
            r"\b(?:colonoscopy|endoscopy|EGD|bronchoscopy)\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\bangiogra(?:m|phy)\b.{0,50}(?:shows|reveals|demonstrates)",
            r"\bV/Q scan\b",
            r"\bDEXA\b|\bDXA\b",  # word-bounded to avoid matching 'dexamethasone'
            r"קולונוסקופיה.{0,40}(?:מראה|מדגימה)",
            r"גסטרוסקופיה.{0,40}(?:מראה|מדגימה)",
            r"ממוגרפיה.{0,40}(?:מראה|מדגימה)",
            r"אנגיוגרפיה.{0,40}(?:מראה|מדגימה)",
            r"מיפוי עצמות",
            r"PET[-\s]?CT",
        ],
    },
    # Waveform / tracing
    "waveform": {
        "priority": 2,
        "modality": "Waveform",
        "patterns": [
            r"\b(?:pressure |flow |volume )?(?:tracing|waveform)\b",
            r"\bpressure-volume loop\b",
            r"\b(?:capnogra(?:m|phy)|spirometry|flow-volume loop)\b.{0,50}(?:shows|reveals)",
            r"ספירומטריה.{0,40}(?:מראה|מדגימה)",
            r"לולאת זרם-נפח",
        ],
    },
}

# Flatten triggers for fast matching
COMPILED = []
for group_name, group in TRIGGERS.items():
    for pat in group["patterns"]:
        COMPILED.append({
            "group": group_name,
            "priority": group["priority"],
            "modality": group["modality"],
            "regex": re.compile(pat, re.IGNORECASE | re.UNICODE),
        })


def scan_question(q):
    """Returns list of {group, modality, priority, match} triggers fired."""
    stem = q.get("q", "") or ""
    options = " ".join(q.get("o", []) if isinstance(q.get("o"), list) else [])
    text = f"{stem}\n{options}"
    hits = []
    seen_groups = set()
    for c in COMPILED:
        m = c["regex"].search(text)
        if m and c["group"] not in seen_groups:
            hits.append({
                "group": c["group"],
                "modality": c["modality"],
                "priority": c["priority"],
                "match": m.group(0)[:80],
            })
            seen_groups.add(c["group"])
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("questions", help="path to questions.json")
    ap.add_argument("notes", help="path to notes.json (for topic names)")
    ap.add_argument("--out", default=None, help="write JSON report to this path")
    ap.add_argument("--min-priority", type=int, default=2, help="report only P<=N (default 2)")
    args = ap.parse_args()

    qs = json.load(open(args.questions, encoding="utf-8"))
    notes = json.load(open(args.notes, encoding="utf-8"))
    topic_name = {n["id"]: n["topic"] for n in notes}

    total = len(qs)
    already_with_img = sum(1 for q in qs if q.get("img"))

    flagged = []
    for idx, q in enumerate(qs):
        if q.get("img"):
            continue
        hits = scan_question(q)
        if not hits:
            continue
        best_priority = min(h["priority"] for h in hits)
        if best_priority > args.min_priority:
            continue
        modalities = sorted({h["modality"] for h in hits})
        ti = q.get("ti")
        flagged.append({
            "idx": idx,
            "ti": ti,
            "topic": topic_name.get(ti, f"topic_{ti}"),
            "tag": q.get("t"),
            "priority": best_priority,
            "modalities": modalities,
            "triggers": hits,
            "stem_preview": (q.get("q") or "")[:180],
        })

    # --- Summary ---
    print(f"\n=== Image Gap Detector — {args.questions} ===")
    print(f"Total questions: {total}")
    print(f"Already have img: {already_with_img} ({100*already_with_img/total:.1f}%)")
    print(f"Flagged for missing image (P<={args.min_priority}): {len(flagged)} ({100*len(flagged)/total:.1f}%)")

    # By priority
    by_prio = Counter(f["priority"] for f in flagged)
    print(f"\nBy priority:")
    for p in sorted(by_prio):
        print(f"  P{p}: {by_prio[p]}")

    # By modality
    by_mod = Counter()
    for f in flagged:
        for m in f["modalities"]:
            by_mod[m] += 1
    print(f"\nBy modality:")
    for m, c in by_mod.most_common():
        print(f"  {m:20s} {c}")

    # By topic (top 15)
    by_topic = Counter(f["topic"] for f in flagged)
    print(f"\nTop topics with missing images:")
    for topic, c in by_topic.most_common(15):
        total_in_topic = sum(1 for q in qs if topic_name.get(q.get("ti")) == topic)
        pct = 100 * c / total_in_topic if total_in_topic else 0
        print(f"  {c:4d} / {total_in_topic:4d} ({pct:4.1f}%)  {topic}")

    # Write report
    if args.out:
        report = {
            "source": args.questions,
            "total_questions": total,
            "already_with_img": already_with_img,
            "flagged_count": len(flagged),
            "by_priority": dict(by_prio),
            "by_modality": dict(by_mod),
            "by_topic": dict(by_topic),
            "flagged": flagged,
        }
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(f"\nReport written to {args.out}")


if __name__ == "__main__":
    main()
