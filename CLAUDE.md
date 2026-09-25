# CLAUDE.md

Working notes for Claude Code (and anyone else) in this repository.

## What this is

A Quarto **engine extension** that runs PARI/GP code cells, plus a
**Skylighting syntax definition** for PARI/GP. The project is finished; see
`PLAN.md` for what it does, the decisions that are settled, and what was
deliberately left undone — read it before proposing a different architecture
or reviving something listed there.

## Layout

```text
_extensions/pari-gp/
  _extension.yml    extension manifest (contributes.engines)
  pari-gp.js        COMPILED engine — committed, but never edit by hand
  pari-gp.xml       GENERATED syntax definition — never edit by hand
src/pari-gp.ts      the engine source; edit this
tools/gen_xml.py    generates pari-gp.xml from the installed gp
tests/              run-tests.sh, clean-install.sh, cases/*.qmd, expect-fail/*.qmd
examples/           hello.qmd, the numbered series 01..06, number-theory.qmd
assets/             logo.png (README, docs home) and logo-mark.png (navbar,
                    favicon); docs/assets is a symlink to it
_quarto.yml         makes the repo a Quarto project so examples/ and tests/
                    find _extensions without installing the extension
```

Two files are build products and must not be hand-edited:

- `_extensions/pari-gp/pari-gp.js` ← `make build` from `src/pari-gp.ts`
- `_extensions/pari-gp/pari-gp.xml` ← `make syntax` from the installed `gp`

Both are committed anyway: `pari-gp.js` is what Quarto loads on
`quarto add`, and users must not need Deno or a PARI installation to build it.

## After changing the engine

```bash
make build && make test
```

`make build` type-checks against Quarto's own types, so it catches API
mistakes. `make test` renders the documents in `tests/` and greps the HTML.
Both must pass before a change is finished. Add a case in `tests/cases/` for
any behaviour worth keeping.

`make clean-install` is the separate one: it runs `quarto add` in an empty
directory **outside** the repository, so nothing in the working tree can make
a broken release look installable. `REF=--local` installs the working tree,
`REF=v0.2.1` a published release, and the default is whatever `VERSION` says.
Run it when anything about packaging changes — the extension directory,
`_extension.yml`, `package`, or the release workflow.

## The documentation site

`docs/` is a separate Quarto project (it has its own `_quarto.yml`), and a
nested project does **not** find the parent's `_extensions` — hence the
`docs/_extensions` symlink. Removing it makes every docs page fall back to
jupyter and fail. `docs/assets` is the same trick for the logo: one copy in
`assets/`, reachable from both the README and the site. `make docs` renders
the site; `pages.yml` deploys it.

## Releasing

`make bump-version V=x.y.z` updates `VERSION`, `_extension.yml` and
`CITATION.cff` (version *and* `date-released`); write the `CHANGELOG.md`
section by hand; `make release-check` verifies all four agree, including that
the citation date matches the date on the changelog heading; `make tag` pushes
the tag, and `.github/workflows/release.yml` publishes the release.

Release notes are written to a **file** and passed with `gh release create
--notes-file`, never interpolated into the command line: the changelog contains
backticks, which a shell would run as command substitution.

## Where things stand

**The project is finished.** v0.2.2 (2026-09-25) is the last release: it
fixes inline code taking a code span that shows a fence for an expression,
and makes the freeze test able to fail. Before it came v0.2.1 (2026-09-23), a
CI-only follow-up to v0.2.0 the same day, which was itself the day after
v0.1.0. Each was verified end to end rather than by a
green workflow alone — the released extension is installed with `quarto add`
into an empty directory and used to render a document with execution, inline
code, highlighting and a figure, on Linux and macOS, by
`.github/workflows/clean-install.yml`.

The docs site is live at <https://oeistools.github.io/PARI-GP-ENGINE/>.

`PLAN.md` is now a record, not a backlog: what the project did, the decisions
behind it, and — under *Left undone* — the open ends a successor would pick
up. Read it before proposing work here, because "not done" mostly means
"deliberately not done".

Maintenance that still happens by itself: the weekly `clean-install` job,
which is what would catch a newer Quarto or PARI/GP breaking the published
release. GitHub disables scheduled workflows after 60 days without repository
activity, so on a finished project that eventually stops — re-enable it from
the Actions tab, or push something.

**An `on: release` trigger does not fire for our own releases.** `release.yml`
publishes with `GITHUB_TOKEN`, and GitHub does not start workflow runs from
`GITHUB_TOKEN` events. That is why the post-release install check is the
`verify-install` job inside `release.yml` rather than a trigger in
`clean-install.yml`. It cost a v0.2.0 that went out unverified by CI (it was
verified by hand instead) before anyone noticed.

## The draft/ folder

`draft/` is gitignored local material, now all Markdown (the HTML originals
were converted and deleted on 2026-09-22):

- `Create PARI GP Highlight.md` — the conversation this project grew out of.
- `Mejoras del repositorio.md` — a review of the repository. Useful, but it
  predates the v0.1.0 release, so its two red-priority items (publish a
  release; check `quarto add` against it) are already done. Its triaged
  contents live in `PLAN.md` under "What 0.2.0 added" and "Left undone".
- `pari-gp-functions/` — 86 pages of the PARI/GP user manual as Markdown.
  Handy for looking up what a function does without leaving the repo.

## Requirements in this environment

`quarto` (>= 1.9) and `gp` are both installed here, so changes can and should
be verified by actually rendering, not by reasoning about it. `make doctor`
reports their status.

## Things that will bite you

**Quarto's engine API is not documented.** The types are the reference:
`/opt/quarto/share/extension-build/quarto-types.d.ts` (or wherever Quarto is
installed). The docs page at <https://quarto.org/docs/extensions/engine.html>
covers little more than the manifest.

**`quarto call build-ts-extension`, not `quarto dev-call ...`.** The scaffold
generated by `quarto create extension engine` documents a `dev-call` form and a
`--init-config` flag; neither exists in 1.9.38.

**Piping several `?n` help queries into one gp session silently drops
categories.** `tools/gen_xml.py` therefore runs one gp per category. If the
function count drops well below ~1200, this is why — and the `syntax` section
of `make test` fails below 1000 entries so it cannot pass unnoticed.

**gp prefixes warnings and errors alike with `***`.** Only `*** Warning:` is a
warning. Treating every `***` line as an error made documents fail to render
because the stack grew — see `isGpError` in `src/pari-gp.ts`.

**A gp string prints with quotes around it.** `plothexport(...)` at top level
arrives as `"<svg ...>"`, not `<svg ...>`; `unquoteGpString` handles both that
and the `print()`ed form. This is why figure detection missed everything the
first time.

**`options.cwd` is the document's directory; `options.target.input` is not
reliable.** In a project render `input` is absolute; in a standalone render it
is relative, and `projectDir` becomes the document's own directory. Anything
path-related must be computed from `options.cwd`.

**Sentinels.** Cell output is separated by `print("<<<quarto-pari-gp:...>>>")`
lines with a per-run nonce. A missing sentinel means gp died early or a cell
left a brace, bracket or string open; the engine reports that rather than
producing silently wrong output.

**`freeze` applies only to a render of a whole project.** `quarto render
doc.qmd` always executes, whatever `freeze` says. And gp starts every session
from the same random seed, so a re-execution prints the same `random()` as
the first run. Together they let the original freeze test pass without
testing anything; that is why `tests/freeze/` is its own project, rendered
whole, and why its document seeds from `getwalltime()`.

**An inline expression needs whitespace after `{gp}`.** Without the
lookarounds and `\s+` in `kInlineGp`, prose that shows a fence as
`` ` ```{gp} ` `` matched as an inline expression and its text vanished from
the page.

**conda-forge has no PARI/GP 2.16.** The linux-64 versions are 2.9.x,
2.11.x, 2.13.2/3, 2.15.2–5 and 2.17.1–3, which is why the CI matrix is
2.13.3 / 2.15.5 / 2.17.3. The matrix regenerates `pari-gp.xml` from each gp
rather than using the committed copy: the committed one comes from 2.17.

**Test documents live under a Quarto project.** Rendering a `.qmd` from a
directory that is not inside the project root makes Quarto fall back to
jupyter and fail with a confusing "Jupyter is not available" message. That is a
path problem, not an engine problem.

## Markdown

CI runs `markdownlint-cli2`, which is the authority. There is no Node here, so
it cannot be run locally — which is exactly how a stray double blank line in
`PLAN.md` once reached CI. `make lint` therefore also runs
`tools/check_markdown.py`, a pre-flight for the mechanical rules a scripted
edit is most likely to break: MD009, MD012, MD047 and the delimiter half of
MD060. `make fmt` fixes them.

It is deliberately narrow and is **not** a substitute for markdownlint. If it
reports something markdownlint does not, the pre-flight is wrong — it has had
false positives before, from not resetting the blank-line counter across
fenced blocks.

## Python tooling

`tools/gen_xml.py` is the only Python here. `make lint` runs ruff's linter and
format check; `make fmt` fixes what it can. `SIM905` is switched off globally
and `E501` for that one file — both with the reason written in
`pyproject.toml`, because the keyword lists are prose blocks and the XML
template lines cannot be wrapped. After touching the generator, run `make
syntax` and confirm the XML is unchanged.

## Style

Match the existing code: comments explain *why* a thing is done the way it is,
particularly where the reason is a gp or Quarto quirk, and not what the line
does. Error messages tell the reader what to change and where.
