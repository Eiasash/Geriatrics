#!/usr/bin/env python3
"""Check APP_VERSION, sw.js CACHE, and package.json version are aligned."""
import json, re, sys

html = open('shlav-a-mega.html').read()
sw = open('sw.js').read()
pkg = json.load(open('package.json'))

m_app = re.search(r"APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", html)
m_sw = re.search(r"CACHE\s*=\s*['\"]shlav-a-v([^'\"]+)['\"]", sw)

if not m_app:
    print('ERROR: APP_VERSION not found in shlav-a-mega.html', file=sys.stderr)
    sys.exit(1)
if not m_sw:
    print('ERROR: CACHE version not found in sw.js', file=sys.stderr)
    sys.exit(1)

app_v = m_app.group(1)
sw_v = m_sw.group(1)
pkg_v = pkg.get('version', '')

if app_v != sw_v:
    print(f'ERROR: Version mismatch — app={app_v}, sw.js={sw_v}', file=sys.stderr)
    sys.exit(1)
if not pkg_v.startswith(app_v):
    print(f'ERROR: package.json version "{pkg_v}" does not start with APP_VERSION "{app_v}"', file=sys.stderr)
    sys.exit(1)

print(f'OK: All versions aligned (v{app_v}) — sw.js={sw_v}, package.json={pkg_v}')
