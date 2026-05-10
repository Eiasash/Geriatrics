#!/usr/bin/env python3
"""
Extract every inline <script> from shlav-a-mega.html (no src=) and run
`node --check` on each one. Catches syntax errors hidden inside JS string
literals (e.g. broken backslash-quote escapes inside CHANGELOG entries
that brace-balance and vitest both miss).

Failure mode this guards against: v10.64.99 shipped a CHANGELOG entry
containing a literal `medBasket=\\\\'comma,separated\\\\'` description.
Inside a single-quoted JS string, the four backslashes resolved to two
backslashes followed by an unescaped quote, terminating the string and
turning the rest of the file into garbage tokens. Browser threw
'Unexpected identifier comma' and the whole app stayed unrendered.
brace-balance.py still passed because braces stayed balanced. vitest
reads the HTML as text, not JS.
"""
import re, subprocess, sys, tempfile, pathlib

ROOT = pathlib.Path(__file__).parent.parent
HTML = ROOT / "shlav-a-mega.html"

if not HTML.exists():
    print(f"FAIL: {HTML} not found", file=sys.stderr); sys.exit(2)

source = HTML.read_text()
# Inline script = <script ...>...</script> WITHOUT src= attribute
pattern = re.compile(r"<script(?:(?!\bsrc=)[^>])*?>([\s\S]*?)</script>", re.IGNORECASE)
scripts = pattern.findall(source)

if not scripts:
    print("FAIL: no inline scripts found in shlav-a-mega.html", file=sys.stderr); sys.exit(2)

failed = 0
for i, body in enumerate(scripts):
    if body.count("\n") < 5:
        continue  # tiny scripts (configs, install probes); not worth the overhead
    with tempfile.NamedTemporaryFile(suffix=".mjs", mode="w", delete=False) as f:
        f.write(body)
        fname = f.name
    res = subprocess.run(["node", "--check", fname], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"FAIL: script #{i} ({body.count(chr(10))} lines) has a JS syntax error:", file=sys.stderr)
        print(res.stderr, file=sys.stderr)
        failed += 1

if failed:
    print(f"FAIL: {failed} inline script(s) have JS syntax errors", file=sys.stderr)
    sys.exit(1)
print(f"OK: {len(scripts)} inline scripts in shlav-a-mega.html parse cleanly with node --check")
