import type { Cell, Worksheet } from "exceljs";
import type { ContactIdentity, Profile } from "@/types/db";
import {
  CONTACT_IMPORT_HEADERS,
  CONTACT_IMPORT_MAX_ROWS,
  CONTACT_IMPORT_STAGES,
  normalizeContactImportHeader,
  validateContactImportRows,
  type ContactImportField,
  type ContactImportResult,
  type ContactImportValue,
  type RawContactImportRow,
} from "./contact-import.ts";

async function loadExcelJs() {
  const excelJsPackage = await import("exceljs");
  return excelJsPackage.default;
}

function formulaCell(cell: Cell) {
  const value = cell.value;
  return Boolean(
    value &&
      typeof value === "object" &&
      ("formula" in value || "sharedFormula" in value),
  );
}

function importValue(cell: Cell): ContactImportValue {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) {
      const result = value.result;
      if (result instanceof Date) return result;
      if (typeof result === "string" || typeof result === "number") return result;
    }
  }
  return cell.text.trim();
}

function nonBlank(value: ContactImportValue | undefined) {
  if (value === null || value === undefined) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim().length > 0;
}

function headerMap(sheet: Worksheet) {
  const fields = new Map<number, ContactImportField>();
  const seen = new Set<ContactImportField>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const normalized = normalizeContactImportHeader(cell.text);
    if (!CONTACT_IMPORT_HEADERS.includes(normalized as ContactImportField)) return;
    const field = normalized as ContactImportField;
    if (seen.has(field)) throw new Error(`The ${field} column appears more than once.`);
    seen.add(field);
    fields.set(column, field);
  });
  if (!seen.has("name")) throw new Error("The Contacts sheet must include a name column.");
  return fields;
}

export async function parseContactWorkbook(
  buffer: ArrayBuffer,
  profiles: Profile[],
  existingContacts: ContactIdentity[] = [],
): Promise<ContactImportResult> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Contacts");
  if (!sheet) throw new Error('The workbook must contain a sheet named "Contacts".');
  const fields = headerMap(sheet);
  const rawRows: RawContactImportRow[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: RawContactImportRow["values"] = {};
    const formulaFields: ContactImportField[] = [];
    fields.forEach((field, column) => {
      const cell = row.getCell(column);
      values[field] = importValue(cell);
      if (formulaCell(cell)) formulaFields.push(field);
    });
    if (!CONTACT_IMPORT_HEADERS.some((field) => nonBlank(values[field]))) continue;
    rawRows.push({ rowNumber, values, formulaFields });
    if (rawRows.length > CONTACT_IMPORT_MAX_ROWS) {
      throw new Error(`A workbook can contain at most ${CONTACT_IMPORT_MAX_ROWS} contacts.`);
    }
  }

  if (!rawRows.length) throw new Error("The Contacts sheet does not contain any contact rows.");
  return validateContactImportRows(rawRows, profiles, existingContacts);
}

const columnWidths: Record<ContactImportField, number> = {
  name: 24,
  stage: 17,
  owner_name: 22,
  instagram: 20,
  whatsapp: 19,
  email: 28,
  location: 22,
  billing_name: 25,
  billing_contact: 23,
  billing_address: 32,
  met_at: 15,
  notes: 42,
};

function styleHeader(sheet: Worksheet) {
  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFF4F6F8" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF20252F" } };
  header.alignment = { vertical: "middle" };
  header.border = { bottom: { style: "medium", color: { argb: "FFB9FF00" } } };
}

export async function buildContactTemplate(profiles: Profile[]) {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ThrewLines";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  const contacts = workbook.addWorksheet("Contacts", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 21 },
  });
  contacts.columns = CONTACT_IMPORT_HEADERS.map((field) => ({
    header: field,
    key: field,
    width: columnWidths[field],
  }));
  styleHeader(contacts);
  contacts.autoFilter = { from: "A1", to: "L1" };

  const lists = workbook.addWorksheet("Lists");
  lists.columns = [
    { header: "stage", key: "stage", width: 20 },
    { header: "owner_name", key: "owner", width: 28 },
  ];
  CONTACT_IMPORT_STAGES.forEach((stage, index) => {
    lists.getCell(index + 2, 1).value = stage;
  });
  lists.getCell(2, 2).value = "Unassigned";
  profiles.forEach((profile, index) => {
    lists.getCell(index + 3, 2).value = profile.name;
  });
  styleHeader(lists);

  const ownerLastRow = Math.max(2, profiles.length + 2);
  workbook.definedNames.add("'Lists'!$A$2:$A$7", "ContactStages");
  workbook.definedNames.add(
    `'Lists'!$B$2:$B$${ownerLastRow}`,
    "ContactOwners",
  );
  for (let row = 2; row <= CONTACT_IMPORT_MAX_ROWS + 1; row += 1) {
    contacts.getCell(row, 1).dataValidation = {
      type: "custom",
      allowBlank: false,
      formulae: [`LEN(TRIM(A${row}))>0`],
      showErrorMessage: true,
      errorTitle: "Name required",
      error: "Enter a contact name.",
    };
    contacts.getCell(row, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ["ContactStages"],
      showInputMessage: true,
      promptTitle: "Pipeline stage",
      prompt: "Leave blank to use new.",
      showErrorMessage: true,
      errorTitle: "Choose a stage",
      error: "Select one of the available stages.",
    };
    contacts.getCell(row, 3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ["ContactOwners"],
      showErrorMessage: true,
      errorTitle: "Choose an owner",
      error: "Select a current team member or Unassigned.",
    };
    contacts.getCell(row, 11).numFmt = "yyyy-mm-dd";
    [1, 4, 5, 6, 7, 8, 9, 10, 12].forEach((column) => {
      contacts.getCell(row, column).numFmt = "@";
    });
    if (row % 2 === 1) {
      contacts.getRow(row).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8F9FB" },
      };
    }
  }

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 24 }, { width: 78 }];
  instructions.mergeCells("A1:B1");
  instructions.getCell("A1").value = "Bulk contact import";
  instructions.getCell("A1").font = {
    name: "Aptos Display",
    size: 20,
    bold: true,
    color: { argb: "FF20252F" },
  };
  instructions.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB9FF00" },
  };
  instructions.getCell("A1").alignment = { vertical: "middle" };
  instructions.getRow(1).height = 42;
  const guidance = [
    ["How to use", "Add one contact per row on the Contacts sheet, then upload this .xlsx file from Add bulk."],
    ["Required", "name is the only required field. Do not rename or remove the name column."],
    ["Stage", "Choose a dropdown value. A blank stage imports as new."],
    ["Owner", "Choose a current team member or Unassigned. A blank owner imports as Unassigned."],
    ["WhatsApp", "Keep phone numbers as text so + and leading zeroes are preserved."],
    ["Met at", "Use an Excel date displayed as YYYY-MM-DD."],
    ["Optional fields", "Leave optional cells blank. They will be stored as empty values."],
    ["Limits", `Maximum ${CONTACT_IMPORT_MAX_ROWS} contacts and a 5 MB file.`],
    ["Avoid", "Do not add formulas, merged cells, title rows, or blank rows inside the contact list."],
  ];
  guidance.forEach(([label, description], index) => {
    const row = index + 3;
    instructions.getCell(row, 1).value = label;
    instructions.getCell(row, 2).value = description;
    instructions.getCell(row, 1).font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF4D5FC1" } };
    instructions.getCell(row, 2).font = { name: "Aptos", size: 10, color: { argb: "FF515966" } };
    instructions.getCell(row, 2).alignment = { wrapText: true, vertical: "top" };
    instructions.getRow(row).height = 31;
  });
  lists.state = "veryHidden";

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function downloadContactTemplate(profiles: Profile[]) {
  const bytes = await buildContactTemplate(profiles);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "contacts-import-template.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
