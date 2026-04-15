#!/usr/bin/env python3
"""Audit innerHTML for unsanitized interpolation in shlav-a-mega.html."""
import sys

html = open('shlav-a-mega.html').read()
lines = html.split('\n')
warnings = []
for i, line in enumerate(lines, 1):
    if '.innerHTML=' in line or '.innerHTML =' in line:
        after_eq = line.split('innerHTML')[1]
        if ('+' in after_eq or '${' in after_eq) and 'sanitize(' not in after_eq:
            warnings.append(f'  Line {i}: {line.strip()[:100]}')
if warnings:
    print(f'WARNING: {len(warnings)} innerHTML assignments with unsanitized interpolation:')
    for w in warnings:
        print(w)
else:
    print('OK: No unsanitized innerHTML interpolation detected')
