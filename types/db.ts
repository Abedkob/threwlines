export type ContactStage =
  | "new"
  | "contacted"
  | "replied"
  | "negotiating"
  | "customer"
  | "lost";
export type ActivityChannel =
  | "instagram"
  | "whatsapp"
  | "email"
  | "in_person"
  | "call"
  | "other";
export type PaymentStatus = "paid" | "pending";
export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus = "open" | "done";
export type AppRole = "member" | "superadmin";
export type DocumentType = "invoice" | "contract" | "receipt";
export type ContractStatus = "draft" | "active" | "paused" | "ended";
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";
export type InvoicePaymentMethod = "cash" | "omt" | "whish";
export type LicenseType = "trial" | "subscription" | "perpetual";
export type LicenseStatus = "active" | "suspended" | "revoked";
export type LicenseEffectiveStatus = LicenseStatus | "scheduled" | "expired";
export type LicenseEventType =
  | "issued"
  | "updated"
  | "activated"
  | "validated"
  | "deactivated"
  | "activation_reset"
  | "suspended"
  | "reactivated"
  | "revoked"
  | "rejected";

export type Profile = {
  id: string;
  name: string;
  color: string;
  app_role: AppRole;
  created_at: string;
};

export type Service = {
  id: string;
  name: string;
  default_price: number;
  description: string | null;
  default_quantity: number;
  active: boolean;
  created_at: string;
};

export type Activity = {
  id: string;
  contact_id: string;
  author: string | null;
  channel: ActivityChannel | null;
  note: string;
  created_at: string;
  author_profile?: Pick<Profile, "id" | "name" | "color"> | null;
};

export type Payment = {
  id: string;
  contact_id: string;
  service_id: string | null;
  custom_description: string | null;
  amount: number;
  status: PaymentStatus;
  paid_on: string | null;
  created_at: string;
  service?: Pick<Service, "id" | "name" | "default_price"> | null;
};

export type Contact = {
  id: string;
  name: string;
  instagram: string | null;
  whatsapp: string | null;
  email: string | null;
  location: string | null;
  billing_name: string | null;
  billing_contact: string | null;
  billing_address: string | null;
  met_at: string | null;
  stage: ContactStage;
  assigned_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  last_touched_at: string;
  owner?: Pick<Profile, "id" | "name" | "color"> | null;
  activities?: Activity[];
  payments?: Payment[];
};

export type ContactInput = Pick<
  Contact,
  | "name"
  | "instagram"
  | "whatsapp"
  | "email"
  | "location"
  | "billing_name"
  | "billing_contact"
  | "billing_address"
  | "met_at"
  | "stage"
  | "assigned_to"
  | "notes"
>;
export type ContactUpdate = Partial<Omit<ContactInput, "name">> & {
  name?: string;
};
export type ContactIdentity = Pick<
  Contact,
  "id" | "name" | "instagram" | "whatsapp" | "email"
>;

export type NewPaymentInput = {
  contact_id: string;
  service_id: string | null;
  custom_description: string | null;
  amount: number;
  status: PaymentStatus;
  paid_on: string | null;
};

export type TaskItem = {
  id: string;
  task_id: string;
  parent_id: string | null;
  content: string;
  done: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  created_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  assignee?: Pick<Profile, "id" | "name" | "color"> | null;
  items?: TaskItem[];
};

export type ExpenseCategory = {
  id: string;
  name: string;
  created_at: string;
};

export type Expense = {
  id: string;
  amount: number;
  category_id: string | null;
  description: string | null;
  spent_on: string;
  paid_by: string | null;
  created_by: string | null;
  created_at: string;
  category?: Pick<ExpenseCategory, "id" | "name"> | null;
  payer?: Pick<Profile, "id" | "name" | "color"> | null;
};

export type PagedResult<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Cursor = { createdAt: string; id: string };
export type CursorResult<T> = { rows: T[]; nextCursor: Cursor | null };

export type NavigationCounts = { stale_contacts: number; open_tasks: number };
export type DashboardSummary = {
  need_attention: number;
  active_pipeline: number;
  negotiating: number;
  collected: number;
  pending: number;
  spent: number;
  my_open_tasks: number;
  pipeline_counts: Partial<Record<ContactStage, number>>;
  expense_categories: { name: string; total: number }[];
};
export type ExpenseSummary = {
  total: number;
  categories: { id: string; name: string; total: number }[];
  payers: {
    id: string;
    name: string;
    color: string;
    total: number;
    entries: number;
  }[];
};

export type AppSettings = {
  id: 1;
  company_name: string;
  company_tagline: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  logo_url: string | null;
  stamp_url: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
  invoice_number_padding: number;
  default_currency: string;
  default_due_days: number;
  default_terms: string | null;
  default_footer: string;
  default_payment_instructions: string | null;
  cash_enabled: boolean;
  omt_enabled: boolean;
  omt_recipient_name: string | null;
  omt_phone: string | null;
  whish_enabled: boolean;
  whish_recipient_name: string | null;
  whish_phone: string | null;
  updated_at: string;
};

// "threwlines-wave" is the pre-rename spelling, still present in templates
// created before the rebrand and frozen into historical invoices. See
// lib/template-background.ts.
export type TemplateBackgroundStyle = "clean" | "signature-wave" | "threwlines-wave";

export type TemplateConfig = {
  paperSize: "A4";
  orientation: "portrait" | "landscape";
  primaryColor: string;
  backgroundStyle?: TemplateBackgroundStyle;
  fontFamily: string;
  logoWidth: number;
  stampWidth: number;
  sections: string[];
  visibility: Record<string, boolean>;
  labels: Record<string, string>;
};

export type DocumentTemplate = {
  id: string;
  name: string;
  document_type: DocumentType;
  is_default: boolean;
  config: TemplateConfig;
  created_at: string;
  updated_at: string;
};

export type BillingLineInput = {
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
  service_period_start?: string | null;
  service_period_end?: string | null;
};

export type ContractItem = BillingLineInput & { id: string; contract_id: string };
export type ClientContract = {
  id: string;
  contact_id: string;
  contract_number: string | null;
  title: string;
  start_date: string;
  end_date: string | null;
  billing_day: number;
  due_days: number;
  currency: string;
  status: ContractStatus;
  template_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contact?: Pick<Contact, "id" | "name" | "billing_name">;
  items?: ContractItem[];
};

export type InvoicePayment = {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: InvoicePaymentMethod;
  paid_on: string;
  transaction_reference: string | null;
  notes: string | null;
  created_at: string;
};

export type InvoicePaymentRecord = InvoicePayment & {
  invoice: Pick<
    Invoice,
    "id" | "invoice_number" | "contact_id" | "status" | "currency" | "total_amount"
  > & {
    contact: Pick<Contact, "id" | "name" | "billing_name" | "email" | "whatsapp">;
  };
};

export type InvoiceItem = BillingLineInput & {
  id: string;
  invoice_id: string;
  line_total: number;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  contact_id: string;
  contract_id: string | null;
  template_id: string | null;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string;
  service_period_start: string | null;
  service_period_end: string | null;
  currency: string;
  contract_reference: string | null;
  purchase_order_reference: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  terms: string | null;
  payment_instructions: string | null;
  company_snapshot: Record<string, unknown>;
  client_snapshot: Record<string, unknown>;
  template_snapshot: Record<string, unknown>;
  finalized_at: string | null;
  created_at: string;
  contact?: Pick<Contact, "id" | "name" | "billing_name" | "billing_contact" | "billing_address" | "email" | "whatsapp">;
  items?: InvoiceItem[];
  invoice_payments?: InvoicePayment[];
  template?: DocumentTemplate | null;
};

export type LicensedProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_max_activations: number;
  default_offline_grace_days: number;
  default_validation_hours: number;
  default_entitlements: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LicenseActivation = {
  id: string;
  license_id: string;
  installation_hash: string;
  device_label: string | null;
  platform: string | null;
  application_version: string | null;
  first_activated_at: string;
  last_seen_at: string;
  deactivated_at: string | null;
  deactivated_reason: string | null;
  created_at: string;
};

export type LicenseEvent = {
  id: number;
  license_id: string | null;
  activation_id: string | null;
  contact_id: string | null;
  event_type: LicenseEventType;
  result_code: string;
  actor_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export type LicenseInvoiceSummary = Pick<
  Invoice,
  "id" | "invoice_number" | "status" | "currency" | "total_amount" | "amount_paid" | "balance_due"
>;

export type License = {
  id: string;
  contact_id: string;
  product_id: string;
  source_invoice_id: string | null;
  source_contract_id: string | null;
  key_prefix: string;
  key_last_four: string;
  license_type: LicenseType;
  status: LicenseStatus;
  effective_status: LicenseEffectiveStatus;
  starts_at: string;
  expires_at: string | null;
  max_activations: number;
  active_activations: number;
  total_activations: number;
  offline_grace_days: number;
  validation_hours: number;
  entitlements: Record<string, unknown>;
  internal_notes: string | null;
  token_version: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  contact: Pick<Contact, "id" | "name" | "billing_name" | "email" | "whatsapp">;
  product: Pick<LicensedProduct, "id" | "code" | "name" | "description" | "active">;
  source_invoice: LicenseInvoiceSummary | null;
  activations?: LicenseActivation[];
  events?: LicenseEvent[];
};

export type IssuedLicense = { license_id: string; license_key: string };
