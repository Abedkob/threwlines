import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEGACY_WAVE_BACKGROUND,
  WAVE_BACKGROUND,
  backgroundClass,
  isWaveBackground,
} from "./template-background.ts";

// The background style is persisted twice over: once in document_templates.config
// and again frozen into each invoice's own config when it is finalised. Those
// frozen copies are a historical record and are never migrated, so the old
// spelling has to keep rendering for as long as those invoices exist.

test("both the current and the pre-rename spelling count as the wave", () => {
  assert.equal(isWaveBackground(WAVE_BACKGROUND), true);
  assert.equal(isWaveBackground(LEGACY_WAVE_BACKGROUND), true);
});

test("anything else is not the wave", () => {
  for (const value of ["clean", "", "wave", "signature", undefined, null]) {
    assert.equal(isWaveBackground(value), false, `${String(value)} must not count as the wave`);
  }
});

test("both spellings resolve to one CSS class", () => {
  // The class name is interpolated into the DOM from the stored value. Without
  // this collapse an invoice finalised before the rename would ask for a class
  // that no longer exists and would silently lose its background.
  assert.equal(backgroundClass(LEGACY_WAVE_BACKGROUND), WAVE_BACKGROUND);
  assert.equal(backgroundClass(WAVE_BACKGROUND), WAVE_BACKGROUND);
});

test("everything else falls back to clean", () => {
  for (const value of ["clean", "nonsense", undefined, null]) {
    assert.equal(backgroundClass(value), "clean");
  }
});

test("the stylesheet has a rule for the class actually emitted", () => {
  const css = readFileSync("app/legacy/document-templates.css", "utf8");
  assert.ok(
    css.includes(`invoice-background-${WAVE_BACKGROUND}`),
    `no .invoice-background-${WAVE_BACKGROUND} rule, so the wave would render as nothing`,
  );
  assert.ok(
    css.includes(`template-background-choice-${WAVE_BACKGROUND}`),
    `no .template-background-choice-${WAVE_BACKGROUND} rule for the picker swatch`,
  );
});

test("the legacy spelling is still a member of the stored type", () => {
  // Dropping it from the union would make every historical row a type error
  // and tempt someone into a cast that hides the compatibility requirement.
  const types = readFileSync("types/db.ts", "utf8");
  const line = types.split("\n").find((text) => text.includes("TemplateBackgroundStyle ="));
  assert.ok(line, "could not find TemplateBackgroundStyle");
  assert.ok(line.includes(`"${LEGACY_WAVE_BACKGROUND}"`), "the pre-rename value must stay in the union");
  assert.ok(line.includes(`"${WAVE_BACKGROUND}"`), "the current value must be in the union");
});
