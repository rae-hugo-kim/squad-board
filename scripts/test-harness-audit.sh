#!/usr/bin/env bash
# scripts/test-harness-audit.sh — TDD test driver for harness-audit.sh
#
# Runs harness-audit.sh against fixtures and asserts the total score falls
# within an expected range. Three cases:
#   1) empty fixture       → 0/70
#   2) minimal AGENTS.md   → small non-zero (1..5)
#   3) the host repo       → substantial non-zero (40..70)
#
# Exits non-zero on any failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIT="$SCRIPT_DIR/harness-audit.sh"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

PASS=0
FAIL=0
TMPDIRS=()

cleanup() {
  for d in "${TMPDIRS[@]}"; do
    [[ -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup EXIT

run_case() {
  local name="$1"
  local fixture="$2"
  local min="$3"
  local max="$4"

  local out total
  if ! out=$(bash "$AUDIT" --root "$fixture" --terse 2>&1); then
    echo "FAIL: $name — script exit non-zero"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    return
  fi

  total=$(printf '%s\n' "$out" | sed -n 's/^TOTAL: \([0-9][0-9]*\)\/70$/\1/p' | head -1)
  if [[ -z "$total" ]]; then
    echo "FAIL: $name — no parseable TOTAL line"
    printf '%s\n' "$out" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    return
  fi

  if (( total >= min && total <= max )); then
    echo "PASS: $name — total=$total (expected $min..$max)"
    PASS=$((PASS+1))
  else
    echo "FAIL: $name — total=$total (expected $min..$max)"
    printf '%s\n' "$out" | sed 's/^/    /'
    FAIL=$((FAIL+1))
  fi
}

# --- fixture 1: empty dir ---
F1=$(mktemp -d)
TMPDIRS+=("$F1")
run_case "empty fixture" "$F1" 0 0

# --- fixture 2: only AGENTS.md with model_routing block ---
F2=$(mktemp -d)
TMPDIRS+=("$F2")
cat > "$F2/AGENTS.md" <<'AGENTS_EOF'
# AGENTS.md
<model_routing>
haiku / sonnet / opus
</model_routing>
AGENTS_EOF
run_case "minimal AGENTS.md only" "$F2" 1 5

# --- fixture 3: actual host repo ---
run_case "host repo" "$REPO_ROOT" 40 70

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
