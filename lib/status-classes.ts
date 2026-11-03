// Status vocabulary for the four families that appear on more than one screen. Each value maps
// to the complete, literal class string for its pill, replacing the interpolated
// `status-pill status-${row.status}` expressions scattered across the screens: a typo or a new
// union member now fails a test instead of rendering an unstyled pill.
//
// The strings are the EXISTING legacy class names on purpose. app/legacy/*.css still paints
// these pills, and the AA contrast guard in lib/design-tokens.test.ts asserts 4.5:1 by parsing
// those rules. Moving the colors in here would leave that guard parsing rules nothing renders.
// Pills get tokenised, and the guard migrated, by the task that retires their CSS region.
//
// The screen-specific families (heat-edge-*, stage-chip, priority-*, channel-*, method-*,
// template-preview-*, license-event-*, invoice-doc-status-*) join this module as the task that
// converts their screen reaches them. Follow the shape below: a frozen Record per union, a
// matching label Record, an accessor, and an entry in ALL_STATUSES.

import type {
  InvoiceStatus,
  LicenseEffectiveStatus,
  PaymentStatus,
  TaskStatus,
} from "../types/db.ts";

export type StatusFamily = "invoice" | "payment" | "task" | "license";

export type StatusEntry = {
  readonly family: StatusFamily;
  readonly value: string;
  readonly className: string;
  readonly label: string;
};

// Keys run in lifecycle order so a filter bar or legend built from Object.keys reads in the
// order the record actually travels, not alphabetically.

export const INVOICE_STATUS_CLASS: Readonly<Record<InvoiceStatus, string>> = Object.freeze({
  draft: "status-pill status-draft",
  sent: "status-pill status-sent",
  partially_paid: "status-pill status-partially_paid",
  paid: "status-pill status-paid",
  overdue: "status-pill status-overdue",
  cancelled: "status-pill status-cancelled",
});

export const INVOICE_STATUS_LABEL: Readonly<Record<InvoiceStatus, string>> = Object.freeze({
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partly paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
});

export const PAYMENT_STATUS_CLASS: Readonly<Record<PaymentStatus, string>> = Object.freeze({
  pending: "status-pill status-pending",
  paid: "status-pill status-paid",
});

export const PAYMENT_STATUS_LABEL: Readonly<Record<PaymentStatus, string>> = Object.freeze({
  pending: "Pending",
  paid: "Paid",
});

// Tasks have no pill of their own in the legacy CSS: the task card renders status as an icon
// toggle. Rather than name a `.status-open` / `.status-done` rule that does not exist, which
// would render an unstyled pill, these reuse the only settled/outstanding pair that exists and
// already clears AA. The task that rebuilds the task screen should give tasks their own pair.
export const TASK_STATUS_CLASS: Readonly<Record<TaskStatus, string>> = Object.freeze({
  open: "status-pill status-pending",
  done: "status-pill status-paid",
});

export const TASK_STATUS_LABEL: Readonly<Record<TaskStatus, string>> = Object.freeze({
  open: "Open",
  done: "Done",
});

export const LICENSE_STATUS_CLASS: Readonly<Record<LicenseEffectiveStatus, string>> = Object.freeze({
  scheduled: "license-state license-state-scheduled",
  active: "license-state license-state-active",
  suspended: "license-state license-state-suspended",
  expired: "license-state license-state-expired",
  revoked: "license-state license-state-revoked",
});

export const LICENSE_STATUS_LABEL: Readonly<Record<LicenseEffectiveStatus, string>> = Object.freeze({
  scheduled: "Scheduled",
  active: "Active",
  suspended: "Suspended",
  expired: "Expired",
  revoked: "Revoked",
});

export function invoiceStatusClass(status: InvoiceStatus): string {
  return INVOICE_STATUS_CLASS[status];
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABEL[status];
}

export function paymentStatusClass(status: PaymentStatus): string {
  return PAYMENT_STATUS_CLASS[status];
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABEL[status];
}

export function taskStatusClass(status: TaskStatus): string {
  return TASK_STATUS_CLASS[status];
}

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABEL[status];
}

export function licenseStatusClass(status: LicenseEffectiveStatus): string {
  return LICENSE_STATUS_CLASS[status];
}

export function licenseStatusLabel(status: LicenseEffectiveStatus): string {
  return LICENSE_STATUS_LABEL[status];
}

function entries<T extends string>(
  family: StatusFamily,
  classes: Readonly<Record<T, string>>,
  labels: Readonly<Record<T, string>>,
): StatusEntry[] {
  return (Object.keys(classes) as T[]).map((value) => ({
    family,
    value,
    className: classes[value],
    label: labels[value],
  }));
}

// Every status the shared lookup knows, for tests and for any screen that needs a legend.
export const ALL_STATUSES: ReadonlyArray<StatusEntry> = Object.freeze([
  ...entries("invoice", INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL),
  ...entries("payment", PAYMENT_STATUS_CLASS, PAYMENT_STATUS_LABEL),
  ...entries("task", TASK_STATUS_CLASS, TASK_STATUS_LABEL),
  ...entries("license", LICENSE_STATUS_CLASS, LICENSE_STATUS_LABEL),
]);
