# PLAN

Where this project is going, and what has already been settled. The point of
this file is that a decision made once should not have to be re-argued.

## Goal

Make PARI/GP a first-class language in Quarto: executable code cells, correct
highlighting, and an install that is one command.

## Status — v0.1.0, released 2026-09-22

Done and tested:

- Engine extension (`engine: pari-gp`) executing ` ```{gp} ` cells.
- One gp session per document; state carries across cells.
- Cell options `eval`, `echo`, `output`/`asis`, `error`, `include`, `classes`,
  `filename`; document options under `pari-gp:`.
- Errors stop the render by default, or render inline with `#| error: true`;
  gp warnings never stop a render.
- Syntax definition covering the PARI/GP 2.17 function set, generated from
  the installed `gp`, injected into Pandoc by the engine itself.
- `install.sh` / `install.ps1` with prerequisite checks, Makefile, test suite.

Also in 0.1.0:

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

**Caching.** `canFreeze` is on, so `freeze: auto` / `freeze: true` work and
`_freeze/` replays instead of re-running gp. Quarto owns the cache key; the
engine only had to make what it stores portable — see the decision below.


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

**The syntax-definition path handed to pandoc is relative to the document.**
A frozen result is stored in `_freeze/`, which is committed and replayed on
other machines and in CI; an absolute path baked in there would not exist on
the next machine. The base is `options.cwd`, which is the document's own
directory in both render modes — `options.target.input` is absolute in a
project render but relative in a standalone one, so it cannot be used.

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
~1200 names across PARI releases is not realistic. Each help category is queried
in its own gp invocation: piping several `?n` into one session silently drops
some categories.

**The compiled `pari-gp.js` is committed.**
That is the file Quarto loads on `quarto add`; users must not need Deno.

**MIT, and gp is driven as an external program.**
No PARI source is included or linked, so the GPL does not reach this code.

## Next

Triaged from the review in `draft/Mejoras del repositorio.md` (2026-09-22).
Two of its red-priority items — publish a release, and check `quarto add`
against it — are **done**: v0.1.0 is published, and installing from it into an
empty directory was verified by hand. Its suggestion to renumber the first
release 0.2.0 was considered and declined: nothing had been published, so
there was no earlier release to differentiate from.

### Robustness (do first)

**Automate the clean-install test.** `quarto add oeistools/PARI-GP-ENGINE@vX`
into an empty directory, render a document that exercises execution, inline
code, highlighting and a figure, and assert on the output. This was done by
hand for 0.1.0; it should be a job so it cannot silently rot.

**Assert on the generated syntax definition.** `tools/gen_xml.py` depends on
what `gp` prints, which has already bitten us once (whole categories silently
missing). Add a test that the XML contains representative functions —
`nextprime`, `factor`, `bnfinit`, `ellinit`, `mfinit`, `lfun` — and that the
special constructs still highlight: `\p`, `?factor`, `E.disc`, `0xFF`,
`1.23e-10`, `\\` and `/* */` comments.

**A PARI/GP version matrix in CI.** The review proposed 2.15 / 2.16 / 2.17.
Note that conda-forge has **no 2.16** — the usable linux-64 versions are
2.13.3, 2.15.5 and 2.17.3, so the matrix should be those. This matters most
for `gen_xml.py` and for the `*** Warning:` parsing.

### Presentation

**Restructure the README so Install / Use / Render come first**, before the
explanation, and add a visible statement that there are two independent
components: the engine (`engine: pari-gp`) and the syntax definition
(`pari-gp.xml`), which is useful on its own for highlighting without
execution. A short compatibility card (Quarto >= 1.9, PARI/GP 2.17+, MIT)
would help too.

**More examples.** `examples/` currently has two documents. A numbered series
— factorisation, primes, elliptic curves, number fields, zeta, plots — would
show what the combination can do far better than prose.

**A single compact options table** in `docs/options.qmd` (option, scope,
default) before the detailed sections.

### Features

**v0.3 — better output shaping.** An option for gp's `output` default
(prettymatrix vs raw), and optional LaTeX output via gp's `\x`/TeX mode so
that results can be typeset as maths rather than monospace. `prelude` is the
workaround today.

**Later — a `gp` cell language under other engines.** Quarto allows only one
engine per document, so a document cannot mix `{gp}` and `{python}`. A cell
*language handler* rather than an engine would lift that.

### Future architecture

The review makes a good point that PARI/GP language support is potentially
larger than one Quarto engine:

```text
PARI/GP language support
        ├── Quarto engine          (this repository)
        ├── syntax highlighting    (this repository, reusable on its own)
        ├── Jupyter kernel
        └── VS Code integration
```

Nothing here is committed. It is recorded so the repository is not painted
into a corner: the syntax definition is already a standalone file, and the
engine already treats gp as an external program, which keeps both options
open. ER2 can depend on this rather than absorbing it.

### Decided against

**Renaming `engine: pari-gp` / ` ```{gp} `.** The split is deliberate — the
engine is `pari-gp`, the language is `gp` — and the review agreed.

## Not planned

- Bundling PARI/GP itself. It is a large GPL program with platform-specific
  builds; depending on the system package is correct.
- A `cypari2`/Python bridge. It adds a Python dependency to reach the same
  interpreter this already drives directly.
