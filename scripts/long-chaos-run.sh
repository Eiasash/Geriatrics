#!/usr/bin/env bash
# Long chaos run + audit analyzer for chaos-doctor-bot v4 (v10.64.114+).
#
# Default config is calibrated from the v114 smoke validation:
#   - 1 worker (proxy 429s on 3+ workers per v114 smoke: 48% failure rate)
#   - 4 hours
#   - sonnet-4-6 (cheap, judge-quality validated in v114)
#   - $25 cost cap (well under expected $5-8 cost)
#   - proxy mode (no personal Anthropic key needed)
#
# Three audits emerge from the same JSONL ledger:
#   1. explanation soundness  →  judge.explanation_sound = false @ conf >= 85
#   2. citation plausibility  →  source.citation_plausible = false
#   3. answer-key disagreements →  judge.app_answer_correct = false @ conf >= 85
#                                  (v10.64.121: was conf >= 90, dropped after
#                                   2026-05-13 calibration pilot — [85,90) band
#                                   71% Opus survival; do NOT auto-flip —
#                                   triage queue, not a fix)
#
# Usage:
#   bash scripts/long-chaos-run.sh                  # 4 hours, 1 worker, defaults
#   CHAOS_USERS=2 bash scripts/long-chaos-run.sh    # 2 workers (watch for 429s)
#   CHAOS_DURATION_MS=7200000 bash scripts/long-chaos-run.sh  # 2 hours
#
# Or skip the run, analyze an existing JSONL:
#   bash scripts/long-chaos-run.sh --analyze chaos-reports/v4-long
#
# Eias's CLAUDE_API_KEY is NOT needed — proxy mode is the default here.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="${CHAOS_REPORT_DIR:-$REPO_ROOT/chaos-reports/v4-long}"
mkdir -p "$REPORT_DIR"

if [[ "${1:-}" == "--analyze" ]]; then
  ANALYZE_DIR="${2:-$REPORT_DIR}"
  exec node "$REPO_ROOT/scripts/long-chaos-analyze.mjs" "$ANALYZE_DIR"
fi

export CHAOS_USE_PROXY=1
export CHAOS_USERS="${CHAOS_USERS:-1}"
export CHAOS_DURATION_MS="${CHAOS_DURATION_MS:-14400000}"   # 4 hours
export CHAOS_HEADLESS="${CHAOS_HEADLESS:-1}"
export CHAOS_MODEL="${CHAOS_MODEL:-claude-sonnet-4-6}"
export CHAOS_COST_CAP_USD="${CHAOS_COST_CAP_USD:-25}"
export CHAOS_SCREENSHOTS="${CHAOS_SCREENSHOTS:-0}"
export CHAOS_REPORT_DIR="$REPORT_DIR"
export CHAOS_FEEDBACK_RATE="${CHAOS_FEEDBACK_RATE:-0.05}"   # cut from default 0.10
export CHAOS_REPORT_RATE="${CHAOS_REPORT_RATE:-0.0}"        # disable bug reports — read-only

echo "[long-chaos] starting"
echo "  workers       = $CHAOS_USERS"
echo "  duration      = $((CHAOS_DURATION_MS / 60000)) min"
echo "  model         = $CHAOS_MODEL"
echo "  cost cap      = \$${CHAOS_COST_CAP_USD}"
echo "  report dir    = $REPORT_DIR"
echo "  feedback rate = $CHAOS_FEEDBACK_RATE (disabled report rate)"
echo

cd "$REPO_ROOT"
node scripts/chaos-doctor-bot-v4.mjs

echo
echo "[long-chaos] run complete — running analyzer"
node "$REPO_ROOT/scripts/long-chaos-analyze.mjs" "$REPORT_DIR"
