# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The freeze test could not fail. It rendered a single file, which Quarto
  always executes whatever `freeze` says, and the value it compared came from
  gp's `random()`, which starts from the same seed every session, so the
  re-execution printed the same number. `tests/freeze/` is now a project of
  its own, rendered whole, and seeds from the clock. The check that the
  cached syntax-definition path is not absolute was vacuous too: it grepped
  for a pattern that the pretty-printed JSON splits across lines.
- A code span that shows a fence in prose, such as `` ` ```{gp} ` ``, was taken
  for an inline expression and replaced by nothing. An inline expression now
  needs a lone opening backtick and whitespace after `{gp}`, as in Quarto.
- The README and the options page now say that `freeze` applies only when
  the whole project is rendered.

## [0.2.1] — 2026-09-23

A CI-only release. Nothing that `quarto add` installs has changed since
0.2.0: the engine, the syntax definition and the manifest are byte for byte
the same apart from the version number.

### Fixed

- The clean-install check now really does run against every release. Its
  `on: release` trigger could never fire, because `release.yml` creates the
  release with `GITHUB_TOKEN` and GitHub does not start workflow runs from
  `GITHUB_TOKEN` events; the check is now a `verify-install` job inside
  `release.yml`, where it runs on the tag just published. The weekly run,
  which is the one that catches a release going stale, was never affected.

## [0.2.0] — 2026-09-23

The last release: see `PLAN.md` for what was finished and what was left.

### Added

- **A clean-install test.** `tests/clean-install.sh` runs `quarto add` in an
  empty directory outside the repository and renders a document that uses
  execution, inline code, highlighting and a figure — the check that was done
  by hand for 0.1.0. `make clean-install` runs it against the release named in
  `VERSION`, `REF=--local` against the working tree. CI runs the local form on
  every push, and the published form on every release and once a week.
- **Assertions on the syntax definition.** The suite now checks that the
  generated `pari-gp.xml` still contains `nextprime`, `factor`, `bnfinit`,
  `ellinit`, `mfinit` and `lfun` and has not shrunk, and a new
  `tests/cases/highlight.qmd` checks that `\p`, `?factor`, `E.disc`, `0xFF`,
  `1.23e-10`, `\\` comments, `/* */` comments and string escapes all still
  highlight.
- **A PARI/GP version matrix in CI.** The suite also runs against PARI/GP
  2.13.3, 2.15.5 and 2.17.3 from conda-forge, regenerating the syntax
  definition from each. (conda-forge has no 2.16.) This establishes 2.13 as
  the supported floor, where the README previously implied 2.17.
- **A numbered series of examples.** `examples/01-factorisation` through
  `06-plots`: factorisation over four different rings, primes, `X_0(11)`,
  class groups and prime splitting, zeta and `lfun`, and every kind of figure
  the engine captures. `hello.qmd` and the longer `number-theory.qmd` tour
  stay where they were.
- **A compatibility card** at the top of the README — Quarto, PARI/GP,
  platforms, install line, licence — and a single compact options table
  (option, scope, default) opening `docs/options.qmd`.
- **A logo**, in `assets/`: the full mark in the README and on the docs home
  page, a cropped icon in the navbar and as the favicon. `docs/assets` is a
  symlink to `../assets`, as `docs/_extensions` already was.
- `make bump-version` now sets `date-released` in `CITATION.cff`, and
  `make release-check` fails when it disagrees with the date on the
  changelog section — it was previously neither written nor checked.

### Fixed

- The PARI/GP version badge, `Requirements`, `docs/index.qmd` and
  `docs/highlighting.qmd` said 2.17 where the engine in fact works from 2.13.
  The 2.17 that remains is the function set the shipped `pari-gp.xml` lists,
  which is a different claim and is now stated as one.
- `mamba-org/setup-micromamba` moved to v3, clearing the last Node 20
  deprecation warning in CI.
- `tests/cases/*.md`, the gfm output of the figure test, is no longer reported
  as an untracked file, and `/_freeze/` is listed once in `.gitignore` rather
  than twice.

## [0.1.0] — 2026-09-22

First release.

### Added

#### Executing PARI/GP

- A Quarto engine extension (`engine: pari-gp`) that executes ` ```{gp} `
  cells with the `gp` interpreter. All cells of a document share one gp
  session, so state carries from one cell to the next.
- **Cell options**: `eval`, `echo`, `output` (including `output: asis`),
  `error`, `include`, `classes`, `filename`, `label`, `fig-cap`, `fig-alt`
  and `fig-width`.
- **Document options** under `pari-gp:`: `path`, `args`, `stacksize`,
  `primelimit`, `precision`, `bitprecision`, `seriesprecision`, `timeout`,
  `prelude`, `highlight`, and document-wide defaults for the cell options.
- **Inline code**: `` `{gp} expr` `` in prose is evaluated in document order
  and replaced by its value. Occurrences inside fenced blocks are left alone.
- **Errors**: a gp error stops the render by default with a message naming the
  cell, or is rendered into the document with `#| error: true`. gp
  `*** Warning:` lines are never treated as errors.
- **Caching**: `freeze: auto` and `freeze: true` work — a frozen document is
  not re-executed. What the engine stores in `_freeze/` is relative to the
  document, so the cache replays on another machine and in CI.

#### Figures

- A cell whose output is an SVG document becomes a figure, which covers every
  gp function that returns SVG: `plothexport`, `plothrawexport` and
  `plotexport`. Captions, alt text, width and `fig-` labels for
  cross-references are honoured.
- HTML formats get the SVG inline; every other format gets a file in the
  document's `_files` directory, referenced as an image.

#### Highlighting

- A KDE/Skylighting syntax definition covering the function set of PARI/GP
  2.17, plus comments, strings, numbers, metacommands, member access and
  `default()` names. The engine passes it to Pandoc itself, so a document
  needs no `syntax-definitions:` entry.
- `tools/gen_xml.py` regenerates it by asking the installed `gp` for its own
  function list (`make syntax`).

#### Getting it and working on it

- **Installers**: `install.sh` and `install.ps1`, which check Quarto (>= 1.9)
  and PARI/GP before installing and report precisely what is missing.
- **Makefile**: `build`, `syntax`, `test`, `examples`, `docs`, `check`,
  `doctor`, `lint`, `fmt`, `package`, `release-check`, `tag`, `clean` and
  `bump-version`.
- **Documentation site** under `docs/`, a Quarto website that uses the engine
  on every page, published to GitHub Pages.
- **Tests**: `tests/run-tests.sh` renders test documents and checks the
  output — 32 checks, including that an unhandled gp error makes the render
  fail and that a frozen document is not re-executed.
- **CI**: tests on Linux and macOS, markdownlint, ruff, and a check that the
  committed `pari-gp.js` matches its TypeScript source. A `v*` tag builds the
  release archives and publishes the release.

[Unreleased]: https://github.com/oeistools/PARI-GP-ENGINE/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/oeistools/PARI-GP-ENGINE/releases/tag/v0.2.1
[0.2.0]: https://github.com/oeistools/PARI-GP-ENGINE/releases/tag/v0.2.0
[0.1.0]: https://github.com/oeistools/PARI-GP-ENGINE/releases/tag/v0.1.0
