#!/usr/bin/env bash
# Render every test document and check the output for the expected markers.
#
#   ./tests/run-tests.sh          run all tests
#   ./tests/run-tests.sh state    run tests whose name matches "state"
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
FILTER="${1:-}"
PASS=0; FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# check <file> <present|absent> <pattern> <description>
check() {
  local file="$1" mode="$2" pat="$3" desc="$4"
  if grep -qF -- "$pat" "$file"; then found=yes; else found=no; fi
  if { [ "$mode" = present ] && [ "$found" = yes ]; } ||
     { [ "$mode" = absent ]  && [ "$found" = no  ]; }; then
    green "  PASS  $desc"; PASS=$((PASS+1))
  else
    red   "  FAIL  $desc (expected $mode: $pat)"; FAIL=$((FAIL+1))
  fi
}

render() {
  local qmd="$1"
  if ! quarto render "$qmd" --to html >/tmp/qpg-render.log 2>&1; then
    red "  ERROR rendering $qmd"; sed 's/^/        /' /tmp/qpg-render.log | tail -20
    return 1
  fi
  return 0
}

run_case() {
  local name="$1"; shift
  [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]] && return 0
  echo "• $name"
  local qmd="tests/cases/$name.qmd" html="tests/cases/$name.html"
  if ! render "$qmd"; then FAIL=$((FAIL+1)); return; fi
  while [ $# -gt 0 ]; do
    check "$html" "$1" "$2" "$3"; shift 3
  done
}

echo "quarto $(quarto --version)   gp $(gp --version 2>&1 | sed -n 's/.*Version \([0-9.]*\).*/\1/p' | head -1)"
echo

run_case state \
  present '42'                  'variable set in cell 1 is visible in cell 2' \
  present 'parigp'              'code is highlighted with the PARI/GP definition'

run_case options \
  absent  'ECHO_HIDDEN_CODE")'  'echo: false hides the source' \
  present 'ECHO_HIDDEN_CODE'    'echo: false still shows the output' \
  absent  'OUTPUT_HIDDEN<'      'output: false hides the output' \
  present 'OUTPUT_HIDDEN"'      'output: false still shows the source' \
  present 'NEVER_RUN'           'eval: false still shows the source' \
  absent  'NOT_INCLUDED'        'include: false drops the cell entirely'

run_case errors \
  present 'cell-output-error'   'gp errors are marked as error output' \
  present 'impossible inverse'  'the gp error text is shown' \
  present '42'                  'the session survives an error'

run_case config \
  present '3.14159265358979323846' 'precision: 50 is applied' \
  present '12345'                  'prelude is executed'

run_case asis \
  present '<h2'                 'output: asis is interpreted as markdown'

# The error case must make the render fail.
if [ -z "$FILTER" ] || [[ "fail-on-error" == *"$FILTER"* ]]; then
  echo "• fail-on-error"
  if quarto render tests/expect-fail/fail-on-error.qmd --to html >/tmp/qpg-fail.log 2>&1; then
    red   "  FAIL  an unhandled gp error should stop the render"; FAIL=$((FAIL+1))
  else
    green "  PASS  an unhandled gp error stops the render"; PASS=$((PASS+1))
    if grep -q 'error: true' /tmp/qpg-fail.log; then
      green "  PASS  the message explains how to allow the error"; PASS=$((PASS+1))
    else
      red   "  FAIL  the message should mention 'error: true'"; FAIL=$((FAIL+1))
    fi
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then green "$PASS passed, 0 failed"; exit 0
else red "$PASS passed, $FAIL failed"; exit 1; fi
