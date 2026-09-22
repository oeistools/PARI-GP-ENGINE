# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- Status badges in the README (CI, release, latest version, Quarto and PARI/GP
  versions, licence).
- `release.yml` workflow: pushing a `v*` tag re-runs the whole test suite,
  checks the tag against `VERSION`, `_extension.yml` and `CITATION.cff`, builds
  `.tar.gz` and `.zip` archives of the extension and publishes a GitHub release
  with that version's changelog section.
- `make package`, `make release-check` and `make tag` targets.

### Fixed

- Removed a duplicated `# PARI-GP-ENGINE` heading at the end of the README.

## [0.1.0] — 2026-09-22

First release.

### Added

- **Engine**: a Quarto engine extension (`engine: pari-gp`) that executes
  ` ```{gp} ` cells with the `gp` interpreter. All cells of a document share
  one gp session, so state carries across cells.
- **Cell options**: `eval`, `echo`, `output` (including `output: asis`),
  `error`, `include`, `classes`, `filename`.
- **Document options** under `pari-gp:`: `path`, `args`, `stacksize`,
  `primelimit`, `precision`, `bitprecision`, `seriesprecision`, `timeout`,
  `prelude`, `highlight`, and document-wide defaults for the cell options.
- **Highlighting**: a KDE/Skylighting syntax definition covering the 1200
  functions of PARI/GP 2.17, plus comments, strings, numbers, metacommands,
  member access and `default()` names. The engine passes it to Pandoc itself,
  so no `syntax-definitions:` entry is needed.
- **`tools/gen_xml.py`**: regenerates the syntax definition by asking the
  installed `gp` for its own function list (`make syntax`).
- **Errors**: gp errors stop the render by default with a message naming the
  cell, or are rendered into the document with `#| error: true`. gp
  `*** Warning:` lines are never treated as errors.
- **Installers**: `install.sh` and `install.ps1`, which check Quarto (>= 1.9)
  and PARI/GP before installing and report precisely what is missing.
- **Makefile** with `build`, `syntax`, `test`, `examples`, `check`, `doctor`,
  `clean` and `bump-version` targets.
- **Tests**: `tests/run-tests.sh` renders test documents and checks the output,
  including that an unhandled gp error makes the render fail.

[Unreleased]: https://github.com/oeistools/PARI-GP-ENGINE/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/oeistools/PARI-GP-ENGINE/releases/tag/v0.1.0
