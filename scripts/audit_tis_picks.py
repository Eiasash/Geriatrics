#!/usr/bin/env python3
"""
scripts/audit_tis_picks.py — flag suspicious tis[] picks for human review.

Heuristics catch the most likely failure modes of the v10.42 reclassifier:

  H1. Conflict-of-keywords: stem strongly mentions a specific topic by Hebrew
      keyword, but that topic is not in the picked tis[]. e.g. a stem with
      "פרקינסון" but ti=40 is missing → likely wrong.

  H2. Topic 0 (Biology of Aging) reverse: was the historical dumping ground.
      If we now picked ti=0 as primary, double-check it's actually about
      basic biology of aging, not just a passing mention.

  H3. Topic 43 (Andropause): the model was prompted to consider it, and may
      pick it for any Q mentioning testosterone/libido even when central
      topic is something else (Diabetes ED, BPH, etc.).

  H4. Tertiary >2 hops away: when tis is [primary, secondary, tertiary]
      and tertiary is in a totally unrelated domain (e.g. cardiology Q with
      tertiary=Patient Rights), the model probably hallucinated the third pick.

Output: docs/tis_audit_flags.md grouped by heuristic. Triage manually.
"""

import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
QPATH = ROOT / "data" / "questions.json"

TOPICS = [
    "Biology of Aging", "Demography", "CGA", "Frailty", "Falls", "Delirium",
    "Dementia", "Depression", "Polypharmacy", "Nutrition", "Pressure Injuries",
    "Incontinence", "Constipation", "Sleep", "Pain", "Osteoporosis", "OA",
    "CV Disease", "Heart Failure", "HTN", "Stroke", "COPD", "Diabetes",
    "Thyroid", "CKD", "Anemia", "Cancer", "Infections", "Palliative", "Ethics",
    "Elder Abuse", "Driving", "Guardianship", "Patient Rights",
    "Advance Directives", "Community/LTC", "Rehab", "Vision/Hearing", "Periop",
    "Geri EM", "Parkinson's", "Arrhythmia", "Dysphagia",
    "Andropause", "Prevention", "Interdisciplinary Care",
]

# Keyword anchors per topic (Hebrew + English). VERY conservative — these
# should appear ONLY when the topic is central, not as passing labs/vitals.
# E.g. "creatinine" alone is too weak (every comprehensive panel mentions it),
# but "CKD stage" or "dialysis-dependent" is unambiguous.
TOPIC_ANCHORS = {
    5: [r"\bdelirium\b", r"דליריום", r"\bCAM-ICU\b", r"בלבול חריף", r"hyperactive delirium", r"hypoactive delirium"],
    6: [r"\balzheimer", r"אלצהיימר", r"\bdementia\b", r"דמנציה", r"קיהיון", r"\bMMSE\b", r"\bMoCA\b"],
    7: [r"\bdepression\b", r"דיכאון", r"\bGDS-15\b", r"major depressive"],
    11: [r"\burinary incontinence\b", r"אי-נקיטת שתן", r"שלפוחית רגיזה", r"detrusor instability", r"stress incontinence"],
    14: [r"\bchronic pain\b", r"כאב כרוני", r"WHO ladder", r"opioid rotation"],
    15: [r"\bosteoporosis\b", r"אוסטאופורוזיס", r"צפיפות עצם", r"\bDXA\b", r"T-score", r"bisphosphonate therapy"],
    18: [r"\bHFrEF\b", r"\bHFpEF\b", r"\bheart failure\b", r"אי ספיקת לב", r"ejection fraction"],
    19: [r"\bSPRINT trial", r"\bHYVET\b", r"resistant hypertension", r"\buncontrolled hypertension\b"],
    20: [r"\bischemic stroke\b", r"שבץ איסכמי", r"\btPA\b", r"thrombolys", r"\bMCA territory\b"],
    22: [r"\bdiabetes mellitus\b", r"סוכרת", r"\bHbA1c\b", r"diabetic neuropathy"],
    24: [r"\bCKD stage\b", r"\beGFR\s*<", r"dialysis-dependent", r"acute kidney injury", r"\bAKI\b"],
    25: [r"\bIDA\b", r"iron deficiency anemia", r"\bB12 deficiency\b", r"מחסור ב-B12"],
    27: [r"\bUTI\b", r"\bsepsis\b", r"\bbacteremia\b", r"\bpneumonia\b", r"\bcellulitis\b"],
    28: [r"\bpalliati", r"\bhospice\b", r"הנוטה למות", r"end-of-life care", r"comfort care"],
    31: [r"\bdriving fitness\b", r"כשירות לנהיגה", r"רישיון נהיגה", r"\bDMV\b"],
    34: [r"\badvance directive", r"הנחיות מקדימות", r"living will", r"\bDNR order\b"],
    40: [r"\bparkinson", r"פרקינסון", r"\blevodopa\b", r"\bL-DOPA\b", r"\bUPDRS\b", r"רעד במנוחה"],
    41: [r"atrial fibrillation", r"פרפור עליות", r"\bAFib\b", r"\bCHA2DS2", r"ventricular tachycardia"],
    42: [r"\bdysphagia\b", r"הפרעת בליעה", r"aspiration pneumonia", r"\bVFSS\b"],
}

# Topics whose tis-tertiary is rarely justified and often hallucinated
SUSPECT_TERTIARY = {33, 35, 45}  # Patient Rights, Community/LTC, Interdisciplinary

def stem_text(q):
    parts = [q.get("q", "") or ""]
    for o in q.get("o", []):
        parts.append(str(o))
    parts.append(q.get("e", "") or "")
    return "\n".join(parts)


def main():
    questions = json.loads(QPATH.read_text())
    flags = defaultdict(list)
    for i, q in enumerate(questions):
        tis = q.get("tis") or [q.get("ti")]
        if not tis:
            continue
        text = stem_text(q)
        primary = tis[0]

        # H1. Conflict-of-keywords
        for ti, pats in TOPIC_ANCHORS.items():
            if ti in tis:
                continue
            for pat in pats:
                if re.search(pat, text, re.IGNORECASE):
                    flags["H1_anchor_missed"].append({
                        "i": i, "tis": tis, "missed": ti,
                        "matched": pat, "stem": q.get("q", "")[:140],
                    })
                    break

        # H2. Reverse Biology of Aging
        if primary == 0:
            # Suspicious if NO biology-of-aging keywords in stem.
            # Hebrew: הזדקנות, גיל המבוגר, שינויים נורמלים בגיל
            biology_kw = (
                r"telomer|senescen|hayflick|caloric restriction|biology of aging|"
                r"aging biology|aging brain|normal aging|aging-related|הזדקנות|"
                r"גיל המבוגר|שינויים נורמליים|שינוי נורמלי בגיל|הזדקנות תקינה|"
                r"שינויים בגיל"
            )
            if not re.search(biology_kw, text, re.IGNORECASE):
                flags["H2_biology_dump"].append({
                    "i": i, "tis": tis, "stem": q.get("q", "")[:140],
                })

        # H3. Andropause overreach
        if 43 in tis and primary != 43:
            # Check if it's actually testosterone/erectile-focused
            if not re.search(r"testosteron|hypogonad|erectile|libido|androp", text, re.IGNORECASE):
                flags["H3_andropause_phantom"].append({
                    "i": i, "tis": tis, "stem": q.get("q", "")[:140],
                })

        # H4. Suspect tertiary
        if len(tis) >= 3 and tis[2] in SUSPECT_TERTIARY:
            flags["H4_weak_tertiary"].append({
                "i": i, "tis": tis, "tertiary": tis[2],
                "stem": q.get("q", "")[:140],
            })

    # Write report
    out = ROOT / "docs" / "tis_audit_flags.md"
    lines = ["# tis[] reclassification — sanity audit flags", ""]
    lines.append(f"Total Qs: **{len(questions)}**")
    for h, items in flags.items():
        lines.append(f"- {h}: **{len(items)}**")
    lines.append("")

    def topic_name(ti):
        return TOPICS[ti] if 0 <= ti < len(TOPICS) else f"ti={ti}"

    H1_LABEL = "H1 — Anchor keyword missed (stem strongly mentions topic X but X is not in tis[])"
    H2_LABEL = "H2 — Biology of Aging primary without biology keywords (legacy dumping ground regression)"
    H3_LABEL = "H3 — Andropause secondary/tertiary without testosterone/libido keywords"
    H4_LABEL = "H4 — Weak tertiary (Patient Rights / Community/LTC / Interdisciplinary as 3rd pick — often hallucinated)"

    for key, label in [
        ("H1_anchor_missed", H1_LABEL),
        ("H2_biology_dump", H2_LABEL),
        ("H3_andropause_phantom", H3_LABEL),
        ("H4_weak_tertiary", H4_LABEL),
    ]:
        items = flags.get(key, [])
        lines.append(f"## {label} ({len(items)} flagged)")
        lines.append("")
        # Show first 30 of each — full list stays in JSON
        for it in items[:30]:
            tis_str = " → ".join(topic_name(t) for t in it["tis"])
            extra = ""
            if "missed" in it:
                extra = f" — missed: **{topic_name(it['missed'])}** (matched `{it['matched']}`)"
            elif "tertiary" in it:
                extra = f" — weak tertiary: **{topic_name(it['tertiary'])}**"
            lines.append(f"- **idx {it['i']}** [{tis_str}]{extra}")
            lines.append(f"  > {it['stem']}")
            lines.append("")
        if len(items) > 30:
            lines.append(f"_...+{len(items)-30} more (see docs/tis_audit_flags.json)_")
            lines.append("")

    out.write_text("\n".join(lines), encoding="utf-8")
    json_out = ROOT / "docs" / "tis_audit_flags.json"
    json_out.write_text(json.dumps(flags, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out} and {json_out}")
    for h, items in flags.items():
        print(f"  {h}: {len(items)}")


if __name__ == "__main__":
    main()
