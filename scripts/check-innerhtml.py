#!/usr/bin/env python3
"""Audit innerHTML for unsanitized interpolation in shlav-a-mega.html.

Rules:
  * FAIL (exit 1) on any `.innerHTML = <expr>` where <expr> contains `+` or
    `${...}` interpolation AND does not call `sanitize(` anywhere in the
    assignment expression.
  * Allow explicit opt-out via `// safe-innerhtml: <reason>` inside the
    statement, as a trailing end-of-line comment, or on the line directly
    preceding the assignment. The reason is required so every exemption is
    auditable by `grep`.

The statement-terminating `;` is found by a string-aware scanner so that
semicolons inside CSS (`max-width:420px;`) and other literals don't
prematurely close the expression. Previously a naive split-on-`;` was used
and let real findings slip past the gate.
"""
import re
import sys

SRC = 'shlav-a-mega.html'
OPEN_RE = re.compile(r'\.innerHTML\s*=(?!=)')
SAFE_MARK = 'safe-innerhtml:'


def find_statement_end(text: str, start: int) -> int:
    """Index of the `;` that ends the JS statement beginning at `start`.

    Skips `;` inside strings/comments so the scan matches real statement
    boundaries rather than CSS property separators.
    """
    i = start
    n = len(text)
    while i < n:
        c = text[i]
        c2 = text[i:i + 2]
        if c2 == '//':
            nl = text.find('\n', i)
            if nl == -1:
                return n
            i = nl + 1
            continue
        if c2 == '/*':
            end = text.find('*/', i + 2)
            if end == -1:
                return n
            i = end + 2
            continue
        if c in ('"', "'"):
            quote = c
            i += 1
            while i < n:
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                if text[i] == '\n':
                    break
                i += 1
            continue
        if c == '`':
            i += 1
            depth = 0
            while i < n:
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i:i + 2] == '${':
                    depth += 1
                    i += 2
                    continue
                if depth > 0 and text[i] == '}':
                    depth -= 1
                    i += 1
                    continue
                if depth == 0 and text[i] == '`':
                    i += 1
                    break
                i += 1
            continue
        if c == ';':
            return i
        i += 1
    return n


def scan(text: str):
    violations = []
    for m in OPEN_RE.finditer(text):
        rhs_start = m.end()
        stmt_end = find_statement_end(text, rhs_start)
        expr = text[rhs_start:stmt_end]
        has_interp = '+' in expr or '${' in expr
        has_sanitize = 'sanitize(' in expr
        if not (has_interp and not has_sanitize):
            continue
        stmt_start_line = text.rfind('\n', 0, m.start()) + 1
        prev_line_start = text.rfind('\n', 0, max(0, stmt_start_line - 1)) + 1
        stmt_end_eol = text.find('\n', stmt_end)
        if stmt_end_eol == -1:
            stmt_end_eol = len(text)
        annotation_span = text[prev_line_start:stmt_end_eol]
        if SAFE_MARK in annotation_span:
            continue
        line_no = text.count('\n', 0, m.start()) + 1
        preview = text[stmt_start_line:text.find('\n', stmt_start_line)].strip()[:100]
        violations.append((line_no, preview))
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
