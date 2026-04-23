#!/usr/bin/env python3
"""
add-exam-images.py — Extract clinical images from board exam PDFs,
upload to Supabase, and optionally create image-based questions.

Usage:
  python add-exam-images.py --app geri --exam "Sep24" --pdf album.pdf [--dry-run] [--no-questions]
  python add-exam-images.py --app pnimit --exam "Jun21" --pdf album.pdf

Requirements:
  pip install pymupdf requests

What it does:
  1. Extracts images from PDF (filters <150px or <8KB)
  2. Deduplicates by content hash
  3. Uploads to Supabase question-images bucket
  4. Prints a manifest of uploaded images for manual question creation
  5. Bumps APP_VERSION + SW CACHE (unless --dry-run)
"""

import argparse, hashlib, json, os, re, subprocess, sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR: pip install pymupdf"); sys.exit(1)
try:
    import requests
except ImportError:
    print("ERROR: pip install requests"); sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────
SUPA_URL = 'https://krmlzwwelqvlfslwltol.supabase.co'
BUCKET = 'question-images'

APPS = {
    'geri': {
        'repo': 'Geriatrics',
        'html': 'shlav-a-mega.html',
        'sw': 'sw.js',
        'questions': 'data/questions.json',
        'cache_prefix': 'shlav-a-v',
    },
    'pnimit': {
        'repo': 'InternalMedicine',
        'html': 'pnimit-mega.html',
        'sw': 'sw.js',
        'questions': 'data/questions.json',
        'cache_prefix': 'pnimit-v',
    },
}

def get_supa_key(html_path):
    """Extract Supabase anon key from app HTML."""
    html = open(html_path, encoding='utf-8').read()
    m = re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', html)
    return m.group(0) if m else None

def extract_images(pdf_path, exam_label, app_name):
    """Extract clinical images from exam PDF."""
    doc = fitz.open(pdf_path)
    images = []
    for pg in range(len(doc)):
        page = doc[pg]
        for idx, img_info in enumerate(page.get_images(full=True)):
            base = doc.extract_image(img_info[0])
            if not base:
                continue
            w, h = base.get('width', 0), base.get('height', 0)
            data = base['image']
            # Skip tiny images (logos, icons, bullets)
            if w < 150 or h < 150 or len(data) < 8000:
                continue
            ext = base['ext']
            fname = f"{app_name}_{exam_label}_p{pg+1}_img{idx+1}.{ext}"
            images.append({
                'filename': fname,
                'data': data,
                'width': w,
                'height': h,
                'size_kb': len(data) // 1024,
                'page': pg + 1,
                'ext': ext,
            })
    doc.close()
    return images

def dedup_images(images):
    """Remove duplicate images by content hash."""
    seen = {}
    unique = []
    for img in images:
        h = hashlib.md5(img['data']).hexdigest()
        if h not in seen:
            seen[h] = img['filename']
            unique.append(img)
    return unique

def upload_to_supabase(images, supa_key):
    """Upload images to Supabase storage."""
    uploaded, skipped, failed = 0, 0, 0
    for img in images:
        ct = 'image/jpeg' if img['ext'] in ('jpeg', 'jpg') else 'image/png'
        # Check if already exists
        head = requests.head(
            f"{SUPA_URL}/storage/v1/object/public/{BUCKET}/{img['filename']}",
            timeout=5
        )
        if head.status_code == 200:
            skipped += 1
            continue
        resp = requests.post(
            f"{SUPA_URL}/storage/v1/object/{BUCKET}/{img['filename']}",
            headers={
                'apikey': supa_key,
                'Authorization': f'Bearer {supa_key}',
                'Content-Type': ct,
                'x-upsert': 'true',
            },
            data=img['data'],
            timeout=30,
        )
        if resp.status_code in (200, 201):
            uploaded += 1
        else:
            failed += 1
            print(f"  FAIL {img['filename']}: {resp.status_code}")
    return uploaded, skipped, failed

def get_current_version(html_path):
    """Read current APP_VERSION from HTML."""
    html = open(html_path, encoding='utf-8').read()
    m = re.search(r"APP_VERSION='(\d+\.\d+)'", html)
    return m.group(1) if m else None

def bump_version(app_cfg, repo_dir):
    """Bump APP_VERSION in HTML and CACHE in SW."""
    html_path = os.path.join(repo_dir, app_cfg['html'])
    sw_path = os.path.join(repo_dir, app_cfg['sw'])

    old_ver = get_current_version(html_path)
    if not old_ver:
        print("ERROR: Could not find APP_VERSION")
        return None

    parts = old_ver.split('.')
    new_ver = f"{parts[0]}.{int(parts[1]) + 1}"

    # Bump HTML
    html = open(html_path, encoding='utf-8').read()
    html = html.replace(f"APP_VERSION='{old_ver}'", f"APP_VERSION='{new_ver}'")
    open(html_path, 'w', encoding='utf-8').write(html)

    # Bump SW
    sw = open(sw_path, encoding='utf-8').read()
    old_cache = f"{app_cfg['cache_prefix']}{old_ver}"
    new_cache = f"{app_cfg['cache_prefix']}{new_ver}"
    sw = sw.replace(f"CACHE='{old_cache}'", f"CACHE='{new_cache}'")
    open(sw_path, 'w', encoding='utf-8').write(sw)

    print(f"  Version: {old_ver} → {new_ver}")
    print(f"  Cache: {old_cache} → {new_cache}")
    return new_ver

def run_tests(repo_dir):
    """Run vitest suite."""
    print("  Running tests...")
    result = subprocess.run(
        ['npx', 'vitest', 'run'],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        timeout=60,
    )
    # Extract pass count
    for line in result.stdout.split('\n'):
        if 'Tests' in line and 'passed' in line:
            print(f"  {line.strip()}")
            return result.returncode == 0
    if result.returncode != 0:
        print(f"  TESTS FAILED:\n{result.stderr[-500:]}")
    return result.returncode == 0

def syntax_check(html_path):
    """Extract JS and run node --check."""
    html = open(html_path, encoding='utf-8').read()
    start = html.rfind('<script>') + len('<script>')
    end = html.rfind('</script>')
    js = html[start:end].replace('</script>', '')
    tmp = '/tmp/_syntax_check.js'
    open(tmp, 'w', encoding='utf-8').write(js)
    result = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    os.remove(tmp)
    if result.returncode != 0:
        print(f"  SYNTAX ERROR: {result.stderr[:200]}")
        return False
    print("  JS syntax OK")
    return True

def main():
    parser = argparse.ArgumentParser(description='Add exam images to Shlav A / Pnimit Mega')
    parser.add_argument('--app', required=True, choices=['geri', 'pnimit'], help='Target app')
    parser.add_argument('--exam', required=True, help='Exam label (e.g. Sep24, Jun21)')
    parser.add_argument('--pdf', required=True, help='Path to exam image album PDF')
    parser.add_argument('--repo', help='Path to repo (default: ./<repo-name>)')
    parser.add_argument('--dry-run', action='store_true', help='Extract and upload only, no version bump')
    parser.add_argument('--no-upload', action='store_true', help='Extract only, skip Supabase upload')
    args = parser.parse_args()

    app_cfg = APPS[args.app]
    repo_dir = args.repo or app_cfg['repo']

    if not os.path.isdir(repo_dir):
        print(f"ERROR: Repo dir '{repo_dir}' not found. Clone it first or use --repo.")
        sys.exit(1)

    html_path = os.path.join(repo_dir, app_cfg['html'])
    if not os.path.isfile(html_path):
        print(f"ERROR: {html_path} not found")
        sys.exit(1)

    if not os.path.isfile(args.pdf):
        print(f"ERROR: PDF '{args.pdf}' not found")
        sys.exit(1)

    print(f"═══ add-exam-images: {args.app} / {args.exam} ═══")

    # 1. Extract
    print(f"\n[1/5] Extracting images from {args.pdf}...")
    raw = extract_images(args.pdf, args.exam, args.app)
    unique = dedup_images(raw)
    print(f"  {len(raw)} extracted, {len(unique)} unique (>{len(raw)-len(unique)} duplicates)")

    if not unique:
        print("  No images found. Check PDF.")
        sys.exit(1)

    for img in unique:
        print(f"  {img['filename']:45s} {img['width']}x{img['height']}  {img['size_kb']}KB")

    # 2. Upload
    if not args.no_upload:
        print(f"\n[2/5] Uploading to Supabase ({BUCKET})...")
        supa_key = get_supa_key(html_path)
        if not supa_key:
            print("  ERROR: Could not extract Supabase key from HTML")
            sys.exit(1)
        up, skip, fail = upload_to_supabase(unique, supa_key)
        print(f"  Uploaded: {up}, Already existed: {skip}, Failed: {fail}")
    else:
        print("\n[2/5] Skipped upload (--no-upload)")

    # 3. Print manifest for question creation
    print(f"\n[3/5] Image manifest (paste URLs into question 'img' field):")
    for img in unique:
        url = f"{SUPA_URL}/storage/v1/object/public/{BUCKET}/{img['filename']}"
        print(f"  p{img['page']:2d}: {url}")

    if args.dry_run:
        print(f"\n[4/5] Skipped version bump (--dry-run)")
        print(f"[5/5] Skipped tests (--dry-run)")
        print(f"\n✅ Dry run complete. {len(unique)} images ready in Supabase.")
        print("Next: add image questions manually, then bump version and push.")
        return

    # 4. Version bump
    print(f"\n[4/5] Bumping version...")
    new_ver = bump_version(app_cfg, repo_dir)
    if not new_ver:
        sys.exit(1)

    # 5. Syntax check + tests
    print(f"\n[5/5] Validation...")
    if not syntax_check(html_path):
        sys.exit(1)
    if not run_tests(repo_dir):
        sys.exit(1)

    print(f"\n✅ Done! {len(unique)} images uploaded, version → {new_ver}")
    print(f"Next steps:")
    print(f"  1. Add image questions to {app_cfg['questions']}")
    print(f"  2. git add -A && git commit -m 'v{new_ver}: +{len(unique)} exam images ({args.exam})'")
    print(f"  3. git push origin main")

if __name__ == '__main__':
    main()
