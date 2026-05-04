"""Track N — manual mapping for the 25 non-2021-Dec unmapped idxs.

For each unmapped (idx, tag), extract distinctive tokens from option text
(English caps words ≥4, parens content, distinctive Hebrew terms) and grep
through the corresponding tag's exam PDF text for matching question
numbers. Output candidates to .audit_logs/track_n_candidates.json for
human review.

Strategy: option text is usually verbatim from the original IMA PDF
(unlike q-stems which curators sometimes paraphrase). Searching by option
content is the fallback when n-gram q-stem matching fails.
"""
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF


REPO = Path(__file__).resolve().parent.parent
PDFS_ROOT = REPO / ".audit_logs" / "exam_pdfs"

TAG_TO_PDF = {
    "2020":              ("Advanced/2021-01_02__exam-2020", "2021-01_02__exam-2020_Advanced_exam_Q100_644194.pdf"),
    "2022-Jun-Basic":    ("Basic/2022-06-21",               "2022-06-21_Basic_exam_Q150_639899.pdf"),
    "2022-Jun-Subspec":  ("Advanced/2022-06-21",            "2022-06-21_Advanced_exam_Q100_644200.pdf"),
    "2023-Jun-Basic":    ("Basic/2023-06-13",               "2023-06-13_Basic_exam_Q150_639904.pdf"),
    "2023-Jun-Subspec":  ("Advanced/2023-06-13",            "2023-06-13_Advanced_exam_Q100_644204.pdf"),
    "2024-May-Basic":    ("Basic/2024-05-28",               "2024-05-28_Basic_exam_Q150_652285.pdf"),
    "2024-Sep-Basic":    ("Basic/2024-09-30",               "2024-09-30_Basic_exam_Q150_652291.pdf"),
    "2024-Sep-Subspec":  ("Advanced/2024-09-30",            "2024-09-30_Advanced_exam_Q100_644283.pdf"),
    "2025-Jun-Basic":    ("Basic/2025-06-12",               "2025-06-12_Basic_exam_Q150_749665.pdf"),
}

ENG_CAPS_RE = re.compile(r"\b[A-Z][A-Z]{3,}\b")  # ALLCAPS ≥4
ENG_CAPLEAD_RE = re.compile(r"\b[A-Z][A-Za-z]{4,}\b")  # caps-leading ≥5
PARENS_RE = re.compile(r"\(([^)]{3,40})\)")
HEB_LONG_RE = re.compile(r"[֐-׿][֐-׿֑-ׇ]{5,}")  # Hebrew ≥6 chars (distinctive)

HEB_NOT_DISTINCTIVE = {
    "המטופל","המטופלת","הטיפול","הסיכון","הכול","החולה","החולים","ההסבר",
    "התשובה","הנתון","הנתונים","המקרה","המצב","ההמלצה","הבדיקה","הבדיקות",
    "הסביר","הסבר","הוראה","הבאות","הבאים","הבא","הבאה","הזה","הזאת",
    "הראשון","הראשונה","העיקרי","העיקרית","הנכון","הנכונה","שיכולה","יכולה",
    "סובלת","סובל","מטופל","מטופלת","ביותר","שכיחה","שכיח","במקרה","למצוא",
    "מבחינה","אבחנה","במחלקה","אחרים","אחרות","להמליץ","המומלץ","המומלצת",
}


def extract_distinctive_tokens(text):
    """Pull tokens unlikely to repeat across multiple questions."""
    tokens = set()
    for m in ENG_CAPS_RE.findall(text or ""):
        tokens.add(m)
    for m in ENG_CAPLEAD_RE.findall(text or ""):
        tokens.add(m)
    for m in PARENS_RE.findall(text or ""):
        m = m.strip()
        if 3 <= len(m) <= 40:
            tokens.add(m)
    return tokens


def extract_heb_tokens(text):
    """Hebrew tokens ≥6 chars, minus generic medical phrases."""
    tokens = set()
    for m in HEB_LONG_RE.findall(text or ""):
        if len(m) >= 6 and m not in HEB_NOT_DISTINCTIVE:
            tokens.add(m)
    return tokens


def find_pdf(tag):
    rel_dir, fname = TAG_TO_PDF[tag]
    fpath = PDFS_ROOT / rel_dir / fname
    if fpath.exists():
        return fpath
    # Try wildcard
    parent = PDFS_ROOT / rel_dir
    if parent.exists():
        candidates = sorted([p for p in parent.iterdir() if "_exam_Q100_" in p.name])
        if candidates:
            return candidates[0]
    return None


# Cache PDF text by tag — split into per-question chunks
PDF_CACHE = {}

def load_pdf_pages(tag):
    """Return list of (q_num, text) tuples for the exam PDF of this tag.

    Crude split: assume one question per page is roughly true (most IMA exams
    have 1-2 Qs per page); also try splitting on Q# patterns. Worst case,
    return whole-doc text and let caller scan substrings.
    """
    if tag in PDF_CACHE:
        return PDF_CACHE[tag]
    fpath = find_pdf(tag)
    if not fpath:
        PDF_CACHE[tag] = None
        return None
    doc = fitz.open(str(fpath))
    pages = []
    for p in doc:
        pages.append(p.get_text("text"))
    doc.close()
    full_text = "\n".join(pages)

    # Split by Q# patterns: lines like "1." or ".1" or "שאלה 1" or "1)" near start of line
    # IMA Hebrew PDFs typically use ".N" or "N." (RTL artifacts) at start of each Q
    chunks = []
    # Try splitting by `\.(\d{1,3})` or `(\d{1,3})\.` at line starts
    # Conservative: build regex for both forms
    Q_NUM_RE = re.compile(r"(?:^|\n)\s*\.?(\d{1,3})\.?\s+", re.MULTILINE)

    matches = list(Q_NUM_RE.finditer(full_text))
    if matches:
        for i, m in enumerate(matches):
            qnum_str = m.group(1)
            try:
                qnum = int(qnum_str)
                if qnum < 1 or qnum > 200:  # filter spurious matches
                    continue
            except ValueError:
                continue
            start = m.end()
            end = matches[i+1].start() if i + 1 < len(matches) else len(full_text)
            chunks.append((qnum, full_text[start:end]))

    PDF_CACHE[tag] = (full_text, chunks)
    return PDF_CACHE[tag]


def find_qnum_for_idx(idx, tag, q):
    """Try to find the IMA Q-number for this dataset entry."""
    cached = load_pdf_pages(tag)
    if cached is None:
        return {"idx": idx, "tag": tag, "status": "pdf_not_found", "candidates": []}
    full_text, chunks = cached

    # Build distinctive token set from option text + q-stem
    opt_tokens = set()
    for opt in q.get("o", []):
        opt_tokens.update(extract_distinctive_tokens(opt))
    opt_tokens.update(extract_distinctive_tokens(q.get("q", "")))

    # Hebrew fallback if no English tokens found
    heb_tokens = set()
    if not opt_tokens:
        for opt in q.get("o", []):
            heb_tokens.update(extract_heb_tokens(opt))
        heb_tokens.update(extract_heb_tokens(q.get("q", "")))

    if not opt_tokens and not heb_tokens:
        return {"idx": idx, "tag": tag, "status": "no_distinctive_tokens", "candidates": []}

    # Score each chunk by token overlap
    scores = []
    for qnum, chunk_text in chunks:
        chunk_upper = chunk_text.upper()
        eng_hits = [t for t in opt_tokens if t.upper() in chunk_upper]
        heb_hits = [t for t in heb_tokens if t in chunk_text]
        all_hits = eng_hits + heb_hits
        if all_hits:
            scores.append({
                "qnum": qnum,
                "hits": len(all_hits),
                "eng": len(eng_hits),
                "heb": len(heb_hits),
                "tokens": all_hits[:5],
                "preview": chunk_text[:120],
            })

    scores.sort(key=lambda x: -x["hits"])
    top = scores[:3]
    return {
        "idx": idx,
        "tag": tag,
        "status": "ok" if top else "no_match",
        "tokens_searched": (list(opt_tokens) + list(heb_tokens))[:10],
        "candidates": top,
    }


def main():
    m = json.loads((REPO / ".audit_logs" / "dataset_to_qnum_mapping_v3.json").read_text(encoding="utf-8"))
    qs = json.loads((REPO / "data" / "questions.json").read_text(encoding="utf-8"))
    unmapped = [u for u in m["unmapped"] if u.get("tag") != "2021-Dec"]
    valid = [u for u in unmapped if 0 <= u["idx"] < len(qs)]

    print(f"Processing {len(valid)} valid non-2021-Dec unmapped...")
    print()

    results = []
    for u in valid:
        idx = u["idx"]
        tag = u["tag"]
        q = qs[idx]
        r = find_qnum_for_idx(idx, tag, q)
        results.append(r)
        # Brief progress line
        cands = r.get("candidates", [])
        top = cands[0] if cands else None
        if top:
            print(f"idx={idx:4d} tag={tag:18s} → q#{top['qnum']:3d} ({top['hits']} token hits)  preview: {top['preview'][:60]}")
        else:
            print(f"idx={idx:4d} tag={tag:18s} → NO MATCH (status: {r['status']})")

    out = REPO / ".audit_logs" / "track_n_candidates.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
