#!/usr/bin/env bash
# verify-deploy.sh — Post-deploy live verification.
#
# Curls the live GitHub Pages URLs and confirms the expected version string
# appears in the deployed HTML and sw.js. Polls with backoff because Pages
# takes ~60–90s to publish after push.
#
# Why: existing scripts/check-version-sync.py validates LOCAL files match.
# This validates the LIVE site actually shipped the new version — catches
# the "cache masking shipped fixes" + "Pages build silently failed" cases.
#
# Usage:
#   ./scripts/verify-deploy.sh                # uses package.json version
#   ./scripts/verify-deploy.sh 10.63.2        # explicit version
#   ./scripts/verify-deploy.sh --wait 180     # max wait seconds (default 120)
#   ./scripts/verify-deploy.sh --no-wait      # one-shot check, no polling
#
# Exit codes:
#   0 — both HTML and sw.js show the expected version
#   1 — version mismatch after wait window
#   2 — usage error or network failure

set -u

LIVE_HTML='https://eiasash.github.io/Geriatrics/shlav-a-mega.html'
LIVE_SW='https://eiasash.github.io/Geriatrics/sw.js'
WAIT_MAX=120
INTERVAL=10
ONESHOT=0
VERSION=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wait) WAIT_MAX="$2"; shift 2;;
    --no-wait) ONESHOT=1; shift;;
    -h|--help) sed -n '1,30p' "$0"; exit 0;;
    -*) echo "verify-deploy: unknown flag $1" >&2; exit 2;;
    *) VERSION="$1"; shift;;
  esac
done

if [[ -z "$VERSION" ]]; then
  if ! VERSION=$(node -p "require('./package.json').version" 2>/dev/null); then
    echo "verify-deploy: cannot read package.json version" >&2
    exit 2
  fi
fi

echo "verify-deploy: expecting v${VERSION}"
echo "  HTML: ${LIVE_HTML}"
echo "  SW:   ${LIVE_SW}"

start=$(date +%s)
while true; do
  html_ok=0
  sw_ok=0

  html_body=$(curl -sf -A 'Mozilla/5.0 verify-deploy' --max-time 15 "${LIVE_HTML}" || true)
  sw_body=$(curl -sf -A 'Mozilla/5.0 verify-deploy' --max-time 15 "${LIVE_SW}" || true)

  if printf '%s' "$html_body" | grep -qE "APP_VERSION[[:space:]]*=[[:space:]]*['\"]${VERSION}['\"]"; then
    html_ok=1
  fi
  if printf '%s' "$sw_body" | grep -qF "shlav-a-v${VERSION}"; then
    sw_ok=1
  fi

  if [[ "$html_ok" = 1 && "$sw_ok" = 1 ]]; then
    elapsed=$(( $(date +%s) - start ))
    echo "  HTML APP_VERSION=${VERSION}    PASS"
    echo "  SW   CACHE=shlav-a-v${VERSION}  PASS"
    echo "verify-deploy: PASS (after ${elapsed}s)"
    exit 0
  fi

  elapsed=$(( $(date +%s) - start ))
  if [[ "$ONESHOT" = 1 ]] || (( elapsed >= WAIT_MAX )); then
    echo ""
    echo "verify-deploy: FAIL after ${elapsed}s"
    [[ "$html_ok" = 0 ]] && echo "  ✗ live HTML missing APP_VERSION='${VERSION}'"
    [[ "$sw_ok" = 0 ]] && echo "  ✗ live sw.js missing 'shlav-a-v${VERSION}'"
    echo ""
    echo "Possible causes:"
    echo "  - GitHub Pages still building — wait 30s, retry"
    echo "  - Push didn't land on main"
    echo "  - Trinity drift — run: python3 scripts/check-version-sync.py"
    echo "  - CDN cache — try cache-busted URL: ${LIVE_HTML}?v=${VERSION}"
    exit 1
  fi

  echo "  ...polling (html=${html_ok} sw=${sw_ok}, ${elapsed}s/${WAIT_MAX}s) — sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done
