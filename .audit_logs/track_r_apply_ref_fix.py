"""Track R — fix Hazzard chapter refs to match question_chapters.json (curated authority).

Scan: 3743 questions; 1554 have a Hazzard ref string whose chapter number
disagrees with question_chapters.json's `haz` assignment. The qc data is
the audited source of truth (per the chapterLinking + question_chapters
test guards); the ref field is freer-form generated text.

Fix: rebuild q.ref using:
  Hazzard Ch <qc.haz> — <chapter title>
  · Harrison Ch <qc.har> — <chapter title>  (if har present)

For Hebrew refs (הזארד פרק N) the script preserves the Hebrew prefix
form. Otherwise rebuilds in English form.

Skips entries where:
  - q.broken=true (filtered from user pool anyway)
  - ref already matches qc (no-op)
  - qc.haz is missing (no authority to fix toward)
  - ref doesn't have a Hazzard chapter pattern (e.g. USPSTF-only refs)

Backup written to data/questions.json.bak-<timestamp>.
"""
import json
import re
import shutil
import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
QPATH = REPO / "data" / "questions.json"
QC_PATH = REPO / "data" / "question_chapters.json"
HZ_PATH = REPO / "data" / "hazzard_chapters.json"
HAR_PATH = REPO / "harrison_chapters.json"

HAZ_EN_RE = re.compile(r"Hazzard\s+Ch\s+(\d+)\s*(?:—\s*[^·\n]+?)?", re.IGNORECASE)
HAZ_HE_RE = re.compile(r"הזארד\s*(?:פרק)?\s*(\d+)\s*(?:\([^)]*\))?")
HAR_EN_RE = re.compile(r"Harrison\s+Ch\s+(\d+)", re.IGNORECASE)


def main():
    qs = json.loads(QPATH.read_text(encoding="utf-8"))
    qchaps = json.loads(QC_PATH.read_text(encoding="utf-8"))
    hz = json.loads(HZ_PATH.read_text(encoding="utf-8"))
    har = {}
    if HAR_PATH.exists():
        try:
            har = json.loads(HAR_PATH.read_text(encoding="utf-8"))
        except Exception:
            har = {}

    # Backup
    ts = datetime.datetime.now().strftime("%Y%m%dT%H%M%SZ")
    backup = QPATH.with_name(f"questions.json.bak-{ts}")
    shutil.copy2(QPATH, backup)
    print(f"Backup: {backup.name}")

    fixed = 0
    skipped_already_ok = 0
    skipped_no_qc = 0
    skipped_no_haz_in_ref = 0
    skipped_broken = 0

    for i, q in enumerate(qs):
        if q.get("broken"):
            skipped_broken += 1
            continue
        qc = qchaps.get(str(i))
        if not isinstance(qc, dict):
            skipped_no_qc += 1
            continue
        qc_haz = qc.get("haz") or qc.get("hazzard")
        if qc_haz is None:
            skipped_no_qc += 1
            continue
        try:
            qc_haz = int(str(qc_haz).strip())
        except Exception:
            skipped_no_qc += 1
            continue

        ref = (q.get("ref") or "").strip()
        if not ref:
            continue

        # Find current Hazzard ch number in ref
        m_en = HAZ_EN_RE.search(ref)
        m_he = HAZ_HE_RE.search(ref)
        cur_haz = None
        if m_en:
            cur_haz = int(m_en.group(1))
        elif m_he:
            cur_haz = int(m_he.group(1))

        if cur_haz is None:
            skipped_no_haz_in_ref += 1
            continue
        if cur_haz == qc_haz:
            skipped_already_ok += 1
            continue

        # Mismatch — rebuild
        haz_title = (hz.get(str(qc_haz)) or {}).get("title", "")
        # Style: prefer the language of the existing ref
        if m_he and not m_en:
            # Hebrew form
            new_haz_part = f"הזארד פרק {qc_haz}"
            if haz_title:
                new_haz_part += f" ({haz_title})"
            new_ref = HAZ_HE_RE.sub(new_haz_part, ref, count=1)
        else:
            # English form
            new_haz_part = f"Hazzard Ch {qc_haz}"
            if haz_title:
                new_haz_part += f" — {haz_title}"
            # Replace the existing "Hazzard Ch N — ..." segment up to the next ·/end
            # First try the general substring replacement of "Hazzard Ch <num>" + an
            # optional " — ..." trailing into a · separator or EOL.
            full_old = re.compile(rf"Hazzard\s+Ch\s+{cur_haz}\b(?:\s*—\s*[^·\n]+)?", re.IGNORECASE)
            new_ref = full_old.sub(new_haz_part, ref, count=1)

        q["ref"] = new_ref
        fixed += 1

    print(f"\nFixed:               {fixed}")
    print(f"Already OK:          {skipped_already_ok}")
    print(f"No qc.haz:           {skipped_no_qc}")
    print(f"No Haz in ref:       {skipped_no_haz_in_ref}")
    print(f"Skipped broken:      {skipped_broken}")
    print(f"Total scanned:       {len(qs)}")

    QPATH.write_text(json.dumps(qs, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"\nWrote {QPATH.name}")


if __name__ == "__main__":
    main()
