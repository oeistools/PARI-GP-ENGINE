#!/usr/bin/env bash
# Install PARI-GP-ENGINE into the current Quarto project, after checking that
# everything it needs is present.
#
#   ./install.sh            check the prerequisites, then install the extension
#   ./install.sh --check    only report what is present and what is missing
#   ./install.sh --no-check install without checking first
#
# The extension can also be installed directly, without cloning this repo:
#
#   quarto add oeistools/PARI-GP-ENGINE
set -uo pipefail

REPO="oeistools/PARI-GP-ENGINE"
QUARTO_MIN="1.9.0"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

# Compare dotted versions: version_ge 1.9.38 1.9.0
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

MISSING=0

check_quarto() {
  if ! command -v quarto >/dev/null 2>&1; then
    bad "quarto not found — install it from https://quarto.org/docs/download/"
    MISSING=$((MISSING+1)); return
  fi
  local v; v="$(quarto --version 2>/dev/null)"
  if version_ge "$v" "$QUARTO_MIN"; then
    ok "quarto $v (engine extensions need >= $QUARTO_MIN)"
  else
    bad "quarto $v is too old — engine extensions need >= $QUARTO_MIN"
    MISSING=$((MISSING+1))
  fi
}

check_gp() {
  local gp="${GP:-gp}"
  if ! command -v "$gp" >/dev/null 2>&1; then
    bad "$gp not found — install PARI/GP from https://pari.math.u-bordeaux.fr/download.html"
    echo "        Debian/Ubuntu : sudo apt install pari-gp"
    echo "        macOS         : brew install pari"
    echo "        Fedora        : sudo dnf install pari-gp"
    echo "        conda         : conda install -c conda-forge pari"
    echo
    echo "        If gp is installed somewhere else, put this in your document:"
    echo "            pari-gp:"
    echo "              path: /path/to/gp"
    MISSING=$((MISSING+1)); return
  fi
  local v; v="$("$gp" --version 2>&1 | sed -n 's/.*Version \([0-9.]*\).*/\1/p' | head -1)"
  ok "$gp ${v:-(version unknown)} at $(command -v "$gp")"

  # A working gp must actually evaluate something.
  local answer; answer="$(printf 'print(6*7)\nquit\n' | "$gp" -q -f 2>&1 | tr -d '[:space:]')"
  if [ "$answer" = "42" ]; then
    ok "$gp evaluates expressions correctly"
  else
    bad "$gp did not evaluate 6*7 as expected (got: ${answer:-<nothing>})"
    MISSING=$((MISSING+1))
  fi
}

check_extension() {
  if [ -f "_extensions/pari-gp/pari-gp.js" ] ||
     [ -f "_extensions/oeistools/pari-gp/pari-gp.js" ]; then
    ok "the pari-gp engine is installed in this project"
  else
    warn "the pari-gp engine is not installed in this project yet"
  fi
}

echo "PARI-GP-ENGINE — checking prerequisites"
echo
check_quarto
check_gp
[ "${1:-}" = "--check" ] && check_extension
echo

if [ "${1:-}" = "--check" ]; then
  if [ "$MISSING" -eq 0 ]; then echo "Everything needed is present."; exit 0
  else echo "$MISSING requirement(s) missing."; exit 1; fi
fi

if [ "$MISSING" -ne 0 ] && [ "${1:-}" != "--no-check" ]; then
  echo "Not installing: $MISSING requirement(s) missing (use --no-check to override)."
  exit 1
fi

echo "Installing $REPO into $(pwd) ..."
if quarto add "$REPO" --no-prompt; then
  echo
  ok "installed"
  cat <<'EOT'

Use it by setting the engine in a document's front matter:

    ---
    title: "My document"
    engine: pari-gp
    ---

    ```{gp}
    factor(2^100 - 1)
    ```

Then: quarto render my-document.qmd
EOT
else
  echo
  bad "quarto add failed"
  exit 1
fi
