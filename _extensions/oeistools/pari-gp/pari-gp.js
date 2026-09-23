// src/pari-gp.ts
var quarto;
var kEngineName = "pari-gp";
var kCellLanguage = "gp";
var kHighlightLanguage = "pari-gp";
var kSyntaxDefinition = "pari-gp.xml";
var kDefaultConfig = {
  path: "gp",
  args: [],
  timeout: 300,
  highlight: true,
  echo: true,
  output: true,
  error: false,
  eval: true,
  include: true
};
function asBool(v, fallback) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (/^(true|yes|on)$/i.test(v)) return true;
    if (/^(false|no|off)$/i.test(v)) return false;
  }
  return fallback;
}
function asNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
    return Number(v);
  }
  return void 0;
}
function asStringArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") return v.split(/\s+/).filter((s) => s.length > 0);
  return void 0;
}
function readConfig(metadata) {
  const cfg = {
    ...kDefaultConfig
  };
  const raw = metadata?.[kEngineName] ?? metadata?.["pari_gp"] ?? metadata?.["gp"];
  if (!raw || typeof raw !== "object") return cfg;
  const m = raw;
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
function readCellOptions(raw, cfg) {
  const o = raw ?? {};
  let output = cfg.output;
  if (o.output === "asis" || o.results === "asis") output = "asis";
  else if (o.output !== void 0) output = asBool(o.output, cfg.output);
  return {
    eval: asBool(o.eval, cfg.eval),
    echo: asBool(o.echo, cfg.echo),
    output,
    error: asBool(o.error, cfg.error),
    include: asBool(o.include, cfg.include),
    classes: asStringArray(o.classes)?.map((c) => c.replace(/^\./, "")) ?? [],
    filename: typeof o.filename === "string" ? o.filename : void 0,
    label: typeof o.label === "string" ? o.label : void 0,
    figCap: typeof o["fig-cap"] === "string" ? o["fig-cap"] : void 0,
    figAlt: typeof o["fig-alt"] === "string" ? o["fig-alt"] : void 0,
    figWidth: o["fig-width"] !== void 0 ? String(o["fig-width"]) : void 0
  };
}
var kMissingGp = (path) => `PARI/GP executable "${path}" was not found.

Install PARI/GP (https://pari.math.u-bordeaux.fr/download.html), or point the engine at it explicitly:

    ---
    engine: pari-gp
    pari-gp:
      path: /path/to/gp
    ---
`;
function shellQuote(s) {
  if (Deno.build.os === "windows") return `"${s}"`;
  return `'${s.replaceAll("'", `'\\''`)}'`;
}
function buildScript(codes, nonce, cfg) {
  const lines = [];
  lines.push(`default(colors, "no");`);
  lines.push(`default(timer, 0);`);
  lines.push(`default(breakloop, 0);`);
  lines.push(`default(readline, 0);`);
  lines.push(`default(echo, 0);`);
  lines.push(`default(linewrap, 0);`);
  if (cfg.stacksize) lines.push(`default(parisize, "${cfg.stacksize}");`);
  if (cfg.primelimit) lines.push(`default(primelimit, "${cfg.primelimit}");`);
  if (cfg.precision !== void 0) {
    lines.push(`default(realprecision, ${cfg.precision});`);
  }
  if (cfg.bitprecision !== void 0) {
    lines.push(`default(realbitprecision, ${cfg.bitprecision});`);
  }
  if (cfg.seriesprecision !== void 0) {
    lines.push(`default(seriesprecision, ${cfg.seriesprecision});`);
  }
  if (cfg.prelude) lines.push(cfg.prelude);
  lines.push(`print("${sentinel(nonce, -1)}")`);
  codes.forEach((code, i) => {
    lines.push(code.endsWith("\n") ? code.slice(0, -1) : code);
    lines.push(`print("${sentinel(nonce, i)}")`);
  });
  lines.push("quit");
  return lines.join("\n") + "\n";
}
function sentinel(nonce, i) {
  return `<<<quarto-pari-gp:${nonce}:${i}>>>`;
}
async function runGp(codes, cfg, cwd) {
  if (codes.length === 0) return {
    outputs: [],
    truncated: false
  };
  const nonce = Math.random().toString(36).slice(2, 10);
  const script = buildScript(codes, nonce, cfg);
  const gpArgs = [
    "-q",
    "-f",
    ...cfg.args
  ].map(shellQuote).join(" ");
  const cmdline = `${shellQuote(cfg.path)} ${gpArgs} 2>&1`;
  const [exe, args] = Deno.build.os === "windows" ? [
    "cmd",
    [
      "/d",
      "/s",
      "/c",
      cmdline
    ]
  ] : [
    "/bin/sh",
    [
      "-c",
      `exec ${cmdline}`
    ]
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout * 1e3);
  let stdout;
  try {
    const child = new Deno.Command(exe, {
      args,
      cwd,
      stdin: "piped",
      stdout: "piped",
      stderr: "null",
      signal: controller.signal
    }).spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(script));
    await writer.close().catch(() => {
    });
    const result = await child.output();
    stdout = new TextDecoder().decode(result.stdout);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) throw new Error(kMissingGp(cfg.path));
    if (controller.signal.aborted) {
      throw new Error(`PARI/GP did not finish within ${cfg.timeout}s. Raise the limit with "pari-gp: { timeout: <seconds> }" in the document front matter.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (/(command not found|not recognized as an internal)/i.test(stdout) && !stdout.includes(sentinel(nonce, 0))) {
    throw new Error(kMissingGp(cfg.path));
  }
  const outputs = [];
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
  return {
    outputs,
    truncated
  };
}
var kDiagnosticLine = /^\s*\*\*\*/;
function isGpError(text) {
  return text.split(/\r?\n/).some((line) => kDiagnosticLine.test(line) && !/\*\*\*\s+Warning:/.test(line));
}
function trimOutput(s) {
  return s.replace(/^\s*\n/, "").replace(/\s+$/, "");
}
function fence(content) {
  let longest = 0;
  for (const m of content.matchAll(/^`{3,}/gm)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}
function codeBlock(content, attrs) {
  const f = fence(content);
  return `${f}${attrs}
${content}
${f}
`;
}
var kSvgStart = /^\s*(<\?xml[^>]*\?>\s*)?(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i;
function isSvg(text) {
  return kSvgStart.test(text);
}
function unquoteGpString(text) {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return t;
}
function svgForInlineUse(svg, opts) {
  let out = svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, "").replace(/^\s*<!DOCTYPE[^>]*>\s*/i, "").trim();
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
function attrEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
var kInlineGp = /`\{gp\}([^`]+)`/g;
function proseRuns(md) {
  const runs = [];
  const fence2 = /^(\s*)(`{3,}|~{3,}).*$/gm;
  let at = 0;
  let open = null;
  let m;
  while ((m = fence2.exec(md)) !== null) {
    const marker = m[2];
    if (open === null) {
      runs.push({
        text: md.slice(at, m.index),
        code: false
      });
      at = m.index;
      open = marker[0].repeat(marker.length);
    } else if (marker[0] === open[0] && marker.length >= open.length) {
      const end = m.index + m[0].length;
      runs.push({
        text: md.slice(at, end),
        code: true
      });
      at = end;
      open = null;
    }
  }
  runs.push({
    text: md.slice(at),
    code: open !== null
  });
  return runs;
}
function findInlineExpressions(md) {
  const found = [];
  for (const run of proseRuns(md)) {
    if (run.code) continue;
    for (const m of run.text.matchAll(kInlineGp)) found.push(m[1].trim());
  }
  return found;
}
function substituteInline(md, values) {
  let i = 0;
  return proseRuns(md).map((run) => {
    if (run.code) return run.text;
    return run.text.replace(kInlineGp, () => values[i++] ?? "");
  }).join("");
}
function emitHtmlFigure(svg, opts) {
  const raw = "```{=html}\n" + svgForInlineUse(svg, opts) + "\n```\n";
  if (opts.label) {
    return `
::: {#${opts.label}}
${raw}
${opts.figCap ?? ""}
:::
`;
  }
  const caption = opts.figCap ? `

<p class="figure-caption">${attrEscape(opts.figCap)}</p>
` : "";
  return `
::: {.cell-output .cell-output-display}
${raw}${caption}:::
`;
}
function emitFileFigure(path, opts) {
  const attrs = [];
  if (opts.label) attrs.push(`#${opts.label}`);
  if (opts.figWidth) attrs.push(`width=${opts.figWidth}`);
  const attr = attrs.length ? `{${attrs.join(" ")}}` : "";
  const cap = opts.figCap ?? "";
  const alt = opts.figAlt ?? cap;
  return `
::: {.cell-output .cell-output-display}
![${cap || alt}](${path})${attr}
:::
`;
}
function emitCell(code, output, opts, emitFigure) {
  if (!opts.include) return "";
  const parts = [];
  if (opts.echo) {
    const classes = [
      kHighlightLanguage,
      "cell-code",
      ...opts.classes
    ].map((c) => `.${c}`).join(" ");
    const attr = opts.filename ? `${classes} filename="${opts.filename}"` : classes;
    parts.push(codeBlock(code.replace(/\s+$/, ""), ` {${attr}}`));
  }
  const text = output === void 0 ? "" : trimOutput(output);
  if (text.length > 0 && opts.output !== false) {
    const unquoted = unquoteGpString(text);
    if (emitFigure && isSvg(unquoted)) {
      parts.push(emitFigure(unquoted, opts));
    } else if (opts.output === "asis") {
      parts.push("\n" + text + "\n");
    } else {
      const kind = isGpError(text) ? "cell-output-error" : "cell-output-stdout";
      parts.push(`
::: {.cell-output .${kind}}
`);
      parts.push(codeBlock(text, ""));
      parts.push(":::\n");
    }
  }
  if (parts.length === 0) return "";
  return `
::: {.cell}
${parts.join("")}:::

`;
}
function figureDir(input) {
  const sep = input.includes("\\") && !input.includes("/") ? "\\" : "/";
  const at = input.lastIndexOf(sep);
  const dir = at === -1 ? "." : input.slice(0, at);
  const base = (at === -1 ? input : input.slice(at + 1)).replace(/\.[^.]+$/, "");
  const supporting = `${dir}${sep}${base}_files`;
  return {
    absolute: `${supporting}${sep}figure-gp`,
    relative: `${base}_files/figure-gp`,
    supporting
  };
}
function extensionDir() {
  const url = new URL(".", import.meta.url);
  return decodeURIComponent(url.pathname);
}
function syntaxDefinitionPath(documentDir) {
  const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const target = norm(extensionDir() + kSyntaxDefinition).split("/");
  const from = norm(documentDir).split("/");
  if (from[0] !== target[0]) return target.join("/");
  let i = 0;
  while (i < from.length && i < target.length && from[i] === target[i]) i += 1;
  const rel = [
    ...new Array(from.length - i).fill(".."),
    ...target.slice(i)
  ];
  return rel.length > 0 ? rel.join("/") : target.join("/");
}
var pariGpEngine = {
  init: (quartoAPI) => {
    quarto = quartoAPI;
  },
  name: kEngineName,
  defaultExt: ".qmd",
  defaultYaml: () => [
    "engine: pari-gp"
  ],
  defaultContent: () => [
    "```{gp}",
    "p = nextprime(10^30)",
    "factor(p - 1)",
    "```"
  ],
  validExtensions: () => [],
  claimsFile: (_file, _ext) => false,
  claimsLanguage: (language, _firstClass) => language.toLowerCase() === kCellLanguage,
  canFreeze: true,
  generatesFigures: true,
  launch: (_context) => {
    return {
      name: kEngineName,
      canFreeze: true,
      markdownForFile: (file) => Promise.resolve(quarto.mappedString.fromFile(file)),
      target: (file, _quiet, markdown) => {
        const md = markdown ?? quarto.mappedString.fromFile(file);
        const target = {
          source: file,
          input: file,
          markdown: md,
          metadata: quarto.markdownRegex.extractYaml(md.value)
        };
        return Promise.resolve(target);
      },
      partitionedMarkdown: (file) => Promise.resolve(quarto.markdownRegex.partition(Deno.readTextFileSync(file))),
      execute: async (options) => {
        const cfg = readConfig(options.format?.metadata ?? options.target.metadata);
        const chunks = await quarto.markdownRegex.breakQuartoMd(options.target.markdown);
        const cells = chunks.cells.map((cell) => {
          const isGp = typeof cell.cell_type === "object" && cell.cell_type.language === kCellLanguage;
          if (!isGp) return {
            gp: false,
            cell
          };
          const opts = readCellOptions(cell.options, cfg);
          return {
            gp: true,
            cell,
            opts
          };
        });
        const inlineCounts = /* @__PURE__ */ new Map();
        const toRun = [];
        cells.forEach((c, i) => {
          if (c.gp) {
            if (c.opts.eval) toRun.push(c.cell.source.value);
            return;
          }
          if (c.cell.cell_type === "raw") return;
          const exprs = findInlineExpressions(c.cell.sourceVerbatim.value);
          if (exprs.length === 0) return;
          inlineCounts.set(i, exprs.length);
          for (const e of exprs) toRun.push(`print(${e})`);
        });
        const run = await runGp(toRun, cfg, options.cwd);
        const htmlish = /html|revealjs|epub/i.test(options.format?.pandoc?.to ?? "html");
        const figuresDir = figureDir(options.target.input);
        const supporting = [];
        let figureCount = 0;
        const emitFigure = (svg, opts) => {
          if (htmlish) return emitHtmlFigure(svg, opts);
          figureCount += 1;
          const name = `${opts.label ?? `figure-${figureCount}`}.svg`;
          Deno.mkdirSync(figuresDir.absolute, {
            recursive: true
          });
          Deno.writeTextFileSync(`${figuresDir.absolute}/${name}`, svg);
          if (!supporting.includes(figuresDir.supporting)) {
            supporting.push(figuresDir.supporting);
          }
          return emitFileFigure(`${figuresDir.relative}/${name}`, opts);
        };
        const out = [];
        let runIndex = 0;
        for (const [i, c] of cells.entries()) {
          if (!c.gp) {
            const n = inlineCounts.get(i) ?? 0;
            if (n === 0) {
              out.push(c.cell.sourceVerbatim.value);
            } else {
              const values = run.outputs.slice(runIndex, runIndex + n).map((v) => trimOutput(v).replace(/\s*\n\s*/g, " "));
              runIndex += n;
              out.push(substituteInline(c.cell.sourceVerbatim.value, values));
            }
            continue;
          }
          const code = c.cell.source.value;
          const result2 = c.opts.eval ? run.outputs[runIndex++] : void 0;
          if (result2 !== void 0 && isGpError(result2) && !c.opts.error) {
            throw new Error(`PARI/GP error in a {gp} cell${c.cell.cellStartLine ? ` at line ${c.cell.cellStartLine}` : ""}:

${trimOutput(result2)}

Set "#| error: true" on the cell (or "error: true" under "pari-gp:" in the front matter) to show the error in the rendered document instead of stopping.`);
          }
          out.push(emitCell(code, result2, c.opts, emitFigure));
        }
        if (run.truncated) {
          throw new Error("PARI/GP exited before the end of the document. A cell most likely left a construct open (an unbalanced brace, bracket or string), or called quit().");
        }
        const result = {
          engine: kEngineName,
          markdown: out.join(""),
          supporting,
          filters: []
        };
        if (cfg.highlight) {
          const xml = syntaxDefinitionPath(options.cwd);
          const existing = options.format?.pandoc?.["syntax-definitions"];
          const defs = Array.isArray(existing) ? [
            ...existing
          ] : [];
          if (!defs.some((d) => String(d).endsWith(kSyntaxDefinition))) {
            defs.push(xml);
          }
          result.pandoc = {
            "syntax-definitions": defs
          };
        }
        return result;
      },
      dependencies: (_options) => Promise.resolve({
        includes: {}
      }),
      postprocess: (_options) => Promise.resolve()
    };
  }
};
var pari_gp_default = pariGpEngine;
export {
  pari_gp_default as default
};
