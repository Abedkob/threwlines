import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALL_STATUSES,
  INVOICE_STATUS_CLASS,
  INVOICE_STATUS_LABEL,
  LICENSE_STATUS_CLASS,
  PAYMENT_STATUS_CLASS,
  TASK_STATUS_CLASS,
  invoiceStatusClass,
  licenseStatusClass,
  paymentStatusClass,
  taskStatusClass,
} from "./status-classes.ts";

test("every status value maps to a literal class string", () => {
  for (const entry of ALL_STATUSES) {
    const name = `${entry.family}.${entry.value}`;
    assert.ok(entry.className.length > 0, `${name} has no classes`);
    assert.doesNotMatch(entry.className, /\$\{/, `${name} must not interpolate`);
    assert.doesNotMatch(entry.className, /undefined/, `${name} resolved to undefined`);
  }
});

test("each lookup covers its union exactly, in lifecycle order", () => {
  assert.deepEqual(Object.keys(INVOICE_STATUS_CLASS), [
    "draft",
    "sent",
    "partially_paid",
    "paid",
    "overdue",
    "cancelled",
  ]);
  assert.deepEqual(Object.keys(PAYMENT_STATUS_CLASS), ["pending", "paid"]);
  assert.deepEqual(Object.keys(TASK_STATUS_CLASS), ["open", "done"]);
  assert.deepEqual(Object.keys(LICENSE_STATUS_CLASS), [
    "scheduled",
    "active",
    "suspended",
    "expired",
    "revoked",
  ]);
  assert.equal(ALL_STATUSES.length, 6 + 2 + 2 + 5);
});

test("the accessors return the same strings as the records", () => {
  assert.equal(invoiceStatusClass("overdue"), INVOICE_STATUS_CLASS.overdue);
  assert.equal(paymentStatusClass("pending"), PAYMENT_STATUS_CLASS.pending);
  assert.equal(taskStatusClass("done"), TASK_STATUS_CLASS.done);
  assert.equal(licenseStatusClass("revoked"), LICENSE_STATUS_CLASS.revoked);
});

// The lookup deliberately returns existing legacy class names rather than relocating pill
// colors into TypeScript: app/legacy/*.css is still what paints them, and the AA guard in
// design-tokens.test.ts parses those rules. A name with no rule behind it would render an
// unstyled pill while every gate stayed green, which is the bug this asserts against.
test("every class the lookup returns has a rule in the legacy sheets", () => {
  const css = ["globals", "licensing"]
    .map((name) => readFileSync(`app/legacy/${name}.css`, "utf8"))
    .join("\n");
  const missing: string[] = [];
  for (const entry of ALL_STATUSES) {
    for (const token of entry.className.split(" ")) {
      // Class selectors may be followed by any of { , : . > + ~ or whitespace.
      if (!new RegExp(`\\.${token}(?![\\w-])`).test(css)) {
        missing.push(`${entry.family}.${entry.value} -> .${token}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

// The design direction's Writing section: sentence case everywhere, named as the three
// people name them rather than as the database does, and no arrow glyphs.
test("every label is sentence case and free of database spelling", () => {
  for (const entry of ALL_STATUSES) {
    const name = `${entry.family}.${entry.value}`;
    assert.match(entry.label, /^[A-Z][a-z]*(?: [a-z]+)*$/, `${name} label "${entry.label}" is not sentence case`);
    assert.doesNotMatch(entry.label, /[_→]/, `${name} label carries a database or arrow glyph`);
  }
  assert.equal(INVOICE_STATUS_LABEL.partially_paid, "Partly paid");
});

test("the records are frozen so a screen cannot mutate the shared vocabulary", () => {
  assert.throws(() => {
    (INVOICE_STATUS_CLASS as Record<string, string>).draft = "status-pill status-sent";
  });
});
