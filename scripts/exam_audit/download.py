#!/usr/bin/env python3
"""Download all exam PDFs from IMA to cache/ (gitignored)."""
import json, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
CACHE = HERE / 'cache'
CACHE.mkdir(exist_ok=True)

with open(HERE / 'sources.json') as f:
    src = json.load(f)

s3 = src['_s3_prefix']
downloaded, skipped, failed = 0, 0, 0

for exam in src['exams']:
    for kind in ('q_pdf', 'ans_pdf', 'refs_pdf', 'album_pdf', 'album2_pdf', 'revised_pdf'):
        fname = exam.get(kind)
        if not fname:
            continue
        target = CACHE / f"{exam['id']}__{kind}__{fname}"
        if target.exists() and target.stat().st_size > 1000:
            skipped += 1
            continue
        url = s3 + fname
        try:
            urllib.request.urlretrieve(url, target)
            print(f"  ✓ {exam['id']}/{kind}: {target.stat().st_size:,} bytes")
            downloaded += 1
        except Exception as e:
            print(f"  ✗ {exam['id']}/{kind}: {e}")
            failed += 1

print(f"\nDownloaded: {downloaded}  Skipped (cached): {skipped}  Failed: {failed}")
sys.exit(0 if failed == 0 else 1)
