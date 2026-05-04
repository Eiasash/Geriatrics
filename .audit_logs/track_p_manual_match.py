"""Track P — manually map the 47 2021-Dec unmapped via PDF token-overlap.

Same approach as Track N but targeting 2021-Dec specifically. The brief
describes 2021-Dec as having OCR limitations that defeated v2/v3 matchers,
but the v3 bundle parser already extracted Q-text for most questions —
this script searches that PDF text directly for option-token overlap.

Reuses the same matching logic: English caps + parens + Hebrew ≥6-char
fallback. Outputs candidates with hit counts.
"""
import json
import re
from pathlib import Path
import fitz

REPO = Path(__file__).resolve().parent.parent

PDF_PATH = REPO / ".audit_logs" / "exam_pdfs" / "Advanced" / "2021-12-21" / "2021-12-21_Advanced_exam_Q100_644197.pdf"

ENG_CAPS_RE = re.compile(r"\b[A-Z][A-Z]{3,}\b")
ENG_CAPLEAD_RE = re.compile(r"\b[A-Z][A-Za-z]{4,}\b")
PARENS_RE = re.compile(r"\(([^)]{3,40})\)")
HEB_LONG_RE = re.compile(r"[֐-׿][֐-׿֑-ׇ]{5,}")

HEB_NOT_DISTINCTIVE = {
    "המטופל","המטופלת","הטיפול","הסיכון","הכול","החולה","החולים","ההסבר",
    "התשובה","הנתון","הנתונים","המקרה","המצב","ההמלצה","הבדיקה","הבדיקות",
    "הסביר","הסבר","הוראה","הבאות","הבאים","הבא","הבאה","הזה","הזאת",
    "הראשון","הראשונה","העיקרי","העיקרית","הנכון","הנכונה","שיכולה","יכולה",
    "סובלת","סובל","מטופל","מטופלת","ביותר","שכיחה","שכיח","במקרה","למצוא",
    "מבחינה","אבחנה","במחלקה","אחרים","אחרות","להמליץ","המומלץ","המומלצת",
}


def extract_distinctive(text):
    out = set()
    for m in ENG_CAPS_RE.findall(text or ""):
        out.add(m)
    for m in ENG_CAPLEAD_RE.findall(text or ""):
        out.add(m)
    for m in PARENS_RE.findall(text or ""):
        m = m.strip()
        if 3 <= len(m) <= 40:
            out.add(m)
    return out


def extract_heb(text):
    out = set()
    for m in HEB_LONG_RE.findall(text or ""):
        if len(m) >= 6 and m not in HEB_NOT_DISTINCTIVE:
            out.add(m)
    return out


def split_pdf(pdf_path):
    doc = fitz.open(str(pdf_path))
    full = "\n".join(p.get_text("text") for p in doc)
    doc.close()
    Q_RE = re.compile(r"(?:^|\n)\s*\.?(\d{1,3})\.?\s+", re.MULTILINE)
    matches = list(Q_RE.finditer(full))
    chunks = []
    for i, m in enumerate(matches):
        try:
            qn = int(m.group(1))
            if qn < 1 or qn > 200:
                continue
        except ValueError:
            continue
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(full)
        chunks.append((qn, full[start:end]))
    return chunks


def main():
    qs = json.loads((REPO / "data" / "questions.json").read_text(encoding="utf-8"))
    v3 = json.loads((REPO / ".audit_logs" / "dataset_to_qnum_mapping_v3.json").read_text(encoding="utf-8"))
    unmapped = [u for u in v3["unmapped"] if u.get("tag") == "2021-Dec"]
    valid = [u for u in unmapped if 0 <= u["idx"] < len(qs)]

    print(f"PDF: {PDF_PATH.name}")
    print(f"Processing {len(valid)} 2021-Dec unmapped...")

    chunks = split_pdf(PDF_PATH)
    print(f"PDF split into {len(chunks)} Q-chunks")
    print()

    results = []
    for u in valid:
        idx = u["idx"]
        q = qs[idx]
        # Build tokens from option text + q-stem
        eng = set()
        heb = set()
        for opt in q.get("o", []):
            eng.update(extract_distinctive(opt))
            heb.update(extract_heb(opt))
        eng.update(extract_distinctive(q.get("q", "")))
        heb.update(extract_heb(q.get("q", "")))

        if not eng and not heb:
            results.append({"idx": idx, "status": "no_tokens", "candidates": []})
            print(f"idx={idx:4d}: NO TOKENS")
            continue

        scores = []
        for qnum, chunk in chunks:
            chunk_upper = chunk.upper()
            eng_hits = [t for t in eng if t.upper() in chunk_upper]
            heb_hits = [t for t in heb if t in chunk]
            total = len(eng_hits) + len(heb_hits)
            if total > 0:
                scores.append({
                    "qnum": qnum,
                    "hits": total,
                    "eng": len(eng_hits),
                    "heb": len(heb_hits),
                    "tokens": (eng_hits + heb_hits)[:5],
                    "preview": chunk[:120],
                })

        scores.sort(key=lambda x: -x["hits"])
        top = scores[:3]
        status = "ok" if top else "no_match"
        results.append({"idx": idx, "status": status, "candidates": top})

        if top:
            t = top[0]
            print(f"idx={idx:4d}: → q#{t['qnum']:3d} (hits={t['hits']} eng={t['eng']} heb={t['heb']})")
        else:
            print(f"idx={idx:4d}: NO MATCH")

    out = REPO / ".audit_logs" / "track_p_candidates.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out}")

    matched = sum(1 for r in results if r["status"] == "ok")
    print(f"Matched: {matched}/{len(valid)}")


if __name__ == "__main__":
    main()
