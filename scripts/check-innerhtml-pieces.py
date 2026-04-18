#!/usr/bin/env python3
"""Per-piece audit of `.innerHTML = <expr>` in shlav-a-mega.html.

Complements check-innerhtml.py, which passes if ANY `sanitize(` call
appears anywhere in the RHS. That coarse check lets *partial*-sanitize
templates slip through, e.g.:

    box.innerHTML = `<b>${sanitize(safe)}</b> ${unsafe}`;
                                               ^^^^^^^^ hole

This audit breaks the RHS into its dynamic pieces (each `${...}` inside
backticks, and each non-string operand of `+` at top level) and fails if
any piece is NOT one of:

  * wrapped in a top-level sanitize(...) call
  * a bare string literal
  * a purely numeric/arithmetic expression (digits/operators/spaces/parens)
  * a top-level ternary whose then/else branches are themselves safe
  * annotated via `// safe-innerhtml: <reason>` on the statement

Only statements with `+` or `${...}` are inspected (same trigger as the
coarse checker). Single-variable `el.innerHTML = x` is out of scope —
catching that safely needs data-flow analysis, not a syntactic scan.
"""
import re
import sys

SRC = 'shlav-a-mega.html'
SAFE_MARK = 'safe-innerhtml:'
OPEN_RE = re.compile(r'\.innerHTML\s*=(?!=)')
NUMERIC_ONLY = re.compile(r'^[\d.+\-*/%() \t\r\n]+$')


def skip_string(text, i):
    n = len(text)
    if i >= n:
        return -1
    c = text[i]
    if c in ('"', "'"):
        quote = c
        i += 1
        while i < n:
            if text[i] == '\\':
                i += 2
                continue
            if text[i] == quote:
                return i + 1
            if text[i] == '\n':
                return i
            i += 1
        return n
    if c == '`':
        return -2
    return -1


def skip_backtick(text, i):
    n = len(text)
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
            return i + 1
        i += 1
    return n


def find_statement_end(text, start):
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
            skipped = skip_string(text, i)
            i = skipped if skipped > 0 else n
            continue
        if c == '`':
            i = skip_backtick(text, i)
            continue
        if c == ';':
            return i
        i += 1
    return n


def collect_template_holes(text, start):
    n = len(text)
    i = start + 1
    holes = []
    while i < n:
        if text[i] == '\\':
            i += 2
            continue
        if text[i:i + 2] == '${':
            depth = 1
            j = i + 2
            start_inner = j
            while j < n and depth > 0:
                c = text[j]
                if c == '\\':
                    j += 2
                    continue
                if c in ('"', "'"):
                    sk = skip_string(text, j)
                    j = sk if sk > 0 else n
                    continue
                if c == '`':
                    j = skip_backtick(text, j)
                    continue
                if c == '{':
                    depth += 1
                    j += 1
                    continue
                if c == '}':
                    depth -= 1
                    if depth == 0:
                        holes.append(text[start_inner:j])
                        j += 1
                        break
                    j += 1
                    continue
                j += 1
            i = j
            continue
        if text[i] == '`':
            return holes, i + 1
        i += 1
    return holes, n


def split_top_level(expr):
    n = len(expr)
    i = 0
    operands = []
    current_start = 0
    paren_depth = 0
    while i < n:
        c = expr[i]
        c2 = expr[i:i + 2]
        if c2 == '//':
            nl = expr.find('\n', i)
            i = nl + 1 if nl != -1 else n
            continue
        if c2 == '/*':
            end = expr.find('*/', i + 2)
            i = end + 2 if end != -1 else n
            continue
        if c in ('"', "'"):
            sk = skip_string(expr, i)
            i = sk if sk > 0 else n
            continue
        if c == '`':
            i = skip_backtick(expr, i)
            continue
        if c in '([{':
            paren_depth += 1
            i += 1
            continue
        if c in ')]}':
            paren_depth -= 1
            i += 1
            continue
        if c == '+' and paren_depth == 0:
            operands.append(expr[current_start:i].strip())
            current_start = i + 1
            i += 1
            continue
        i += 1
    operands.append(expr[current_start:].strip())
    return operands


def split_top_ternary(p):
    n = len(p)
    i = 0
    paren = 0
    q_idx = -1
    while i < n:
        c = p[i]
        c2 = p[i:i + 2]
        if c2 == '//':
            nl = p.find('\n', i); i = nl + 1 if nl != -1 else n; continue
        if c2 == '/*':
            end = p.find('*/', i + 2); i = end + 2 if end != -1 else n; continue
        if c in ('"', "'"):
            sk = skip_string(p, i); i = sk if sk > 0 else n; continue
        if c == '`':
            i = skip_backtick(p, i); continue
        if c in '([{':
            paren += 1; i += 1; continue
        if c in ')]}':
            paren -= 1; i += 1; continue
        if paren == 0 and c == '?':
            q_idx = i
            break
        i += 1
    if q_idx == -1:
        return None
    i = q_idx + 1
    paren = 0
    tern_depth = 0
    while i < n:
        c = p[i]
        c2 = p[i:i + 2]
        if c2 == '//':
            nl = p.find('\n', i); i = nl + 1 if nl != -1 else n; continue
        if c2 == '/*':
            end = p.find('*/', i + 2); i = end + 2 if end != -1 else n; continue
        if c in ('"', "'"):
            sk = skip_string(p, i); i = sk if sk > 0 else n; continue
        if c == '`':
            i = skip_backtick(p, i); continue
        if c in '([{':
            paren += 1; i += 1; continue
        if c in ')]}':
            paren -= 1; i += 1; continue
        if paren == 0:
            if c == '?':
                tern_depth += 1
            elif c == ':':
                if tern_depth == 0:
                    return p[:q_idx].strip(), p[q_idx + 1:i].strip(), p[i + 1:].strip()
                tern_depth -= 1
        i += 1
    return None


def piece_is_safe(piece):
    p = piece.strip()
    if not p:
        return True
    while p.startswith('(') and p.endswith(')'):
        depth = 0
        matched_at_end = False
        for idx, ch in enumerate(p):
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    matched_at_end = (idx == len(p) - 1)
                    break
        if matched_at_end:
            p = p[1:-1].strip()
        else:
            break
    if p.startswith("'") and p.endswith("'"):
        return True
    if p.startswith('"') and p.endswith('"'):
        return True
    if NUMERIC_ONLY.match(p):
        return True
    if p.startswith('sanitize('):
        depth = 0
        for idx, ch in enumerate(p):
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return idx == len(p) - 1
        return False
    tern = split_top_ternary(p)
    if tern is not None:
        _, then_b, else_b = tern
        return piece_is_safe(then_b) and piece_is_safe(else_b)
    return False


def is_string_literal(operand):
    s = operand.strip()
    if not s:
        return True
    if s.startswith("'") and s.endswith("'"):
        return True
    if s.startswith('"') and s.endswith('"'):
        return True
    if s.startswith('`') and s.endswith('`') and '${' not in s:
        return True
    return False


def scan_expr(expr):
    unsafe = []
    operands = split_top_level(expr)
    for op in operands:
        if is_string_literal(op):
            continue
        if op.startswith('`'):
            holes, _end = collect_template_holes(op, 0)
            for h in holes:
                if not piece_is_safe(h):
                    unsafe.append(h.strip()[:80])
            continue
        if not piece_is_safe(op):
            unsafe.append(op.strip()[:80])
    return unsafe


def scan(text):
    findings = []
    for m in OPEN_RE.finditer(text):
        rhs_start = m.end()
        stmt_end = find_statement_end(text, rhs_start)
        expr = text[rhs_start:stmt_end]
        if '+' not in expr and '${' not in expr:
            continue
        unsafe = scan_expr(expr)
        if not unsafe:
            continue
        stmt_start_line = text.rfind('\n', 0, m.start()) + 1
        prev_line_start = text.rfind('\n', 0, max(0, stmt_start_line - 1)) + 1
        stmt_end_eol = text.find('\n', stmt_end)
        if stmt_end_eol == -1:
            stmt_end_eol = len(text)
        annotation_span = text[prev_line_start:stmt_end_eol]
        annotated = SAFE_MARK in annotation_span
        line_no = text.count('\n', 0, m.start()) + 1
        findings.append({
            'line': line_no,
            'annotated': annotated,
            'unsafe_pieces': unsafe,
        })
    return findings


def main():
    try:
        text = open(SRC, encoding='utf-8').read()
    except FileNotFoundError:
        print(f'ERROR: {SRC} not found', file=sys.stderr)
        return 2
    findings = scan(text)
    unannotated = [f for f in findings if not f['annotated']]
    if unannotated:
        print(f'FAIL: {len(unannotated)} innerHTML sites have unsanitized dynamic pieces:')
        for f in unannotated:
            print(f"  Line {f['line']}")
            for p in f['unsafe_pieces']:
                print(f"    UNSAFE piece: {p}")
        print('  Fix: wrap each dynamic piece in sanitize(), or add')
        print('       `// safe-innerhtml: <reason>` if the whole site is provably safe.')
        return 1
    print(f'OK: {len(findings)} innerHTML sites with interpolation, all pieces sanitized or annotated')
    return 0


if __name__ == '__main__':
    sys.exit(main())
