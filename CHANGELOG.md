# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

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

- A KDE/Skylighting syntax definition covering the 1200 functions of PARI/GP
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

[Unreleased]: https://github.com/oeistools/PARI-GP-ENGINE/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/oeistools/PARI-GP-ENGINE/releases/tag/v0.1.0
