# PLAN

What this project set out to do, what it did, and what it deliberately did
not do. The point of this file is that a decision made once should not have
to be re-argued — and now that the project is finished, that the next reader
can tell quickly what is here and what is not.

## Status — finished at v0.2.1, 2026-09-23

**This project is complete.** v0.2.0 is the feature release and v0.2.1 a
CI-only follow-up; nothing that `quarto add` installs differs between them.
The goal the project set itself was to make PARI/GP a
first-class language in Quarto: executable code cells, correct highlighting,
and an install that is one command. That is done, released, and verified by
installing the published release and rendering with it, on Linux and macOS,
against three PARI/GP versions.

Nothing further is planned. The repository stays as it is — issues and the
weekly clean-install job keep running — but the work is over, and the
sections below are a record rather than a backlog. Anyone who wants to carry
it further will find the open ends listed under *Left undone*.

## What it does

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

Also shipped:

**Figures.** A cell whose output is an SVG document becomes a figure, which
covers all three gp functions that return SVG: `plothexport`,
`plothrawexport` and `plotexport`. Inline in HTML, a file in `_files`
elsewhere, with `fig-cap`, `fig-alt`, `fig-width` and `label` for
cross-references. `ploth`/`plothraw`/`plotdraw` need a screen device and
`psploth` writes PostScript, so none of the four is captured — documented,
not a bug.

**Inline code.** `` `{gp} expr` `` in prose is evaluated in document order, so
it sees the state the cells above it left. Occurrences inside fenced blocks
are left alone.

**Documentation site.** `docs/` is a Quarto website that exercises the engine
on every page, deployed to GitHub Pages.

**Caching.** `canFreeze` is on, so `freeze: auto` / `freeze: true` work and
`_freeze/` replays instead of re-running gp. Quarto owns the cache key; the
engine only had to make what it stores portable — see the decision below.
Quarto honours `freeze` only in a whole-project render, which is why
`tests/freeze/` is a project of its own.

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

## What 0.2.0 added

Triaged from the review in `draft/Mejoras del repositorio.md` (2026-09-22).
Both of its red-priority items — publish a release, and check `quarto add`
against it — were done for 0.1.0. Its suggestion to renumber the first
release 0.2.0 was considered and declined: nothing had been published, so
there was no earlier release to differentiate from. Everything else it raised
is below.

### Robustness

All three items are in, and each was verified against a real install and real
gp builds rather than only by a green workflow.

**The clean-install test is automated.** `tests/clean-install.sh`
(`make clean-install`) runs `quarto add` in an empty directory *outside* the
repository and renders a document using execution, inline code, highlighting
and a figure. `REF=--local` installs the working tree instead, which is what
`test.yml` runs on every push; `release.yml` runs it against the tag it has
just published, and `clean-install.yml` runs it weekly, which is what would
catch a release broken by a newer Quarto or PARI/GP months later. Verified
against the published v0.1.0 and v0.2.0 on Linux and macOS.

One wrinkle worth knowing: a release published by `release.yml` is created
with `GITHUB_TOKEN`, and GitHub does not start workflow runs from
`GITHUB_TOKEN` events, so an `on: release` trigger never fires for it. That
is why the post-release check lives in `release.yml` itself. GitHub also
disables scheduled workflows after 60 days without repository activity, so
on a finished project the weekly run eventually stops until someone pushes.

**The syntax definition is asserted on.** `tests/cases/highlight.qmd` checks
that `\p`, `?factor`, `E.disc`, `0xFF`, `1.23e-10`, `\\` and `/* */`
comments and string escapes still highlight, and a `syntax` section checks the
generated XML for `nextprime`, `factor`, `bnfinit`, `ellinit`, `mfinit` and
`lfun` plus a floor on the number of entries, which is what a silently dropped
category would breach.

**The PARI/GP matrix is in CI.** `pari-versions` in `test.yml` runs
`make syntax && make test && make examples` against 2.13.3, 2.15.5 and 2.17.3
from conda-forge — the definition is regenerated from each gp rather than
using the committed copy. conda-forge has **no 2.16**; the full linux-64 list
is 2.9.x, 2.11.x, 2.13.2/3, 2.15.2–5 and 2.17.1–3. All three pass: 2.13.3
yields 1169 functions and 2.15.5 yields 1185, against 1323 for 2.17.3.

This is what establishes the supported floor as **2.13**, not 2.17. The badge,
`Requirements`, the compatibility card and the docs all say so.

### Presentation

**The compatibility card** is at the top of the README: Quarto, PARI/GP,
platforms, install line, licence. The README already led with Install / Use /
Render, and the two-component table — engine and syntax definition, usable
apart — was already the first thing after the tagline.

**The examples are a numbered series.** `examples/01-factorisation` through
`06-plots`, each short and about one thing, with `hello.qmd` in front of them
and the longer `number-theory.qmd` tour behind. Every value in them was
checked against what is known: the twin-prime count below a million, the
largest prime gap, the coefficients of `X_0(11)`, the nine Heegner
discriminants, the first six zeros of zeta.

**One compact options table** opens `docs/options.qmd`: all 21 options with
scope and default, before the detailed sections.

**A logo**, in `assets/`. The full mark in the README and on the docs home
page; a cropped icon in the navbar and as the favicon, because the wordmark
is illegible at 30px. `docs/assets` is a symlink to `../assets`, the same
trick as `docs/_extensions`.

## Left undone

These were considered and not done. They are the open ends, recorded for
whoever picks this up — not a backlog this project intends to work through.

**Better output shaping.** An option for gp's `output` default (prettymatrix
vs raw), and optional LaTeX output via gp's `\x`/TeX mode so results can be
typeset as maths rather than monospace. `prelude` is the workaround today,
and it is a real one: `default(output, 0)` in the front matter already
changes how everything prints.

**A `gp` cell language under other engines.** Quarto allows only one engine
per document, so a document cannot mix `{gp}` and `{python}`. A cell
*language handler* rather than an engine would lift that. This is the single
most useful thing left, and the most work.

**A Jupyter kernel and VS Code integration.** PARI/GP language support is
potentially larger than one Quarto engine:

```text
PARI/GP language support
        ├── Quarto engine          (this repository)
        ├── syntax highlighting    (this repository, reusable on its own)
        ├── Jupyter kernel
        └── VS Code integration
```

Neither of the lower two was started. They are recorded because the
repository is not painted into a corner: the syntax definition is already a
standalone file that any of them can use, and the engine already treats gp as
an external program. A successor can depend on this rather than absorbing it.

**Windows in CI.** The engine implements Windows (`cmd` instead of
`/bin/sh`, and `install.ps1`), but no runner ever exercises it. The
compatibility card says so plainly rather than implying it is tested.

### Decided against

**Renaming `engine: pari-gp` / ` ```{gp} `.** The split is deliberate — the
engine is `pari-gp`, the language is `gp` — and the review agreed.

## Not planned

- Bundling PARI/GP itself. It is a large GPL program with platform-specific
  builds; depending on the system package is correct.
- A `cypari2`/Python bridge. It adds a Python dependency to reach the same
  interpreter this already drives directly.
