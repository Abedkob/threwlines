import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AA_TEXT_PAIRS, TOKENS, contrastRatio, countLegacyHex, LEGACY_HEX_BUDGET } from "./design-tokens.ts";

// Rules live in the demoted `legacy` cascade layer; only tokens stay in the entry point.
const legacySheet = (name: string): string => readFileSync(`app/legacy/${name}.css`, "utf8");

test("layout imports exactly one stylesheet", () => {
  const imports = readFileSync("app/layout.tsx", "utf8").match(/^import ".*\.css";$/gm) ?? [];
  assert.deepEqual(imports, ['import "./globals.css";']);
});

test("globals.css declares layer order with legacy lowest and omits Preflight", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /@layer legacy,\s*theme,\s*base,\s*components,\s*utilities;/);
  assert.match(css, /@import "tailwindcss\/utilities\.css" layer\(utilities\);/);
  assert.doesNotMatch(css, /preflight/);
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
  const files = ["globals", "login", "document-templates", "licensing", "shell"];
  const total = files.reduce((n, f) => n + countLegacyHex(legacySheet(f)), 0);
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
