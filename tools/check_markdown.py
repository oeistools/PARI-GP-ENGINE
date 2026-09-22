#!/usr/bin/env python3
"""Pre-flight for the mechanical markdownlint rules.

There is no Node in every development environment, so `markdownlint-cli2` can
only run in CI. This catches the whitespace-shaped rules that a scripted edit
is most likely to break, before a push spends a CI run discovering them.

It is NOT a replacement for markdownlint: CI remains the authority. Rules
covered here are MD009, MD012, MD047 and the delimiter half of MD060.

    python3 tools/check_markdown.py [--fix] [files...]
"""

from __future__ import annotations

import re
import sys

FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
DELIM = re.compile(r"^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$")


def outside_fences(lines):
    """Yield (index, line, in_fence) so callers can skip fenced code."""
    fence = None
    for i, line in enumerate(lines):
        m = FENCE.match(line)
        if m:
            marker = m.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            yield i, line, True
            continue
        yield i, line, fence is not None


def check(path, fix=False):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    lines = text.split("\n")
    problems = []
    out = []
    blanks = 0

    for i, line, in_fence in outside_fences(lines):
        if in_fence:
            # A fenced block interrupts any run of blank lines: without this
            # reset, a blank line before a block and one after it count as
            # consecutive and MD012 fires where markdownlint sees nothing.
            blanks = 0
            out.append(line)
            continue

        fixed_line = line
        if fixed_line.rstrip() != fixed_line:
            problems.append((i + 1, "MD009", "trailing whitespace"))
            fixed_line = fixed_line.rstrip()

        if fixed_line.strip() == "":
            blanks += 1
            if blanks > 1:
                problems.append((i + 1, "MD012", "multiple consecutive blank lines"))
                continue
        else:
            blanks = 0
            if fixed_line.lstrip().startswith("|") and DELIM.match(fixed_line):
                cells = [c.strip() for c in fixed_line.strip().strip("|").split("|")]
                compact = "| " + " | ".join(cells) + " |"
                if fixed_line != compact:
                    problems.append(
                        (i + 1, "MD060", "table delimiter row is not compact")
                    )
                    fixed_line = compact
        out.append(fixed_line)

    # MD047 is about the file's ending only, not about anything fixed above.
    if not text.endswith("\n") or text.endswith("\n\n"):
        problems.append((len(lines), "MD047", "file should end with one newline"))

    if fix and problems:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out).rstrip("\n") + "\n")
    return problems


def main():
    args = sys.argv[1:]
    fix = "--fix" in args
    files = [a for a in args if a != "--fix"]
    if not files:
        print("usage: check_markdown.py [--fix] <files...>", file=sys.stderr)
        return 2

    total = 0
    for path in files:
        for line, rule, message in check(path, fix):
            print(f"{path}:{line}: {rule} {message}")
            total += 1
    if total and not fix:
        print(f"\n{total} problem(s). Run with --fix, or let CI report them.")
        return 1
    if total:
        print(f"fixed {total} problem(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
