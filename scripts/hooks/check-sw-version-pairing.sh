#!/usr/bin/env bash
# PreToolUse hook: if shlav-a-mega.html was edited in this session but sw.js
# hasn't bumped its cache version, warn hard. Offline PWA breaks otherwise.
#
# This is advisory (exit 0) because Claude may be mid-sequence and about to
# edit sw.js next. The goal is to surface the dependency, not block.

set -u

FILES="${CLAUDE_FILE_PATHS:-}"
[ -z "$FILES" ] && exit 0

# Only care when shlav-a-mega.html is being edited
if ! echo "$FILES" | grep -q 'shlav-a-mega\.html'; then
  exit 0
fi

# Check git: is shlav-a-mega.html modified but sw.js untouched?
if ! command -v git >/dev/null 2>&1; then exit 0; fi

HTML_CHANGED=$(git diff --name-only -- shlav-a-mega.html 2>/dev/null)
SW_CHANGED=$(git diff --name-only -- sw.js 2>/dev/null)

if [ -n "$HTML_CHANGED" ] && [ -z "$SW_CHANGED" ]; then
  CURRENT_VERSION=$(grep -oE "v[0-9]+\.[0-9]+" sw.js 2>/dev/null | head -1)
  echo "⚠️  shlav-a-mega.html is modified but sw.js is not."
  echo "   Current SW version: ${CURRENT_VERSION:-unknown}"
  echo "   Before commit, bump the SW cache version or CI integrity-guard will fail."
  echo "   Fix: edit the version string in sw.js (and the CACHE_NAME constant)."
fi

# Always return 0 — advisory, not blocking
exit 0
