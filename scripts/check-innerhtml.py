#!/usr/bin/env python3
"""Audit innerHTML for unsanitized interpolation in shlav-a-mega.html.

Rules:
  * FAIL (exit 1) on any `.innerHTML = <expr>` where <expr> contains `+` or
    `${...}` interpolation AND does not call `sanitize(` anywhere in the
    assignment expression (which may span multiple lines up to the next `;`).
  * Allow explicit opt-out via `// safe-innerhtml: <reason>` on the opening
    line of the assignment. The reason is required so every exemption is
    auditable by `grep`.

Previously this emitted a WARNING and always exited 0, so real findings were
invisible. Now a new violation blocks `npm run verify`.
"""
import re
import sys

SRC = 'shlav-a-mega.html'
OPEN_RE = re.compile(r'\.innerHTML\s*=')
SAFE_MARK = 'safe-innerhtml:'


def scan(text: str):
    lines = text.split('\n')
    violations = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        m = OPEN_RE.search(line)
        if not m:
            i += 1
            continue
        # Skip method calls like .innerHTML=='foo' (comparison) or function refs
        # by requiring a bare `=` not immediately followed by `=`.
        if line[m.end():m.end() + 1] == '=':
            i += 1
            continue
        start_line = i
        # Collect the assignment expression until a terminating `;`.
        # The naive approach: greedy read until we see a `;` at top level or
        # end-of-statement. We don't attempt full JS parsing; we accept the
        # expression as the concatenation of all lines until the first `;`
        # that appears outside a string literal on the same or later lines.
        buf = line[m.end():]
        j = i
        while ';' not in buf and j + 1 < n:
            j += 1
            buf += '\n' + lines[j]
        # Trim at the first ; (close enough for this check)
        expr = buf.split(';', 1)[0]
        # Opt-out annotation on any line in the span OR on the line directly
        # preceding the assignment (natural comment-above-statement placement).
        lookback_start = max(0, start_line - 1)
        annotated = any(SAFE_MARK in lines[k] for k in range(lookback_start, j + 1))
        has_interp = '+' in expr or '${' in expr
        has_sanitize = 'sanitize(' in expr
        if has_interp and not has_sanitize and not annotated:
            violations.append((start_line + 1, line.strip()[:100]))
        i = j + 1
    return violations


def main():
    try:
        text = open(SRC, encoding='utf-8').read()
    except FileNotFoundError:
        print(f'ERROR: {SRC} not found', file=sys.stderr)
        return 2
    violations = scan(text)
    if violations:
        print(f'FAIL: {len(violations)} innerHTML assignments with unsanitized interpolation:')
        for line_no, preview in violations:
            print(f'  Line {line_no}: {preview}')
        print('  Fix: wrap dynamic input in sanitize(), or add')
        print('       `// safe-innerhtml: <reason>` if the input is provably static / internal.')
        return 1
    print('OK: No unsanitized innerHTML interpolation')
    return 0


if __name__ == '__main__':
    sys.exit(main())
