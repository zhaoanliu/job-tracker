#!/bin/bash
# Canonical `claude -p` retry loop with exponential backoff on 529/overload.
# Called by .github/actions/run-claude, and directly by call sites that invoke
# claude multiple times inside a single step (verify-ac, feature-implement) —
# a composite action cannot be called from inside a shell loop.
#
# Usage: run-claude-retry.sh <prompt-file> <max-turns> [output-file] [max-attempts] [extra-flags]
#
# Always exits 0 after the final attempt — callers decide how to react to
# Claude's output (diff check, generated files, summary files).
set -uo pipefail

PROMPT_FILE=$1
MAX_TURNS=$2
OUTPUT_FILE=${3:-/tmp/claude_output.txt}
MAX_ATTEMPTS=${4:-3}
EXTRA_FLAGS=${5:-}

DELAY=30
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  CLAUDE_ARGS=(--max-turns "$MAX_TURNS" -p "$(cat "$PROMPT_FILE")")
  if [[ -n "$EXTRA_FLAGS" ]]; then
    read -ra EXTRA <<< "$EXTRA_FLAGS"
    CLAUDE_ARGS+=("${EXTRA[@]}")
  fi
  claude "${CLAUDE_ARGS[@]}" 2>&1 | tee "$OUTPUT_FILE"
  CLAUDE_EXIT=${PIPESTATUS[0]}
  echo ""
  if [[ $CLAUDE_EXIT -eq 0 ]]; then exit 0; fi
  if grep -q "529\|Overloaded\|at capacity" "$OUTPUT_FILE" && [[ $attempt -lt $MAX_ATTEMPTS ]]; then
    echo "API overloaded (attempt $attempt/$MAX_ATTEMPTS), retrying in ${DELAY}s..."
    sleep "$DELAY"
    DELAY=$((DELAY * 2))
  else
    echo "claude exited with code $CLAUDE_EXIT (attempt $attempt/$MAX_ATTEMPTS), continuing"
    exit 0
  fi
done
exit 0
