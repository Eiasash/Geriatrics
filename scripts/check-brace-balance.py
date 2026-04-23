#!/usr/bin/env python3
"""Check JS brace balance in shlav-a-mega.html."""
import sys

c = open('shlav-a-mega.html', encoding='utf-8').read()
opens = c.count('{')
closes = c.count('}')
diff = opens - closes
if diff != 0:
    print(f'ERROR: Brace imbalance — {{ ={opens}, }} ={closes}, diff={diff}', file=sys.stderr)
    sys.exit(1)
print(f'OK: Brace balance ({opens} pairs)')
