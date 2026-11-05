// Retints app/legacy/*.css from the old cool-grey + indigo + lime palette to the
// Nosterys warm-paper + marine + brass one.
//
// Why a script and not 1,000 hand edits: the legacy sheets hold ~1,170 hex
// literals that the token system never reaches, so changing :root alone leaves
// most of the product cool. A script makes the mapping a reviewable rule rather
// than a thousand judgement calls, and makes it re-runnable if the palette moves
// again.
//
// Three invariants it must not break:
//   1. The hex COUNT must not change. lib/design-tokens.ts pins
//      LEGACY_HEX_BUDGET at exactly 1170 with no slack, so every replacement is
//      hex-for-hex and nothing is added or removed.
//   2. .status-* and .license-state-* rule bodies are masked out entirely.
//      design-tokens.test.ts parses them for contrast pairs, and invoice and
//      licence states have to stay distinguishable from each other.
//   3. Pure black and pure white are left alone. They are overlay and shadow
//      alphas on dark chrome, not surfaces, and tinting them shifts everything
//      layered on top.
//
// Usage: node scripts/retint-legacy.mjs [--check]
//        --check reports what would change and writes nothing.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const CHECK = process.argv.includes("--check");

// Warm neutral ramp, light to dark. Any low-chroma colour is re-expressed as the
// point on this ramp with the same relative luminance, which keeps every
// existing contrast relationship while moving the hue onto the paper axis.
const RAMP = ["#FFFFFF", "#F6F3EE", "#E3DCD1", "#C9BFB0", "#A09788", "#6A6258", "#40392F", "#221E19", "#120F0C", "#000000"];
const MARINE_HUE = 207; // --primary
const BRASS = [0xc8, 0xa2, 0x4a]; // --accent-line

const toLinear = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);

function hueOf([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [hueOf([r, g, b]), s, l];
}

const parseHex = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

// Pick the point on RAMP with the same relative luminance as the input.
function onWarmRamp(rgb) {
  const target = luminance(rgb);
  const stops = RAMP.map(parseHex);
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = luminance(stops[i]), b = luminance(stops[i + 1]);
    if (target <= a && target >= b) {
      const t = a === b ? 0 : (a - target) / (a - b);
      return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * t));
    }
  }
  return target > luminance(stops[0]) ? stops[0] : stops[stops.length - 1];
}

// The single colour rule, applied to hex literals and to rgb()/rgba() alike.
function remap(rgb) {
  const c = chroma(rgb), h = hueOf(rgb);
  const [r, g, b] = rgb;
  const isPure = (r === g && g === b) && (r === 0 || r === 255);
  if (isPure) return null;                                   // overlays and shadows
  if (c > 40 && h >= 60 && h <= 100) return BRASS;           // the acid lime
  if (c <= 14) return onWarmRamp(rgb);                       // neutrals -> warm paper
  // Every blue, from the palest wash to a fully saturated indigo, is a
  // derivative of the old brand and moves to the marine hue at its own
  // saturation and lightness. The band stops short of the status colours:
  // success sits near hue 155, warning near 40 and danger near 10, so none of
  // them is reachable from here.
  if (h >= 170 && h <= 275) {
    const [, s, l] = rgbToHsl(rgb);
    return hslToRgb(MARINE_HUE, s, l);
  }
  return null;                                               // status colours, left alone
}

// Blank out the pills so no replacement can reach inside them, keeping byte
// offsets stable by substituting spaces.
const PROTECTED = /\.(?:status|license-state)-[a-z_]+[^{}]*\{[^{}]*\}/g;
function maskProtected(css) {
  return css.replace(PROTECTED, (block) => " ".repeat(block.length));
}

let totals = { files: 0, hex: 0, rgb: 0, skipped: 0 };

for (const file of globSync("app/legacy/*.css")) {
  const original = readFileSync(file, "utf8");
  const masked = maskProtected(original);
  let out = "", cursor = 0, hexHits = 0, rgbHits = 0;

  const token = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
  let m;
  while ((m = token.exec(masked)) !== null) {
    const text = m[0];
    const rgb = text.startsWith("#") ? parseHex(text) : [+m[1], +m[2], +m[3]];
    const next = remap(rgb);
    out += original.slice(cursor, m.index);
    if (next === null) {
      out += original.slice(m.index, m.index + text.length);
      totals.skipped += 1;
    } else if (text.startsWith("#")) {
      // Same token count either way: a 3-digit hex becomes one 6-digit hex.
      out += toHex(next);
      hexHits += 1;
    } else {
      out += text.slice(0, text.indexOf("(") + 1) + next.join(", ");
      rgbHits += 1;
    }
    cursor = m.index + text.length;
  }
  out += original.slice(cursor);
  out = out.replaceAll("--vault-lime", "--vault-brass");

  totals.files += 1; totals.hex += hexHits; totals.rgb += rgbHits;
  console.log(`${file.padEnd(36)} hex=${String(hexHits).padStart(4)}  rgb=${String(rgbHits).padStart(3)}`);
  if (!CHECK && out !== original) writeFileSync(file, out);
}

console.log(`\n${CHECK ? "would retint" : "retinted"}: ${totals.hex} hex, ${totals.rgb} rgb/rgba across ${totals.files} files; ${totals.skipped} left as-is`);
