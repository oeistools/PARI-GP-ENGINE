/*
 * pari-gp.ts — a Quarto execution engine for PARI/GP.
 *
 * Executes ```{gp} cells by piping them through a single `gp` session, so
 * variables and defaults set in one cell are visible in the next.
 *
 * Execution model
 * ---------------
 * Every cell of the document is concatenated into one gp script, with a
 * sentinel `print()` after each cell. The whole script is fed to one gp
 * process whose stderr is merged into stdout by the shell, and the combined
 * output is split back apart on the sentinels. Merging the streams in the
 * shell (rather than reading two pipes) is what keeps error text in the exact
 * position gp emitted it, which matters because a gp error is reported
 * *between* two results of the same cell.
 */

import type {
  DependenciesOptions,
  EngineProjectContext,
  ExecuteOptions,
  ExecuteResult,
  ExecutionEngineDiscovery,
  ExecutionEngineInstance,
  ExecutionTarget,
  MappedString,
  Metadata,
  PostProcessOptions,
  QuartoAPI,
} from "@quarto/types";

let quarto: QuartoAPI;

const kEngineName = "pari-gp";
const kCellLanguage = "gp";
/** Class put on emitted code blocks; matches <language name=...> in pari-gp.xml. */
const kHighlightLanguage = "pari-gp";
const kSyntaxDefinition = "pari-gp.xml";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface GpConfig {
  path: string;
  args: string[];
  stacksize?: string;
  precision?: number;
  bitprecision?: number;
  seriesprecision?: number;
  primelimit?: string;
  timeout: number;
  prelude?: string;
  highlight: boolean;
  // cell-option defaults
  echo: boolean;
  output: boolean;
  error: boolean;
  eval: boolean;
  include: boolean;
}

const kDefaultConfig: GpConfig = {
  path: "gp",
  args: [],
  timeout: 300,
  highlight: true,
  echo: true,
  output: true,
  error: false,
  eval: true,
  include: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (/^(true|yes|on)$/i.test(v)) return true;
    if (/^(false|no|off)$/i.test(v)) return false;
  }
  return fallback;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") return v.split(/\s+/).filter((s) => s.length > 0);
  return undefined;
}

function readConfig(metadata: Metadata | undefined): GpConfig {
  const cfg: GpConfig = { ...kDefaultConfig };
  const raw = metadata?.[kEngineName] ?? metadata?.["pari_gp"] ?? metadata?.["gp"];
  if (!raw || typeof raw !== "object") return cfg;
  const m = raw as Record<string, unknown>;

  if (typeof m.path === "string") cfg.path = m.path;
  const args = asStringArray(m.args);
  if (args) cfg.args = args;
  if (typeof m.stacksize === "string") cfg.stacksize = m.stacksize;
  else if (typeof m.stacksize === "number") cfg.stacksize = String(m.stacksize);
  if (typeof m.primelimit === "string") cfg.primelimit = m.primelimit;
  else if (typeof m.primelimit === "number") cfg.primelimit = String(m.primelimit);
  cfg.precision = asNumber(m.precision) ?? cfg.precision;
  cfg.bitprecision = asNumber(m.bitprecision) ?? cfg.bitprecision;
  cfg.seriesprecision = asNumber(m.seriesprecision) ?? cfg.seriesprecision;
  cfg.timeout = asNumber(m.timeout) ?? cfg.timeout;
  if (typeof m.prelude === "string") cfg.prelude = m.prelude;
  cfg.highlight = asBool(m.highlight, cfg.highlight);
  cfg.echo = asBool(m.echo, cfg.echo);
  cfg.output = asBool(m.output, cfg.output);
  cfg.error = asBool(m.error, cfg.error);
  cfg.eval = asBool(m.eval, cfg.eval);
  cfg.include = asBool(m.include, cfg.include);
  return cfg;
}

/** Per-cell options, resolved against the document-level defaults. */
interface CellOptions {
  eval: boolean;
  echo: boolean;
  output: boolean | "asis";
  error: boolean;
  include: boolean;
  classes: string[];
  filename?: string;
  label?: string;
  figCap?: string;
  figAlt?: string;
  figWidth?: string;
}

function readCellOptions(
  raw: Record<string, unknown> | undefined,
  cfg: GpConfig,
): CellOptions {
  const o = raw ?? {};
  let output: boolean | "asis" = cfg.output;
  if (o.output === "asis" || o.results === "asis") output = "asis";
  else if (o.output !== undefined) output = asBool(o.output, cfg.output);

  return {
    eval: asBool(o.eval, cfg.eval),
    echo: asBool(o.echo, cfg.echo),
    output,
    error: asBool(o.error, cfg.error),
    include: asBool(o.include, cfg.include),
    classes: asStringArray(o.classes)?.map((c) => c.replace(/^\./, "")) ?? [],
    filename: typeof o.filename === "string" ? o.filename : undefined,
    label: typeof o.label === "string" ? o.label : undefined,
    figCap: typeof o["fig-cap"] === "string" ? o["fig-cap"] : undefined,
    figAlt: typeof o["fig-alt"] === "string" ? o["fig-alt"] : undefined,
    figWidth: o["fig-width"] !== undefined ? String(o["fig-width"]) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Running gp
// ---------------------------------------------------------------------------

const kMissingGp = (path: string) =>
  `PARI/GP executable "${path}" was not found.\n\n` +
  `Install PARI/GP (https://pari.math.u-bordeaux.fr/download.html), or point ` +
  `the engine at it explicitly:\n\n` +
  `    ---\n    engine: pari-gp\n    pari-gp:\n      path: /path/to/gp\n    ---\n`;

function shellQuote(s: string): string {
  if (Deno.build.os === "windows") return `"${s}"`;
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/** Build the gp script: prelude, then each cell followed by its sentinel. */
function buildScript(codes: string[], nonce: string, cfg: GpConfig): string {
  const lines: string[] = [];
  // Keep gp's output plain and predictable, whatever the user's gprc says.
  lines.push(`default(colors, "no");`);
  lines.push(`default(timer, 0);`);
  lines.push(`default(breakloop, 0);`);
  lines.push(`default(readline, 0);`);
  lines.push(`default(echo, 0);`);
  lines.push(`default(linewrap, 0);`);
  if (cfg.stacksize) lines.push(`default(parisize, "${cfg.stacksize}");`);
  if (cfg.primelimit) lines.push(`default(primelimit, "${cfg.primelimit}");`);
  if (cfg.precision !== undefined) {
    lines.push(`default(realprecision, ${cfg.precision});`);
  }
  if (cfg.bitprecision !== undefined) {
    lines.push(`default(realbitprecision, ${cfg.bitprecision});`);
  }
  if (cfg.seriesprecision !== undefined) {
    lines.push(`default(seriesprecision, ${cfg.seriesprecision});`);
  }
  if (cfg.prelude) lines.push(cfg.prelude);
  // Everything gp says while setting up (notably the "new stack size"
  // warning) belongs to no cell; this sentinel lets us drop it.
  lines.push(`print("${sentinel(nonce, -1)}")`);

  codes.forEach((code, i) => {
    lines.push(code.endsWith("\n") ? code.slice(0, -1) : code);
    // The sentinel must start on a fresh line: a cell ending in a comment or
    // an unclosed construct would otherwise swallow it.
    lines.push(`print("${sentinel(nonce, i)}")`);
  });
  lines.push("quit");
  return lines.join("\n") + "\n";
}

function sentinel(nonce: string, i: number): string {
  return `<<<quarto-pari-gp:${nonce}:${i}>>>`;
}

interface GpRun {
  /** Output of each executed cell, in order. */
  outputs: string[];
  /** True when gp stopped before reaching the end of the script. */
  truncated: boolean;
}

async function runGp(
  codes: string[],
  cfg: GpConfig,
  cwd: string,
): Promise<GpRun> {
  if (codes.length === 0) return { outputs: [], truncated: false };

  const nonce = Math.random().toString(36).slice(2, 10);
  const script = buildScript(codes, nonce, cfg);

  // `-q` quiet (no banner/prompt), `-f` skip the user's gprc so a document
  // renders the same on every machine. Both go first so document-supplied
  // args can still override them.
  const gpArgs = ["-q", "-f", ...cfg.args].map(shellQuote).join(" ");
  const cmdline = `${shellQuote(cfg.path)} ${gpArgs} 2>&1`;
  const [exe, args] = Deno.build.os === "windows"
    ? ["cmd", ["/d", "/s", "/c", cmdline]]
    : ["/bin/sh", ["-c", `exec ${cmdline}`]];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout * 1000);

  let stdout: string;
  try {
    const child = new Deno.Command(exe as string, {
      args: args as string[],
      cwd,
      stdin: "piped",
      stdout: "piped",
      stderr: "null",
      signal: controller.signal,
    }).spawn();

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(script));
    await writer.close().catch(() => {/* gp may have quit already */});

    const result = await child.output();
    stdout = new TextDecoder().decode(result.stdout);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) throw new Error(kMissingGp(cfg.path));
    if (controller.signal.aborted) {
      throw new Error(
        `PARI/GP did not finish within ${cfg.timeout}s. Raise the limit with ` +
          `"pari-gp: { timeout: <seconds> }" in the document front matter.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // A shell reports a missing executable on stdout once we merge the streams.
  if (/(command not found|not recognized as an internal)/i.test(stdout) &&
      !stdout.includes(sentinel(nonce, 0))) {
    throw new Error(kMissingGp(cfg.path));
  }

  const outputs: string[] = [];
  let rest = stdout;
  let truncated = false;
  const preludeMark = sentinel(nonce, -1);
  const preludeAt = rest.indexOf(preludeMark);
  if (preludeAt !== -1) {
    rest = rest.slice(preludeAt + preludeMark.length).replace(/^\r?\n/, "");
  }
  for (let i = 0; i < codes.length; i++) {
    const mark = sentinel(nonce, i);
    const at = rest.indexOf(mark);
    if (at === -1) {
      outputs.push(rest);
      for (let j = i + 1; j < codes.length; j++) outputs.push("");
      truncated = true;
      break;
    }
    outputs.push(rest.slice(0, at));
    rest = rest.slice(at + mark.length).replace(/^\r?\n/, "");
  }
  return { outputs, truncated };
}

// ---------------------------------------------------------------------------
// Markdown emission
// ---------------------------------------------------------------------------

/**
 * gp prefixes both errors and warnings with "***", so the two have to be told
 * apart by what follows: only "*** Warning: ..." is a warning, and a document
 * should not fail to render because the stack had to grow.
 */
const kDiagnosticLine = /^\s*\*\*\*/;

function isGpError(text: string): boolean {
  return text.split(/\r?\n/).some((line) =>
    kDiagnosticLine.test(line) && !/\*\*\*\s+Warning:/.test(line)
  );
}

function trimOutput(s: string): string {
  return s.replace(/^\s*\n/, "").replace(/\s+$/, "");
}

/** Fence long enough not to be closed by backticks inside the content. */
function fence(content: string): string {
  let longest = 0;
  for (const m of content.matchAll(/^`{3,}/gm)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

function codeBlock(content: string, attrs: string): string {
  const f = fence(content);
  return `${f}${attrs}\n${content}\n${f}\n`;
}

/**
 * gp has no notion of a "current figure": a plot reaches us because the author
 * called plothexport("svg", ...) or plotexport("svg", ...), whose value is the
 * SVG document itself. So a cell produced a figure exactly when its output is
 * an SVG document.
 */
const kSvgStart = /^\s*(<\?xml[^>]*\?>\s*)?(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i;

function isSvg(text: string): boolean {
  return kSvgStart.test(text);
}

/**
 * gp prints the value of a t_STR wrapped in double quotes, so
 * `plothexport("svg", ...)` arrives as `"<svg ...>"` while
 * `print(plothexport(...))` arrives raw. Accept both.
 */
function unquoteGpString(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return t;
}

/** Strip the XML prolog: an inline <svg> in an HTML page must not carry one. */
function svgForInlineUse(svg: string, opts: CellOptions): string {
  let out = svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, "")
    .replace(/^\s*<!DOCTYPE[^>]*>\s*/i, "")
    .trim();
  if (opts.figAlt) {
    out = out.replace(/<svg\b/i, `<svg role="img" aria-label="${attrEscape(opts.figAlt)}"`);
  } else {
    out = out.replace(/<svg\b/i, '<svg role="img"');
  }
  if (opts.figWidth) {
    out = out.replace(/<svg\b/i, `<svg style="width:${attrEscape(opts.figWidth)};height:auto"`);
  }
  return out;
}

function attrEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Inline code: `` `{gp} expr` `` in prose. Quarto's own inline syntax, matched
 * only outside fenced blocks so that a documentation page may show the syntax
 * without it being evaluated.
 */
const kInlineGp = /`\{gp\}([^`]+)`/g;

/** Split markdown into fenced-code and prose runs; only prose is scanned. */
function proseRuns(md: string): { text: string; code: boolean }[] {
  const runs: { text: string; code: boolean }[] = [];
  const fence = /^(\s*)(`{3,}|~{3,}).*$/gm;
  let at = 0;
  let open: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(md)) !== null) {
    const marker = m[2];
    if (open === null) {
      runs.push({ text: md.slice(at, m.index), code: false });
      at = m.index;
      open = marker[0].repeat(marker.length);
    } else if (marker[0] === open[0] && marker.length >= open.length) {
      const end = m.index + m[0].length;
      runs.push({ text: md.slice(at, end), code: true });
      at = end;
      open = null;
    }
  }
  runs.push({ text: md.slice(at), code: open !== null });
  return runs;
}

function findInlineExpressions(md: string): string[] {
  const found: string[] = [];
  for (const run of proseRuns(md)) {
    if (run.code) continue;
    for (const m of run.text.matchAll(kInlineGp)) found.push(m[1].trim());
  }
  return found;
}

function substituteInline(md: string, values: string[]): string {
  let i = 0;
  return proseRuns(md).map((run) => {
    if (run.code) return run.text;
    return run.text.replace(kInlineGp, () => values[i++] ?? "");
  }).join("");
}

/**
 * A figure for an HTML-ish format: the SVG goes straight into the page, so
 * nothing has to be written to disk and the plot stays sharp at any zoom.
 *
 * With a label the figure is emitted as a Quarto figure div so that
 * cross-references (@fig-...) work; without one it is plain cell output.
 */
function emitHtmlFigure(svg: string, opts: CellOptions): string {
  const raw = "```{=html}\n" + svgForInlineUse(svg, opts) + "\n```\n";
  if (opts.label) {
    return `\n::: {#${opts.label}}\n${raw}\n${opts.figCap ?? ""}\n:::\n`;
  }
  const caption = opts.figCap
    ? `\n\n<p class="figure-caption">${attrEscape(opts.figCap)}</p>\n`
    : "";
  return `\n::: {.cell-output .cell-output-display}\n${raw}${caption}:::\n`;
}

/**
 * A figure for every other format: the SVG is written next to the document, in
 * the same _files directory Quarto already cleans up, and referenced as an
 * image.
 */
function emitFileFigure(path: string, opts: CellOptions): string {
  const attrs: string[] = [];
  if (opts.label) attrs.push(`#${opts.label}`);
  if (opts.figWidth) attrs.push(`width=${opts.figWidth}`);
  const attr = attrs.length ? `{${attrs.join(" ")}}` : "";
  const cap = opts.figCap ?? "";
  const alt = opts.figAlt ?? cap;
  return `\n::: {.cell-output .cell-output-display}\n![${cap || alt}](${path})${attr}\n:::\n`;
}

function emitCell(
  code: string,
  output: string | undefined,
  opts: CellOptions,
  emitFigure?: (svg: string, opts: CellOptions) => string,
): string {
  if (!opts.include) return "";

  const parts: string[] = [];
  if (opts.echo) {
    const classes = [kHighlightLanguage, "cell-code", ...opts.classes]
      .map((c) => `.${c}`).join(" ");
    const attr = opts.filename ? `${classes} filename="${opts.filename}"` : classes;
    parts.push(codeBlock(code.replace(/\s+$/, ""), ` {${attr}}`));
  }

  const text = output === undefined ? "" : trimOutput(output);
  if (text.length > 0 && opts.output !== false) {
    const unquoted = unquoteGpString(text);
    if (emitFigure && isSvg(unquoted)) {
      parts.push(emitFigure(unquoted, opts));
    } else if (opts.output === "asis") {
      parts.push("\n" + text + "\n");
    } else {
      const kind = isGpError(text) ? "cell-output-error" : "cell-output-stdout";
      parts.push(`\n::: {.cell-output .${kind}}\n`);
      parts.push(codeBlock(text, ""));
      parts.push(":::\n");
    }
  }

  if (parts.length === 0) return "";
  return `\n::: {.cell}\n${parts.join("")}:::\n\n`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Where figures for `input` are written: the `<stem>_files` directory Quarto
 * already knows how to copy next to the output and clean up afterwards.
 */
function figureDir(input: string): {
  absolute: string;
  relative: string;
  supporting: string;
} {
  const sep = input.includes("\\") && !input.includes("/") ? "\\" : "/";
  const at = input.lastIndexOf(sep);
  const dir = at === -1 ? "." : input.slice(0, at);
  const base = (at === -1 ? input : input.slice(at + 1)).replace(/\.[^.]+$/, "");
  const supporting = `${dir}${sep}${base}_files`;
  return {
    absolute: `${supporting}${sep}figure-gp`,
    relative: `${base}_files/figure-gp`,
    supporting,
  };
}

/** Directory holding this engine's files, so we can find pari-gp.xml. */
function extensionDir(): string {
  const url = new URL(".", import.meta.url);
  return decodeURIComponent(url.pathname);
}

/**
 * The path to hand pandoc for the syntax definition, relative to the document.
 *
 * It has to be relative because a frozen execution result is stored in
 * `_freeze/`, which is committed and replayed on other machines and in CI. An
 * absolute path baked in there would not exist on the next machine, and the
 * document would lose its highlighting or fail to render.
 *
 * The base is `options.cwd`, which is the document's own directory — and is
 * also what pandoc runs in. `options.target.input` is *not* usable here: it is
 * absolute when the file is part of a project render but relative when it is
 * rendered on its own.
 */
function syntaxDefinitionPath(documentDir: string): string {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const target = norm(extensionDir() + kSyntaxDefinition).split("/");
  const from = norm(documentDir).split("/");

  if (from[0] !== target[0]) return target.join("/"); // different roots
  let i = 0;
  while (i < from.length && i < target.length && from[i] === target[i]) i += 1;
  const rel = [...new Array(from.length - i).fill(".."), ...target.slice(i)];
  return rel.length > 0 ? rel.join("/") : target.join("/");
}

const pariGpEngine: ExecutionEngineDiscovery = {
  init: (quartoAPI: QuartoAPI) => {
    quarto = quartoAPI;
  },

  name: kEngineName,
  defaultExt: ".qmd",
  defaultYaml: () => ["engine: pari-gp"],
  defaultContent: () => [
    "```{gp}",
    "p = nextprime(10^30)",
    "factor(p - 1)",
    "```",
  ],
  validExtensions: () => [],

  claimsFile: (_file: string, _ext: string) => false,

  claimsLanguage: (language: string, _firstClass?: string): boolean | number =>
    language.toLowerCase() === kCellLanguage,

  canFreeze: true,
  generatesFigures: true,

  launch: (_context: EngineProjectContext): ExecutionEngineInstance => {
    return {
      name: kEngineName,
      canFreeze: true,

      markdownForFile: (file: string): Promise<MappedString> =>
        Promise.resolve(quarto.mappedString.fromFile(file)),

      target: (file: string, _quiet?: boolean, markdown?: MappedString) => {
        const md = markdown ?? quarto.mappedString.fromFile(file);
        const target: ExecutionTarget = {
          source: file,
          input: file,
          markdown: md,
          metadata: quarto.markdownRegex.extractYaml(md.value),
        };
        return Promise.resolve(target);
      },

      partitionedMarkdown: (file: string) =>
        Promise.resolve(
          quarto.markdownRegex.partition(Deno.readTextFileSync(file)),
        ),

      execute: async (options: ExecuteOptions): Promise<ExecuteResult> => {
        const cfg = readConfig(options.format?.metadata ?? options.target.metadata);
        const chunks = await quarto.markdownRegex.breakQuartoMd(
          options.target.markdown,
        );

        // Pass 1: collect the code of every cell we are going to run.
        const cells = chunks.cells.map((cell) => {
          const isGp = typeof cell.cell_type === "object" &&
            cell.cell_type.language === kCellLanguage;
          if (!isGp) return { gp: false as const, cell };
          const opts = readCellOptions(
            cell.options as Record<string, unknown> | undefined,
            cfg,
          );
          return { gp: true as const, cell, opts };
        });

        // Inline expressions are queued in document order together with the
        // cells, so that `` `{gp} p` `` in prose sees exactly the state the
        // cells above it left behind.
        const inlineCounts = new Map<number, number>();
        const toRun: string[] = [];
        cells.forEach((c, i) => {
          if (c.gp) {
            if (c.opts.eval) toRun.push(c.cell.source.value);
            return;
          }
          if (c.cell.cell_type === "raw") return; // the YAML front matter
          const exprs = findInlineExpressions(c.cell.sourceVerbatim.value);
          if (exprs.length === 0) return;
          inlineCounts.set(i, exprs.length);
          for (const e of exprs) toRun.push(`print(${e})`);
        });

        const run = await runGp(toRun, cfg, options.cwd);

        // An SVG goes straight into an HTML page; every other format needs a
        // file on disk to point an image at.
        const htmlish = /html|revealjs|epub/i.test(
          options.format?.pandoc?.to ?? "html",
        );
        const figuresDir = figureDir(options.target.input);
        const supporting: string[] = [];
        let figureCount = 0;

        const emitFigure = (svg: string, opts: CellOptions): string => {
          if (htmlish) return emitHtmlFigure(svg, opts);
          figureCount += 1;
          const name = `${opts.label ?? `figure-${figureCount}`}.svg`;
          Deno.mkdirSync(figuresDir.absolute, { recursive: true });
          Deno.writeTextFileSync(`${figuresDir.absolute}/${name}`, svg);
          if (!supporting.includes(figuresDir.supporting)) {
            supporting.push(figuresDir.supporting);
          }
          return emitFileFigure(`${figuresDir.relative}/${name}`, opts);
        };

        // Pass 2: rebuild the document.
        const out: string[] = [];
        let runIndex = 0;
        for (const [i, c] of cells.entries()) {
          if (!c.gp) {
            const n = inlineCounts.get(i) ?? 0;
            if (n === 0) {
              out.push(c.cell.sourceVerbatim.value);
            } else {
              const values = run.outputs.slice(runIndex, runIndex + n)
                .map((v) => trimOutput(v).replace(/\s*\n\s*/g, " "));
              runIndex += n;
              out.push(substituteInline(c.cell.sourceVerbatim.value, values));
            }
            continue;
          }
          const code = c.cell.source.value;
          const result = c.opts.eval ? run.outputs[runIndex++] : undefined;

          if (result !== undefined && isGpError(result) && !c.opts.error) {
            throw new Error(
              `PARI/GP error in a {gp} cell${
                c.cell.cellStartLine ? ` at line ${c.cell.cellStartLine}` : ""
              }:\n\n${trimOutput(result)}\n\n` +
                `Set "#| error: true" on the cell (or "error: true" under ` +
                `"pari-gp:" in the front matter) to show the error in the ` +
                `rendered document instead of stopping.`,
            );
          }
          out.push(emitCell(code, result, c.opts, emitFigure));
        }

        if (run.truncated) {
          throw new Error(
            "PARI/GP exited before the end of the document. A cell most " +
              "likely left a construct open (an unbalanced brace, bracket or " +
              "string), or called quit().",
          );
        }

        const result: ExecuteResult = {
          engine: kEngineName,
          markdown: out.join(""),
          supporting,
          filters: [],
        };

        // Hand pandoc the syntax definition so ```{gp} cells are highlighted
        // without the author having to wire up `syntax-definitions` by hand.
        if (cfg.highlight) {
          const xml = syntaxDefinitionPath(options.cwd);
          const existing = options.format?.pandoc?.["syntax-definitions"];
          const defs = Array.isArray(existing) ? [...existing as string[]] : [];
          if (!defs.some((d) => String(d).endsWith(kSyntaxDefinition))) {
            defs.push(xml);
          }
          result.pandoc = { "syntax-definitions": defs };
        }

        return result;
      },

      dependencies: (_options: DependenciesOptions) =>
        Promise.resolve({ includes: {} }),

      postprocess: (_options: PostProcessOptions) => Promise.resolve(),
    };
  },
};

export default pariGpEngine;
