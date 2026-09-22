# PLAN

Where this project is going, and what has already been settled. The point of
this file is that a decision made once should not have to be re-argued.

## Goal

Make PARI/GP a first-class language in Quarto: executable code cells, correct
highlighting, and an install that is one command.

## Status — v0.1.0

Done and tested:

- Engine extension (`engine: pari-gp`) executing ` ```{gp} ` cells.
- One gp session per document; state carries across cells.
- Cell options `eval`, `echo`, `output`/`asis`, `error`, `include`, `classes`,
  `filename`; document options under `pari-gp:`.
- Errors stop the render by default, or render inline with `#| error: true`;
  gp warnings never stop a render.
- Syntax definition covering all 1200 PARI/GP 2.17 functions, generated from
  the installed `gp`, injected into Pandoc by the engine itself.
- `install.sh` / `install.ps1` with prerequisite checks, Makefile, test suite.

## Settled decisions

These were decided deliberately; change them only with a reason.

**Batch execution, not a persistent co-process.**
Quarto's engine API is one call that takes the whole document and returns
markdown, so there is nothing to stream to. All cells are concatenated into one
gp script with a sentinel `print()` after each, run through a single `gp`, and
the output is split on the sentinels. This gives session state for free and is
deterministic.

**stderr is merged into stdout by the shell, not by reading two pipes.**
A gp error is emitted *between* two results of the same cell. Reading two pipes
loses that position; `2>&1` in the shell preserves it. The cost is a `/bin/sh`
(or `cmd`) in between, which is acceptable.

**A figure is recognised by its output, not by a cell option.**
gp has no "current figure" to capture: a plot arrives because the author asked
for it by calling an `…export` function, whose value *is* the SVG. Detecting
SVG output therefore covers every such function at once, with no list to keep
up to date. gp prints a string wrapped in double quotes, so both the quoted and
the `print()`ed form are accepted.

**A sentinel after the start-up code.**
gp's own chatter — notably `*** Warning: new stack size` — would otherwise be
attributed to the first cell.

**`*** Warning:` is not an error.**
gp prefixes warnings and errors alike with `***`. Treating every `***` line as
an error made documents fail to render merely because the stack grew.

**`gp -q -f`.**
`-f` skips the user's `gprc` so a document renders the same everywhere. Both
flags come first, so `args:` in the front matter can still override them.

**The syntax definition is generated, not hand-written.**
`tools/gen_xml.py` asks the installed gp for its function list. Hand-maintaining
1200 names across PARI releases is not realistic. Each help category is queried
in its own gp invocation: piping several `?n` into one session silently drops
some categories.

**The compiled `pari-gp.js` is committed.**
That is the file Quarto loads on `quarto add`; users must not need Deno.

**MIT, and gp is driven as an external program.**
No PARI source is included or linked, so the GPL does not reach this code.

## Done since 0.1.0 (unreleased)

**Figures.** A cell whose output is an SVG document becomes a figure, which
covers all three gp functions that return SVG: `plothexport`,
`plothrawexport` and `plotexport`. Inline in HTML, a file in `_files`
elsewhere, with `fig-cap`, `fig-alt`, `fig-width` and `label` for
cross-references. `ploth`/`plothraw`/`plotdraw` need a screen device and
`psploth` writes PostScript, so neither is captured — documented, not a bug.

**Inline code.** `` `{gp} expr` `` in prose is evaluated in document order, so
it sees the state the cells above it left. Occurrences inside fenced blocks
are left alone.

**Documentation site.** `docs/` is a Quarto website that exercises the engine
on every page, deployed to GitHub Pages.

## Next

**v0.2 — caching.** Implement `canFreeze` and Quarto's freeze mechanism so a
long factorisation is not recomputed on every render. Needs a cache key over
the concatenated cell sources plus the `pari-gp:` configuration. This is now
the largest gap against knitr and jupyter, and the next thing to do.

**v0.3 — better output shaping.** An option for gp's `output` default
(prettymatrix vs raw), and optional LaTeX output via gp's `\x`/TeX mode so that
results can be typeset as maths rather than monospace.

**Later — a `gp` cell language under other engines.** Quarto allows only one
engine per document, which means a document cannot mix `{gp}` and `{python}`.
A cell *language handler* rather than an engine would lift that, and is the
right answer for people who want both.

## Not planned

- Bundling PARI/GP itself. It is a large GPL program with platform-specific
  builds; depending on the system package is correct.
- A `cypari2`/Python bridge. It adds a Python dependency to reach the same
  interpreter this already drives directly.
