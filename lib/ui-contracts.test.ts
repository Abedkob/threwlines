import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Source-level contracts for behaviour that is easy to drop and invisible
// until someone reaches for the keyboard. These read source because the
// components resolve through the "@/" tsconfig alias and there is no DOM in
// this suite.

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return entry.endsWith(".tsx") ? [path.split("\\").join("/")] : [];
  });
}

test("pagination offers a way forward as well as back", () => {
  const source = readFileSync("components/ui/Pagination.tsx", "utf8");
  assert.match(source, /aria-label="Previous page"/);
  assert.match(
    source,
    /aria-label="Next page"/,
    "there was no next-page control at all, so page 2 was unreachable",
  );
  assert.match(
    source,
    /onPageChange\(page \+ 1\)/,
    "the next control must actually advance the page",
  );
  assert.match(
    source,
    /disabled=\{disabled \|\| page >= totalPages\}/,
    "the next control must stop at the last page",
  );
});

// Dialogs declared inline inside a big client component rather than as their
// own component. useDialogFocus engages on mount, so calling it from the
// parent would trap focus for the life of the page — these need extracting
// into components first. The list may shrink, never grow.
const DIALOGS_AWAITING_EXTRACTION = [
  "components/billing/contracts/ContractsClient.tsx",
  "components/billing/invoices/InvoiceAdminEditor.tsx",
  "components/billing/invoices/InvoiceDetailsClient.tsx",
  "components/billing/invoices/InvoicesClient.tsx",
  "components/billing/payments/PaymentsClient.tsx",
];

test("every dialog manages focus", () => {
  // A dialog that claims aria-modal="true" promises assistive technology that
  // the rest of the page is unreachable. Honouring that needs a focus trap,
  // Escape, and focus restored to whatever opened it — which is exactly what
  // useDialogFocus and the ui/Modal primitive provide.
  const offenders = [...tsxFiles("components"), ...tsxFiles("app")]
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!/role="dialog"/.test(source)) return false;
      return !/useDialogFocus|from "\.\/Modal"|components\/ui\/Modal/.test(source);
    })
    // Modal.tsx is the primitive itself; it implements the behaviour directly.
    .filter((file) => file !== "components/ui/Modal.tsx")
    .filter((file) => !DIALOGS_AWAITING_EXTRACTION.includes(file));
  assert.deepEqual(offenders, [], `new dialogs without focus management: ${offenders.join(", ")}`);
});

test("the known-unmanaged dialog list does not go stale", () => {
  // If one of these is fixed or deleted, the entry must come out, so the list
  // keeps reflecting the real debt rather than quietly excusing new dialogs.
  for (const file of DIALOGS_AWAITING_EXTRACTION) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /role="dialog"/, `${file} no longer has a dialog — remove it from the list`);
    assert.doesNotMatch(
      source,
      /useDialogFocus/,
      `${file} now manages focus — remove it from the list`,
    );
  }
});

test("the dialog scan found the dialogs", () => {
  const dialogs = [...tsxFiles("components")].filter((file) =>
    /role="dialog"/.test(readFileSync(file, "utf8")),
  );
  assert.ok(dialogs.length >= 8, `only found ${dialogs.length} dialogs`);
});

test("focus restore survives autoFocus", () => {
  // React applies autoFocus while committing the dialog, before effects run.
  // Reading document.activeElement inside the effect therefore captures the
  // dialog's own first field, and closing restores focus to a detached node.
  const source = readFileSync("lib/useDialogFocus.ts", "utf8");
  assert.match(
    source,
    /useRef<HTMLElement \| null>\(/,
    "the opener must be captured during render, not inside the effect",
  );
  assert.match(
    source,
    /previous\?\.isConnected/,
    "focusing a removed element silently drops focus onto <body>",
  );
});

test("the Modal primitive locks and releases body scroll", () => {
  const source = readFileSync("components/ui/Modal.tsx", "utf8");
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(
    source,
    /document\.body\.style\.overflow = previousOverflow/,
    "a lock without a matching release leaves the page unscrollable",
  );
});
