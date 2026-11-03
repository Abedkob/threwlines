import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { AA_TEXT_PAIRS, TOKENS, contrastRatio, countLegacyHex, LEGACY_HEX_BUDGET } from "./design-tokens.ts";

// Rules live in the demoted `legacy` cascade layer; only tokens stay in the entry point.
const LEGACY_SHEETS = ["globals", "login", "document-templates", "licensing", "shell"];
const legacySheet = (name: string): string => readFileSync(`app/legacy/${name}.css`, "utf8");

test("layout imports exactly one stylesheet", () => {
  const imports = readFileSync("app/layout.tsx", "utf8").match(/^import ".*\.css";$/gm) ?? [];
  assert.deepEqual(imports, ['import "./globals.css";']);
});

test("globals.css declares layer order with legacy lowest and omits Preflight", () => {
  // Comments are stripped so the file can explain in prose why Preflight is excluded without
  // the word "preflight" tripping the assertion below.
  const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /@layer legacy,\s*theme,\s*base,\s*components,\s*utilities;/);
  assert.match(css, /@import "tailwindcss\/theme\.css" layer\(theme\);/);
  assert.match(css, /@import "tailwindcss\/utilities\.css" layer\(utilities\);/);
  // Preflight is opted out of by importing theme.css and utilities.css separately.
  // The bare `@import "tailwindcss";` is what pulls the reset in, and it contains no
  // "preflight" substring, so it has to be matched directly.
  assert.doesNotMatch(css, /@import\s+"tailwindcss"\s*;/);
  assert.doesNotMatch(css, /preflight/);
});

test("no tailwind config file exists", () => {
  for (const ext of ["js", "cjs", "mjs", "ts"]) {
    assert.equal(existsSync(`tailwind.config.${ext}`), false, `tailwind.config.${ext} should not exist`);
  }
});

// A token declared on a root-scoped selector inside the `legacy` layer can never beat the
// unlayered token block in app/globals.css, however late it appears. Before the layer
// inversion such a declaration won by source order, so any that survive are silent value
// changes. Tasks 7-12 delete legacy rules continuously; this keeps new ones from appearing.
const ROOT_SCOPED = /^(?::root|html|body|\*)$/;

test("no legacy sheet declares a custom property on a root-scoped selector", () => {
  const offenders: string[] = [];
  for (const name of LEGACY_SHEETS) {
    // Comments are stripped first: one sitting above a selector lands in the prelude capture
    // and would otherwise hide the rule behind it.
    const css = legacySheet(name).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, prelude, body] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (!/(?:^|[;{\s])--[\w-]+\s*:/.test(body)) {
        continue;
      }
      for (const selector of prelude.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (ROOT_SCOPED.test(selector)) {
          offenders.push(`${name}.css: ${selector} { ${body.trim().slice(0, 60)} }`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("every legacy sheet is imported into the legacy layer", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const name of ["globals", "shell", "document-templates", "licensing", "login"]) {
    assert.match(css, new RegExp(`@import "\\./legacy/${name}\\.css" layer\\(legacy\\);`), `${name}.css is not layered`);
  }
});

test("print blocks survive the move", () => {
  const css = legacySheet("globals");
  assert.equal((css.match(/@media print/g) ?? []).length, 3);
  assert.match(css, /print-color-adjust:\s*exact/);
  assert.equal((css.match(/@page\b/g) ?? []).length, 4);
  assert.match(css, /@page\s*\{/);
  assert.match(css, /@page invoice-landscape\s*\{/);
  const templates = legacySheet("document-templates");
  assert.equal((templates.match(/@media print/g) ?? []).length, 1);
  assert.match(templates, /print-color-adjust:\s*exact/);
});

test("contrastRatio matches known values", () => {
  assert.equal(Math.round(contrastRatio("#FFFFFF", "#000000")), 21);
  assert.ok(Math.abs(contrastRatio(TOKENS.primary, "#FFFFFF") - 6.61) < 0.02);
});

test("every token is declared in globals.css", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const name of Object.keys(TOKENS)) {
    assert.ok(new RegExp(`--${name}:\\s*${TOKENS[name]}`, "i").test(css), `missing --${name}`);
  }
});

test("legacy hardcoded hex count does not grow", () => {
  const total = LEGACY_SHEETS.reduce((n, f) => n + countLegacyHex(legacySheet(f)), 0);
  assert.ok(total <= LEGACY_HEX_BUDGET, `${total} hex literals exceeds budget ${LEGACY_HEX_BUDGET}`);
});

test("status text colors meet WCAG AA on light surfaces", () => {
  assert.equal(AA_TEXT_PAIRS.length, 12);
  for (const [fg, bg] of AA_TEXT_PAIRS) {
    const ratio = contrastRatio(TOKENS[fg], TOKENS[bg]);
    assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
  }
});

test("status and license pills meet WCAG AA text contrast", () => {
  const rule = /(?<=^|[}\s,])(\.(?:status|license-state)-[a-z_]+)\s*\{([^{}]*)\}/g;
  const pairs = new Map<string, [string, string]>();
  for (const file of ["globals", "licensing"]) {
    const css = legacySheet(file);
    for (const match of css.matchAll(rule)) {
      const color = /(?:^|[;\s])color\s*:\s*(#[0-9a-f]{3,6})\b/i.exec(match[2]);
      const background = /(?:^|[;\s])background\s*:\s*(#[0-9a-f]{3,6})\b/i.exec(match[2]);
      if (color && background) {
        pairs.set(match[1], [color[1], background[1]]);
      }
    }
  }
  assert.ok(pairs.size >= 12, `only parsed ${pairs.size} pill color pairs`);
  const failures: string[] = [];
  for (const [selector, [fg, bg]] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < 4.5) {
      failures.push(`${selector} ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(failures, []);
});

// A filled button changes background on hover and press while its white label stays put, so the
// pressed value carries the same AA obligation as the resting one. --danger-fill is the trap
// here: white on it is 4.0:1, the exact failure Task 2 fixed on this button, so a hover tinted
// toward the fill variant would reintroduce the bug one task later.
test("white text holds AA on every filled button background, resting and pressed", () => {
  for (const token of ["primary", "primary-pressed", "danger", "danger-pressed"]) {
    const ratio = contrastRatio(TOKENS.surface, TOKENS[token]);
    assert.ok(ratio >= 4.5, `--surface text on --${token} is ${ratio.toFixed(2)}:1`);
  }
  // Named so the reason --danger-fill is not the hover value is checkable, not just asserted.
  assert.ok(contrastRatio(TOKENS.surface, TOKENS["danger-fill"]) < 4.5);
});

// A pressed value has to read as the same colour pressed harder. Tying each pair's darkening to
// the other keeps one button family from drifting louder than the other.
test("the two pressed values darken their base by the same proportion", () => {
  const drop = (base: string, pressed: string): number =>
    contrastRatio(TOKENS.surface, TOKENS[pressed]) / contrastRatio(TOKENS.surface, TOKENS[base]);
  const primary = drop("primary", "primary-pressed");
  const danger = drop("danger", "danger-pressed");
  assert.ok(
    Math.abs(primary - danger) < 0.1,
    `primary darkens by ${primary.toFixed(3)}x but danger by ${danger.toFixed(3)}x`,
  );
});

const FOCUS_SHEETS = ["globals", "login", "licensing"];

test("every stylesheet that styles controls defines a focus ring", () => {
  for (const f of FOCUS_SHEETS) {
    const css = legacySheet(f);
    if (/\b(button|input|select|textarea|\[tabindex)/.test(css)) {
      assert.match(css, /:focus-visible/, `${f}.css styles controls but has no focus-visible rule`);
      assert.match(
        css,
        /:focus-visible[^{}]*\{[^{}]*box-shadow\s*:[^;}]*var\(--focus-ring/,
        `${f}.css has no focus-visible rule that draws the shared ring`,
      );
    }
  }
});

const FOCUS_RING = /(--focus-ring(?:-dark)?):\s*0 0 0 2px var\(--(\w+)\), 0 0 0 4px var\(--(\w+)\);/g;

test("the focus ring is two solid layers drawn from tokens", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const rings = new Map<string, [string, string]>();
  for (const [, name, gap, ring] of css.matchAll(FOCUS_RING)) {
    rings.set(name, [gap, ring]);
  }
  assert.deepEqual(rings.get("--focus-ring"), ["surface", "primary"]);
  assert.deepEqual(rings.get("--focus-ring-dark"), ["ink", "surface"]);
  for (const f of FOCUS_SHEETS) {
    const sheet = legacySheet(f);
    const stale = /:focus-visible[^{}]*\{[^{}]*rgba\(61,\s*90,\s*241/.exec(sheet);
    assert.equal(stale, null, `${f}.css still has a focus rule using the old brand blue`);
  }
});

test("the focus ring is at least 3:1 against the surface it sits on", () => {
  // Each ring's outer layer must separate from the surface it is drawn on:
  // the light ring sits on page and card surfaces, the dark ring on --ink.
  for (const surface of [TOKENS.surface, TOKENS.canvas]) {
    const ratio = contrastRatio(TOKENS.primary, surface);
    assert.ok(ratio >= 3, `--focus-ring is ${ratio.toFixed(2)}:1 on ${surface}`);
  }
  const dark = contrastRatio(TOKENS.surface, TOKENS.ink);
  assert.ok(dark >= 3, `--focus-ring-dark is ${dark.toFixed(2)}:1 on --ink`);
});

test("controls inside the sidebar use the dark ring", () => {
  const css = legacySheet("globals");
  assert.match(
    css,
    /\.sidebar[^{}]*:focus-visible[^{}]*\{[^{}]*box-shadow:\s*var\(--focus-ring-dark\)/,
    "no .sidebar focus-visible rule uses --focus-ring-dark",
  );
});

test("a focus-visible rule never draws a second, competing indicator", () => {
  // The ring is the single mechanism. A rule may keep an opaque outline only if it
  // switches the ring off (table rows, where box-shadow is unreliable).
  const rule = /([^{}]*:focus-visible[^{}]*)\{([^{}]*)\}/g;
  for (const f of [...FOCUS_SHEETS, "document-templates"]) {
    const css = legacySheet(f).replace(/@media\s+print\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
    for (const [, selector, body] of css.matchAll(rule)) {
      const outline = /outline\s*:\s*([^;}]+)/.exec(body);
      if (outline && !/transparent|none|^0$/.test(outline[1].trim())) {
        assert.match(body, /box-shadow\s*:\s*none/, `${f}.css: ${selector.trim()} draws both an outline and the ring`);
      }
    }
  }
});

// Utilities such as bg-primary generate from this block, so its names are the house vocabulary.
const themeBlock = (): string =>
  readFileSync("app/globals.css", "utf8").match(/@theme\b[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";

test("every token is exposed to Tailwind as a theme color", () => {
  const theme = themeBlock();
  for (const name of Object.keys(TOKENS)) {
    assert.match(theme, new RegExp(`--color-${name}:\\s*var\\(--${name}\\)`), `--color-${name} not in @theme`);
  }
});

test("the theme block holds exactly the four-size type scale and no hex literals", () => {
  const theme = themeBlock();
  // `--text-*: initial` is what clears Tailwind's stock sizes. Without it every stock size
  // returns and the four-size restriction below still reads as satisfied, so the four sizes
  // listed are only a restriction while this line is present.
  assert.match(theme, /--text-\*:\s*initial;/);
  const sizes = [...theme.matchAll(/--text-([a-z]+):\s*([^;]+);/g)].map(([, n, v]) => `${n}=${v.trim()}`);
  assert.deepEqual(sizes, ["xs=0.75rem", "sm=0.8125rem", "base=0.9375rem", "lg=1.25rem"]);
  assert.deepEqual(
    [...theme.matchAll(/--text-([\w-]+)--line-height:\s*([^;]+);/g)].map(([, n, v]) => `${n}=${v.trim()}`),
    ["xs=1rem", "sm=1.25rem", "base=1.5rem", "lg=1.75rem"],
  );
  assert.equal((theme.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length, 0);
  assert.doesNotMatch(theme, /--spacing/);
});

// Scoped to the first :root block, not the whole file. --mobile-nav-height is also declared in
// the @media (max-width: 820px) block, so a whole-file match would stay green with the :root
// declaration deleted - which is the only declaration the legacy sheets can never beat, and so
// the only one this guard exists to protect.
const rootBlock = (): string =>
  readFileSync("app/globals.css", "utf8").match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

test("the shell geometry tokens stay declared on :root", () => {
  const root = rootBlock();
  assert.doesNotMatch(root, /@media/, "the capture ran past the end of the :root block");
  assert.match(root, /--sidebar-width:\s*248px;/);
  assert.match(root, /--sidebar-compact-width:\s*82px;/);
  assert.match(root, /--mobile-nav-height:\s*72px;/);
});

// Controls on a surface and on --ink both need a radius, and the direction allows exactly two
// values. They are theme names rather than arbitrary values so every screen spells them once.
test("the radius scale is exactly the two values the direction allows", () => {
  const root = rootBlock();
  assert.match(root, /--radius-control:\s*6px;/);
  assert.match(root, /--radius-surface:\s*10px;/);
  const theme = themeBlock();
  assert.deepEqual(
    [...theme.matchAll(/--radius-([\w-]+):\s*([^;]+);/g)].map(([, n, v]) => `${n}=${v.trim()}`),
    ["control=var(--radius-control)", "surface=var(--radius-surface)"],
  );
});

// The type scale is restricted by clearing Tailwind's stock sizes, which means a class like
// `text-xl` generates nothing at all: the element silently gets no font-size and typecheck,
// lint, test and build all stay green. Nothing but this guard notices.
const FONT_SIZE_CLASS = /(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g;
const SIZES_THAT_EXIST = new Set(["xs", "sm", "base", "lg"]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((entry) => `${dir}/${entry}`);

test("every Tailwind text size used in app/ and components/ is one of the four that exist", () => {
  const offenders: string[] = [];
  let scanned = 0;
  for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
    for (const [match, size] of readFileSync(file, "utf8").matchAll(FONT_SIZE_CLASS)) {
      scanned += 1;
      if (!SIZES_THAT_EXIST.has(size)) {
        offenders.push(`${file}: ${match} generates no font-size`);
      }
    }
  }
  assert.deepEqual(offenders, []);
  // Without this the guard would pass just as happily on a broken walk or a regex that matches
  // nothing, which is the shape of green-but-watching-nothing it is here to replace.
  assert.ok(scanned >= 3, `matched only ${scanned} text size classes; the walk or pattern is broken`);
});
