#!/usr/bin/env bash
# Install the published extension the way a user does and render with it.
#
#   ./tests/clean-install.sh            install v$(cat VERSION)
#   ./tests/clean-install.sh v0.1.0     install that release
#   ./tests/clean-install.sh --local    install from this working tree instead
#
# This is the one test that does not use the repository: it runs `quarto add`
# in an empty directory outside it, so nothing — not `_quarto.yml`, not the
# `_extensions` at the repository root — can make a broken release look
# installable. It was done by hand for 0.1.0; a rotting release is exactly the
# kind of thing nobody notices until someone tries to install it.
set -uo pipefail

REPO_SLUG="${REPO_SLUG:-oeistools/PARI-GP-ENGINE}"
root="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

case "${1:---release}" in
  --local) source="$root" ;;
  --release) source="$REPO_SLUG@v$(cat "$root/VERSION")" ;;
  v*) source="$REPO_SLUG@$1" ;;
  *) source="$1" ;;
esac

# Outside the repository, so that a standalone render is really standalone:
# a document under the project root would find _extensions without installing.
work="$(mktemp -d "${TMPDIR:-/tmp}/qpg-clean-install.XXXXXX")"
trap 'rm -rf "$work"' EXIT

echo "installing $source into $work"
echo

cat > "$work/smoke.qmd" <<'QMD'
---
title: "Clean install"
engine: pari-gp
format: html
---

Execution and session state:

```{gp}
p = nextprime(10^20)
```

```{gp}
factor(p - 1)
```

Inline code in prose: the prime has `{gp} #Str(p)` digits.

Highlighting without execution:

```gp
\\ a comment
E = ellinit([0, -1, 1, 0, 0]);
E.disc
```

A figure:

```{gp}
#| label: fig-sine
#| fig-cap: "A sine wave"
plothexport("svg", X = -3, 3, sin(X))
```
QMD

cd "$work" || exit 1

if ! quarto add "$source" --no-prompt >"$work/add.log" 2>&1; then
  red "ERROR  quarto add $source failed"; sed 's/^/       /' "$work/add.log" | tail -20
  exit 1
fi
green "installed $(find "$work/_extensions" -name _extension.yml -exec \
                    sed -n 's/^version: */version /p' {} +)"

# The XML ships alongside the engine; an archive that dropped it would still
# install, and every document would then render without highlighting.
for f in _extension.yml pari-gp.js pari-gp.xml; do
  if find "$work/_extensions" -name "$f" | grep -q .; then
    green "  PASS  the installed extension contains $f"; PASS=$((PASS+1))
  else
    red   "  FAIL  the installed extension is missing $f"; FAIL=$((FAIL+1))
  fi
done

if ! quarto render smoke.qmd --to html >"$work/render.log" 2>&1; then
  red "ERROR  rendering failed"; sed 's/^/       /' "$work/render.log" | tail -30
  exit 1
fi

check() {
  if grep -qF -- "$1" "$work/smoke.html"; then
    green "  PASS  $2"; PASS=$((PASS+1))
  else
    red   "  FAIL  $2 (expected: $1)"; FAIL=$((FAIL+1))
  fi
}

check 'class="sourceCode parigp"' 'the syntax definition reached pandoc'
check '<span class="fu">ellinit</span>' 'PARI/GP code is highlighted'
check '100000000000000000039'    'a cell was executed'
check '507526619771207'          'the second cell saw the first cell state'
check 'has 21 digits'            'inline code was evaluated'
check '<svg'                     'an exported plot became an inline figure'
check 'Figure&nbsp;1'            'the figure is numbered'

echo
if [ "$FAIL" -eq 0 ]; then green "$PASS passed, 0 failed"; exit 0
else red "$PASS passed, $FAIL failed"; exit 1; fi
