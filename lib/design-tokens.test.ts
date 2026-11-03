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
  assert.ok(pairs.size >= 9, `only parsed ${pairs.size} pill color pairs`);
  const failures: string[] = [];
  for (const [selector, [fg, bg]] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < 4.5) {
      failures.push(`${selector} ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(failures, []);
});
