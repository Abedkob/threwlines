import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AA_TEXT_PAIRS, TOKENS, contrastRatio, countLegacyHex, LEGACY_HEX_BUDGET } from "./design-tokens.ts";

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
  const total = files.reduce((n, f) => n + countLegacyHex(readFileSync(`app/${f}.css`, "utf8")), 0);
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
    const css = readFileSync(`app/${file}.css`, "utf8");
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
    const css = readFileSync(`app/${f}.css`, "utf8");
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

test("the focus ring derives from --primary rather than a hardcoded blue", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(
    css,
    /--focus-ring:\s*0 0 0 3px color-mix\(in srgb, var\(--primary\) 32%, transparent\);/,
  );
  for (const f of FOCUS_SHEETS) {
    const sheet = readFileSync(`app/${f}.css`, "utf8");
    const stale = /:focus-visible[^{}]*\{[^{}]*rgba\(61,\s*90,\s*241/.exec(sheet);
    assert.equal(stale, null, `${f}.css still has a focus rule using the old brand blue`);
  }
});

test("controls inside the sidebar get a ring that is visible on the dark background", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(
    css,
    /\.sidebar[^{}]*:focus-visible[^{}]*\{[^{}]*box-shadow:\s*var\(--focus-ring-on-dark\)/,
    "no .sidebar focus-visible rule uses --focus-ring-on-dark",
  );
  const ring = /--focus-ring-on-dark:\s*0 0 0 3px color-mix\(in srgb, var\(--(\w+)\) (\d+)%, transparent\)/.exec(css);
  assert.ok(ring, "--focus-ring-on-dark is not a 3px color-mix ring");
  const tint = TOKENS[ring[1]];
  assert.ok(tint, `--focus-ring-on-dark mixes unknown token --${ring[1]}`);
  const alpha = Number(ring[2]) / 100;
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [tr, tg, tb] = channels(tint);
  const [br, bg, bb] = channels(TOKENS.ink);
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  const composited = `#${toHex(tr * alpha + br * (1 - alpha))}${toHex(tg * alpha + bg * (1 - alpha))}${toHex(tb * alpha + bb * (1 - alpha))}`;
  const ratio = contrastRatio(composited, TOKENS.ink);
  assert.ok(ratio >= 3, `sidebar focus ring is ${ratio.toFixed(2)}:1 against --ink, below the 3:1 WCAG minimum`);
});
