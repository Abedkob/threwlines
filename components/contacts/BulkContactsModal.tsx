"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import type { ContactIdentity } from "@/types/db";
import {
  CONTACT_IMPORT_MAX_FILE_SIZE,
  type ContactImportRow,
} from "@/lib/contact-import";
import {
  downloadContactTemplate,
  parseContactWorkbook,
} from "@/lib/contact-xlsx";
import { useDialogFocus } from "@/lib/useDialogFocus";
import type { Profile } from "@/types/db";

export function BulkContactsModal({
  profiles,
  onClose,
  onImported,
}: {
  profiles: Profile[];
  onClose: () => void;
  onImported: (count: number) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<ContactImportRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus<HTMLElement>(() => {
    if (!saving) onClose();
  });

  const summary = useMemo(
    () => ({
      total: rows.length,
      valid: rows.filter((row) => row.valid).length,
      warnings: rows.filter((row) =>
        row.issues.some((issue) => issue.level === "warning"),
      ).length,
      invalid: rows.filter((row) => !row.valid).length,
    }),
    [rows],
  );
  const selectedCount = rows.filter(
    (row) => row.valid && selected.has(row.rowNumber),
  ).length;
  const validRows = rows.filter((row) => row.valid);
  const allValidSelected =
    validRows.length > 0 && validRows.every((row) => selected.has(row.rowNumber));

  async function chooseFile(file?: File) {
    if (!file) return;
    setError("");
    setRows([]);
    setSelected(new Set());
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose an Excel workbook with the .xlsx extension.");
      return;
    }
    if (file.size > CONTACT_IMPORT_MAX_FILE_SIZE) {
      setError("The workbook is larger than 5 MB.");
      return;
    }
    setParsing(true);
    try {
      const [buffer, existingContacts] = await Promise.all([
        file.arrayBuffer(),
        apiFetch<ContactIdentity[]>("/api/contacts/identities"),
      ]);
      const result = await parseContactWorkbook(buffer, profiles, existingContacts);
      setRows(result.rows);
      setSelected(
        new Set(
          result.rows.filter((row) => row.valid).map((row) => row.rowNumber),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The workbook could not be read.",
      );
    } finally {
      setParsing(false);
    }
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    void chooseFile(file);
  }

  function dropped(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!parsing && !saving) void chooseFile(event.dataTransfer.files?.[0]);
  }

  function toggleRow(rowNumber: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allValidSelected
        ? new Set()
        : new Set(validRows.map((row) => row.rowNumber)),
    );
  }

  async function downloadTemplate() {
    setDownloading(true);
    setError("");
    try {
      await downloadContactTemplate(profiles);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Excel template could not be created.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function importSelected() {
    const inputs = rows
      .filter((row) => row.valid && selected.has(row.rowNumber))
      .map((row) => row.input);
    if (!inputs.length) return;
    setSaving(true);
    setError("");
    try {
      const { ids } = await apiFetch<{ ids: string[] }>("/api/contacts/bulk", {
        method: "POST",
        ...jsonBody({ contacts: inputs }),
      });
      setImported(ids.length);
      await onImported(ids.length);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The selected contacts could not be imported.",
      );
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (!saving) onClose();
  }

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
    >
      <section
        ref={dialogRef}
        className="modal bulk-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-contact-title"
      >
        <header className="modal-header bulk-contact-header">
          <div>
            <p className="eyebrow">Relationship intake</p>
            <h2 id="bulk-contact-title">Add contacts from Excel</h2>
          </div>
          <button
            className="icon-button"
            onClick={requestClose}
            aria-label="Close"
            disabled={saving}
          >
            <X size={19} />
          </button>
        </header>

        {imported !== null ? (
          <div className="bulk-import-success">
            <span><CheckCircle2 size={30} /></span>
            <p className="eyebrow">Import complete</p>
            <h3>{imported} contact{imported === 1 ? "" : "s"} added</h3>
            <p>The contacts are now available in the CRM and pipeline.</p>
            <button className="button button-primary" onClick={requestClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="bulk-import-body">
              <div className="bulk-import-intro">
                <div>
                  <span className="bulk-step-mark">01</span>
                  <div>
                    <strong>Start with the controlled template</strong>
                    <p>Stage and owner are dropdowns; names are the only required values.</p>
                  </div>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => void downloadTemplate()}
                  disabled={downloading || saving}
                >
                  {downloading ? <LoaderCircle size={15} className="spin-icon" /> : <Download size={15} />}
                  {downloading ? "Preparing…" : "Download template"}
                </button>
              </div>

              <label
                className={`bulk-file-drop ${parsing ? "is-loading" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={dropped}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={fileChanged}
                  disabled={parsing || saving}
                />
                <span className="bulk-step-mark">02</span>
                <span className="bulk-file-icon">
                  {parsing ? <LoaderCircle size={24} className="spin-icon" /> : <UploadCloud size={24} />}
                </span>
                <span>
                  <strong>{parsing ? "Checking workbook…" : fileName || "Drop the completed workbook here"}</strong>
                  <small>{parsing ? "Reading rows and matching owners" : "or choose an .xlsx file · maximum 5 MB"}</small>
                </span>
              </label>

              {error && <p className="form-error bulk-import-error" role="alert"><AlertTriangle size={14} />{error}</p>}

              {rows.length > 0 && (
                <div className="bulk-preview">
                  <div className="bulk-summary" aria-label="Workbook validation summary">
                    <div><small>Rows</small><strong>{summary.total}</strong></div>
                    <div className="is-valid"><small>Ready</small><strong>{summary.valid}</strong></div>
                    <div className="is-warning"><small>Warnings</small><strong>{summary.warnings}</strong></div>
                    <div className="is-invalid"><small>Invalid</small><strong>{summary.invalid}</strong></div>
                  </div>
                  <div className="bulk-preview-heading">
                    <div>
                      <p className="eyebrow">Workbook preview</p>
                      <h3>{fileName}</h3>
                    </div>
                    <button className="bulk-select-all" onClick={toggleAll}>
                      {allValidSelected ? "Clear valid" : "Select all valid"}
                    </button>
                  </div>
                  <div className="bulk-preview-scroll">
                    <table className="bulk-preview-table">
                      <thead><tr><th aria-label="Select" /><th>Excel row</th><th>Contact</th><th>Stage</th><th>Owner</th><th>Check</th></tr></thead>
                      <tbody>
                        {rows.map((row) => {
                          const warnings = row.issues.filter((issue) => issue.level === "warning");
                          const errors = row.issues.filter((issue) => issue.level === "error");
                          const state = errors.length ? "invalid" : warnings.length ? "warning" : "valid";
                          return (
                            <tr className={`bulk-row-${state}`} key={row.rowNumber}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.valid && selected.has(row.rowNumber)}
                                  disabled={!row.valid || saving}
                                  onChange={() => toggleRow(row.rowNumber)}
                                  aria-label={`Import Excel row ${row.rowNumber}`}
                                />
                              </td>
                              <td><code>{row.rowNumber}</code></td>
                              <td><strong>{row.input.name || "Missing name"}</strong><small>{row.input.email || row.input.whatsapp || row.input.instagram || "No channel"}</small></td>
                              <td><span className={`stage-chip stage-${row.input.stage}`}>{row.input.stage}</span></td>
                              <td>{row.ownerName || <span className="muted">Unassigned</span>}</td>
                              <td>
                                <span className={`bulk-row-state is-${state}`}>
                                  {state === "valid" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                                  {state}
                                </span>
                                {row.issues.length > 0 && <small className="bulk-row-message">{row.issues.map((issue) => issue.message).join(" ")}</small>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <footer className="modal-actions bulk-import-actions">
              <span>{rows.length ? `${selectedCount} of ${summary.valid} valid rows selected` : "Use the template to keep every column predictable."}</span>
              <button className="button button-secondary" onClick={requestClose} disabled={saving}>Cancel</button>
              <button className="button button-primary" onClick={() => void importSelected()} disabled={!selectedCount || saving || parsing}>
                {saving ? <LoaderCircle size={15} className="spin-icon" /> : <FileSpreadsheet size={15} />}
                {saving ? "Importing…" : `Import ${selectedCount || ""} contact${selectedCount === 1 ? "" : "s"}`}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
