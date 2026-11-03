import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Compiles the real app/globals.css the way the build does, so these assertions are made
// against generated CSS rather than against source that merely looks right.
//
// Why this file exists: app/globals.css imports tailwindcss/theme.css and
// tailwindcss/utilities.css separately, under layer(), to keep Preflight out. That is an
// unusual entry point, and a guard that only checked base utilities such as `bg-primary` would
// stay green if the variant machinery - hover, active, focus-visible, disabled, motion-reduce -
// ever stopped being wired up by that arrangement. Every interaction state on every shared
// primitive, the keyboard focus ring included, depends on it.
//
// Reading this output by hand is a trap worth knowing about: Tailwind escapes the colon in a
// variant class, so the selector is `.hover\:bg-canvas:hover`. A pattern written as
// `hover\:bg-` collapses to `hover:bg-` and matches nothing, which looks exactly like the
// utilities being absent. Every needle below builds the backslash explicitly for that reason,
// and assertions carry their own short messages so a failure never dumps the whole sheet.
const BS = String.fromCharCode(92);

// Whitespace-stripped, because an in-process compile is not minified the way the build's is.
const compiled: string = await (async () => {
  const source = readFileSync("app/globals.css", "utf8");
  const result = await postcss([tailwind()]).process(source, { from: "app/globals.css" });
  return result.css.replace(/\s+/g, "");
})();

const has = (needle: string): boolean => compiled.includes(needle);

test("the compiled sheet carries base utilities built from the tokens", () => {
  for (const needle of [
    ".bg-primary{background-color:var(--primary)",
    ".rounded-control{border-radius:var(--radius-control)",
    ".rounded-surface{border-radius:var(--radius-surface)",
    ".border-line{border-color:var(--line)",
  ]) {
    assert.ok(has(needle), `missing base utility: ${needle}`);
  }
});

// One entry per variant the primitives actually rely on. If the split imports ever stop wiring
// variants up, every one of these fails at once and names what went dead.
const VARIANT_SELECTORS: ReadonlyArray<string> = [
  "hover" + BS + ":bg-primary-pressed:hover",
  "hover" + BS + ":bg-danger-pressed:hover",
  "hover" + BS + ":bg-canvas:hover",
  "active" + BS + ":bg-primary-pressed:active",
  "active" + BS + ":bg-danger-pressed:active",
  "active" + BS + ":bg-canvas:active",
  "disabled" + BS + ":opacity-50:disabled",
  "disabled" + BS + ":cursor-not-allowed:disabled",
  "motion-reduce" + BS + ":transition-none",
  "placeholder" + BS + ":text-muted::placeholder",
  "focus-visible" + BS + ":shadow-",
];

test("every variant the shared primitives depend on generates a selector", () => {
  assert.deepEqual(
    VARIANT_SELECTORS.filter((selector) => !has(selector)).map((s) => `.${s} not generated`),
    [],
  );
});

// The keyboard focus ring is the one state the Quality floor makes non-negotiable, and the one
// most easily lost silently: an arbitrary shadow holding a bare var() can be read as a shadow
// *color* rather than a shadow, which compiles to a selector that sets the wrong property and
// draws nothing. Assert the value lands in --tw-shadow and not in --tw-shadow-color.
test("the focus ring compiles to a box-shadow, not a shadow color", () => {
  const ring = /\.focus-visible\\:shadow-[^{]*:focus-visible\{([^}]*)\}/.exec(compiled);
  assert.ok(ring, "no focus-visible shadow utility in the compiled sheet");
  const body = ring[1];
  assert.ok(body.includes("--tw-shadow:var(--focus-ring)"), `ring sets no --tw-shadow: ${body}`);
  assert.ok(!body.includes("--tw-shadow-color:var(--focus-ring)"), `ring set as a color: ${body}`);
  assert.ok(body.includes("box-shadow:"), `ring declares no box-shadow: ${body}`);
  // The composed box-shadow references variables that are only valid because Tailwind emits
  // @property defaults for them. Without those the whole declaration is dropped as invalid.
  assert.ok(
    has("@property--tw-shadow{") && has("initial-value:00#0000"),
    "no @property default for --tw-shadow, so the composed box-shadow would be invalid",
  );
});

test("Preflight stays out of the compiled sheet", () => {
  // Preflight's signature rules: the universal margin reset and the universal border reset.
  assert.ok(!/\*,::before,::after,::backdrop\{[^}]*margin:0/.test(compiled), "Preflight margin reset present");
  assert.ok(!/\*,::before,::after\{[^}]*border:0solid/.test(compiled), "Preflight border reset present");
  assert.ok(!/preflight/i.test(compiled), "the word preflight appears in the output");
});
