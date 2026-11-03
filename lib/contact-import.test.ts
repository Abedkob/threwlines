import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  validateContactImportRows,
  type RawContactImportRow,
} from "./contact-import.ts";
import { buildContactTemplate, parseContactWorkbook } from "./contact-xlsx.ts";
import { createContacts } from "./db/contacts.ts";

const profiles = [
  {
    id: "owner-1",
    name: "Sarah",
    color: "#5265bf",
    app_role: "member" as const,
    created_at: "2026-08-01T00:00:00.000Z",
  },
];

test("contact import normalizes optional values and resolves defaults", () => {
  const rows: RawContactImportRow[] = [{
    rowNumber: 2,
    values: {
      name: "  Maya Haddad  ",
      stage: "",
      owner_name: "sarah",
      whatsapp: "+961 70 123 456",
      email: " maya@example.com ",
      met_at: "2026-08-20",
    },
  }];
  const result = validateContactImportRows(rows, profiles);
  assert.equal(result.summary.valid, 1);
  assert.deepEqual(result.rows[0].input, {
    name: "Maya Haddad",
    stage: "new",
    assigned_to: "owner-1",
    instagram: null,
    whatsapp: "+961 70 123 456",
    email: "maya@example.com",
    location: null,
    billing_name: null,
    billing_contact: null,
    billing_address: null,
    met_at: "2026-08-20T00:00:00.000Z",
    notes: null,
  });
});

test("contact import blocks invalid fields and formulas", () => {
  const result = validateContactImportRows([{
    rowNumber: 9,
    values: {
      name: "   ",
      stage: "archived",
      owner_name: "Missing owner",
      email: "not-an-email",
      met_at: "20 August",
    },
    formulaFields: ["notes"],
  }], profiles);
  assert.equal(result.summary.invalid, 1);
  assert.match(result.rows[0].issues.map((issue) => issue.message).join(" "), /Name is required/);
  assert.match(result.rows[0].issues.map((issue) => issue.message).join(" "), /not recognized/);
  assert.match(result.rows[0].issues.map((issue) => issue.message).join(" "), /not a current team member/);
  assert.match(result.rows[0].issues.map((issue) => issue.message).join(" "), /not valid/);
  assert.match(result.rows[0].issues.map((issue) => issue.message).join(" "), /Formulas are not allowed/);
});

test("contact import flags workbook and database identity matches as warnings", () => {
  const result = validateContactImportRows([
    { rowNumber: 2, values: { name: "One", email: "shared@example.com" } },
    { rowNumber: 3, values: { name: "Two", email: "SHARED@example.com" } },
  ], profiles, [{
    id: "existing-1",
    name: "Existing",
    email: "shared@example.com",
    instagram: null,
    whatsapp: null,
  }]);
  assert.equal(result.summary.invalid, 0);
  assert.equal(result.summary.warnings, 2);
  result.rows.forEach((row) => assert.equal(row.issues.filter((issue) => issue.level === "warning").length, 2));
});

test("generated template contains controlled stage and owner dropdowns", async () => {
  const bytes = await buildContactTemplate(profiles);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as any);
  const contacts = workbook.getWorksheet("Contacts");
  assert.ok(contacts);
  assert.equal(contacts.getCell("B2").dataValidation.type, "list");
  assert.deepEqual(contacts.getCell("B2").dataValidation.formulae, ["ContactStages"]);
  assert.equal(contacts.getCell("C2").dataValidation.type, "list");
  assert.deepEqual(contacts.getCell("C2").dataValidation.formulae, ["ContactOwners"]);
  assert.equal(workbook.getWorksheet("Lists")?.getCell("B3").value, "Sarah");
  assert.equal(workbook.getWorksheet("Lists")?.state, "veryHidden");
});

test("generated template round-trips a completed contact", async () => {
  const bytes = await buildContactTemplate(profiles);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as any);
  const contacts = workbook.getWorksheet("Contacts");
  assert.ok(contacts);
  contacts.getCell("A2").value = "John Smith";
  contacts.getCell("B2").value = "customer";
  contacts.getCell("C2").value = "Sarah";
  contacts.getCell("F2").value = "john@example.com";
  contacts.getCell("K2").value = new Date("2026-08-21T00:00:00.000Z");
  const completed = new Uint8Array(await workbook.xlsx.writeBuffer());
  const completedBuffer = completed.buffer.slice(
    completed.byteOffset,
    completed.byteOffset + completed.byteLength,
  ) as ArrayBuffer;
  const parsed = await parseContactWorkbook(
    completedBuffer,
    profiles,
  );
  assert.equal(parsed.summary.valid, 1);
  assert.equal(parsed.rows[0].input.name, "John Smith");
  assert.equal(parsed.rows[0].input.stage, "customer");
  assert.equal(parsed.rows[0].input.assigned_to, "owner-1");
  assert.equal(parsed.rows[0].input.met_at, "2026-08-21T00:00:00.000Z");
});

test("bulk contact creation uses one insert and stamps the current user", async () => {
  const holder = globalThis as Record<string, unknown>;
  const previous = holder.__vaultPgPool;
  const calls: { sql: string; params: unknown[] | undefined }[] = [];
  holder.__vaultPgPool = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      return { rows: [{ id: "contact-1" }], rowCount: 1 };
    },
  };
  try {
    await runBulkCreate(calls);
  } finally {
    holder.__vaultPgPool = previous;
  }
});

async function runBulkCreate(calls: { sql: string; params: unknown[] | undefined }[]) {
  const ids = await createContacts("user-1", [{
    name: "Imported",
    stage: "new",
    assigned_to: null,
    instagram: null,
    whatsapp: null,
    email: null,
    location: null,
    billing_name: null,
    billing_contact: null,
    billing_address: null,
    met_at: null,
    notes: null,
  }]);
  assert.deepEqual(ids, ["contact-1"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^insert into contacts \(/);
  assert.equal(calls[0].params?.at(-1), "user-1");
}
