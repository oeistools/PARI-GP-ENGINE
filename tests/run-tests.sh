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

run_case inline \
  present 'is 100000000000000000039'  'inline code is evaluated' \
  present 'has 21 digits'             'inline code sees the state of earlier cells' \
  present '`{gp} p`'                  'inline code inside a fenced block is left alone' \
  present 'still works: 1024'         'substitution resumes after a fenced block'

# Highlighting is a component of its own: pari-gp.xml is useful without the
# engine, and gen_xml.py depends on what gp prints, which has silently dropped
# whole categories before. Assert on both the generated list and the render.
run_case highlight \
  present '<span class="co">\\ a line comment'    'a \\ comment is highlighted' \
  present '<span class="co">/* a block comment'  'a /* */ comment is highlighted' \
  present '<span class="pp">\p</span>'            'a metacommand is highlighted' \
  present '<span class="pp">?factor</span>'      'a help query is highlighted' \
  present '<span class="at">.disc</span>'        'member access is highlighted' \
  present '<span class="bn">0xFF</span>'         'a hex literal is highlighted' \
  present '<span class="fl">1.23e-10</span>'     'a float literal is highlighted' \
  present '<span class="cf">for</span>'          'a control-flow keyword is highlighted' \
  present '<span class="fu">nextprime</span>'    'a function name is highlighted' \
  present '<span class="sc">\n</span>'            'a string escape is highlighted'

# The keyword list itself: one name from each corner of the function set, so
# that a category dropped by gen_xml.py is noticed here rather than by a user.
if [ -z "$FILTER" ] || [[ "syntax" == *"$FILTER"* ]]; then
  echo "• syntax"
  xml=_extensions/pari-gp/pari-gp.xml
  for fn in nextprime factor bnfinit ellinit mfinit lfun; do
    check "$xml" present "<item>$fn</item>" "the function list contains $fn"
  done
  n=$(grep -c '<item>' "$xml")
  if [ "$n" -ge 1000 ]; then
    green "  PASS  the function list has $n entries"; PASS=$((PASS+1))
  else
    red   "  FAIL  the function list has only $n entries; a category was dropped"
    FAIL=$((FAIL+1))
  fi
fi

run_case figures \
  present '<svg'                'an exported SVG becomes an inline figure' \
  absent  '&quot;&lt;svg'       'the quotes gp puts around a string are stripped' \
  absent  '<?xml'               'the XML prolog is not inlined into the page' \
  present 'role="img"'          'the figure is exposed as an image' \
  present 'A sine wave'         'fig-alt becomes the accessible name' \
  present 'href="#fig-zeta"'    'a labelled figure can be cross-referenced' \
  present 'Figure&nbsp;1'       'a labelled figure is numbered'

# Non-HTML formats get a file on disk instead of an inline SVG.
if [ -z "$FILTER" ] || [[ "figures" == *"$FILTER"* ]]; then
  echo "• figures (non-HTML)"
  rm -rf tests/cases/figures_files
  if quarto render tests/cases/figures.qmd --to gfm >/tmp/qpg-gfm.log 2>&1; then
    if [ -f tests/cases/figures_files/figure-gp/fig-zeta.svg ]; then
      green "  PASS  the figure is written next to the document"; PASS=$((PASS+1))
    else
      red   "  FAIL  no SVG file was written"; FAIL=$((FAIL+1))
    fi
    check tests/cases/figures.md present '](figures_files/figure-gp/' \
      'the document references the figure file'
  else
    red "  ERROR rendering tests/cases/figures.qmd to gfm"; FAIL=$((FAIL+1))
  fi
fi

# Freezing: a second render must replay the cache instead of re-running gp,
# and the cached pandoc options must not contain an absolute path, because
# _freeze/ is committed and replayed on other machines.
if [ -z "$FILTER" ] || [[ "freeze" == *"$FILTER"* ]]; then
  echo "• freeze"
  rm -rf _freeze tests/freeze/freeze.html
  if quarto render tests/freeze/freeze.qmd --to html >/tmp/qpg-frz.log 2>&1; then
    first=$(grep -oE '[0-9]{15,}' tests/freeze/freeze.html | head -1)
    quarto render tests/freeze/freeze.qmd --to html >/tmp/qpg-frz2.log 2>&1
    second=$(grep -oE '[0-9]{15,}' tests/freeze/freeze.html | head -1)
    if [ -n "$first" ] && [ "$first" = "$second" ]; then
      green "  PASS  a frozen document is not re-executed"; PASS=$((PASS+1))
    else
      red   "  FAIL  the document was re-executed despite freeze: true"; FAIL=$((FAIL+1))
    fi
    frz=$(find _freeze -name '*.json' | head -1)
    if grep -q '"\.\./' "$frz" && ! grep -q '"syntax-definitions":\["/' "$frz"; then
      green "  PASS  the cached syntax-definition path is relative"; PASS=$((PASS+1))
    else
      red   "  FAIL  the cached syntax-definition path is not relative"; FAIL=$((FAIL+1))
    fi
    check tests/freeze/freeze.html present 'parigp' 'a frozen document is still highlighted'
  else
    red "  ERROR rendering tests/freeze/freeze.qmd"; FAIL=$((FAIL+1))
  fi
fi

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
