import type {
  Activity,
  ActivityChannel,
  Contact,
  ContactIdentity,
  ContactInput,
  ContactStage,
  ContactUpdate,
  Cursor,
  CursorResult,
  NewPaymentInput,
  PagedResult,
  Payment,
} from "@/types/db";
import {
  activityDateRange,
  sanitizeContactSearch,
  type PipelineActivityFilter,
  type PipelineOwnerFilter,
} from "../pipeline.ts";
import { query, queryCount, queryOne, rpc } from "./query.ts";
import {
  insertRow,
  notifyDataChanged,
  pageBounds,
  paged,
  updateRow,
} from "./shared.ts";

const LEAD_STAGES: ContactStage[] = ["new", "contacted", "replied", "negotiating"];

const contactSummarySelect = `
  select c.id, c.name, c.instagram, c.whatsapp, c.email, c.location,
    c.billing_name, c.billing_contact, c.billing_address, c.met_at, c.stage,
    c.assigned_to, c.notes, c.created_by, c.created_at, c.last_touched_at,
    case when p.id is null then null
         else json_build_object('id', p.id, 'name', p.name, 'color', p.color) end as owner
  from contacts c
  left join profiles p on p.id = c.assigned_to
`;

const CONTACT_INSERT_COLUMNS = [
  "name",
  "instagram",
  "whatsapp",
  "email",
  "location",
  "billing_name",
  "billing_contact",
  "billing_address",
  "met_at",
  "stage",
  "assigned_to",
  "notes",
] as const;

export type PipelineQueryOptions = {
  query?: string;
  owner?: PipelineOwnerFilter;
  activity?: PipelineActivityFilter;
  pageSize?: number;
  pages?: Partial<Record<ContactStage, number>>;
};

export type PipelineResult = {
  rows: Record<ContactStage, Contact[]>;
  totals: Record<ContactStage, number>;
  pages: Record<ContactStage, number>;
  totalPages: Record<ContactStage, number>;
};

function normalizeContact(contact: Contact): Contact {
  return {
    ...contact,
    activities: contact.activities ?? [],
    payments: (contact.payments ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    })),
  };
}

// Accumulates WHERE conditions with numbered placeholders.
class Where {
  readonly conditions: string[] = [];
  readonly params: unknown[] = [];

  add(sql: (placeholder: string) => string, value: unknown) {
    this.params.push(value);
    this.conditions.push(sql(`$${this.params.length}`));
  }

  addIn(column: string, values: string[]) {
    const placeholders = values.map((value) => {
      this.params.push(value);
      return `$${this.params.length}`;
    });
    this.conditions.push(`${column} in (${placeholders.join(", ")})`);
  }

  search(raw: string) {
    const search = sanitizeContactSearch(raw);
    if (!search) return;
    this.add(
      (p) =>
        `(c.name ilike ${p} or c.email ilike ${p} or c.instagram ilike ${p} or c.whatsapp ilike ${p} or c.location ilike ${p})`,
      `%${search}%`,
    );
  }

  sql() {
    return this.conditions.length ? `where ${this.conditions.join(" and ")}` : "";
  }
}

async function selectContacts(where: Where, limit: number, offset: number) {
  const { rows } = await query<Contact>(
    `${contactSummarySelect} ${where.sql()}
     order by c.last_touched_at asc, c.id asc
     limit $${where.params.length + 1} offset $${where.params.length + 2}`,
    [...where.params, limit, offset],
  );
  return rows.map(normalizeContact);
}

function countContacts(where: Where) {
  return queryCount(`select count(*) from contacts c ${where.sql()}`, where.params);
}

export async function listContactsPage(options: {
  page: number;
  pageSize: number;
  query?: string;
  filter?: "all" | "leads" | "customers";
}): Promise<PagedResult<Contact>> {
  const bounds = pageBounds(options.page, options.pageSize);
  const where = new Where();
  if (options.filter === "leads") where.addIn("c.stage", LEAD_STAGES);
  if (options.filter === "customers") where.add((p) => `c.stage = ${p}`, "customer");
  where.search(options.query ?? "");
  const [total, rows] = await Promise.all([
    countContacts(where),
    selectContacts(where, bounds.pageSize, bounds.from),
  ]);
  return paged(rows, total, bounds.page, bounds.pageSize);
}

export async function getContact(id: string): Promise<Contact> {
  const row = await queryOne<Contact>(`${contactSummarySelect} where c.id = $1`, [id]);
  if (!row) throw new Error("Contact not found.");
  return normalizeContact(row);
}

export async function listContactIdentities(): Promise<ContactIdentity[]> {
  const { rows } = await query<ContactIdentity>(
    "select id, name, instagram, whatsapp, email from contacts order by id asc",
  );
  return rows;
}

// Microsecond-precision ISO text so cursor comparisons do not lose precision
// through JavaScript Date round-trips.
function cursorTimestamp(alias: string) {
  return `to_char(${alias}.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

type CursorRow = { cursor_created_at: string };

function cursorResult<T extends { id: string }>(
  all: (T & CursorRow)[],
  limit: number,
): CursorResult<T> {
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  const rows = page.map((row) => {
    const { cursor_created_at: _ignored, ...rest } = row;
    return rest as unknown as T;
  });
  return {
    rows,
    nextCursor:
      all.length > limit && last
        ? { createdAt: last.cursor_created_at, id: last.id }
        : null,
  };
}

export async function listContactActivities(
  contactId: string,
  cursor: Cursor | null = null,
  limit = 20,
): Promise<CursorResult<Activity>> {
  const params: unknown[] = [contactId];
  let cursorSql = "";
  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
    cursorSql = "and (a.created_at < $2 or (a.created_at = $2 and a.id < $3))";
  }
  params.push(limit + 1);
  const { rows } = await query<Activity & CursorRow>(
    `select a.*, ${cursorTimestamp("a")} as cursor_created_at,
       case when p.id is null then null
            else json_build_object('id', p.id, 'name', p.name, 'color', p.color) end as author_profile
     from activities a
     left join profiles p on p.id = a.author
     where a.contact_id = $1 ${cursorSql}
     order by a.created_at desc, a.id desc
     limit $${params.length}`,
    params,
  );
  return cursorResult<Activity>(rows, limit);
}

export async function listContactPayments(
  contactId: string,
  cursor: Cursor | null = null,
  limit = 20,
): Promise<CursorResult<Payment>> {
  const params: unknown[] = [contactId];
  let cursorSql = "";
  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
    cursorSql = "and (a.created_at < $2 or (a.created_at = $2 and a.id < $3))";
  }
  params.push(limit + 1);
  const { rows } = await query<Payment & CursorRow>(
    `select a.*, ${cursorTimestamp("a")} as cursor_created_at,
       case when s.id is null then null
            else json_build_object('id', s.id, 'name', s.name, 'default_price', s.default_price) end as service
     from payments a
     left join services s on s.id = a.service_id
     where a.contact_id = $1 ${cursorSql}
     order by a.created_at desc, a.id desc
     limit $${params.length}`,
    params,
  );
  const result = cursorResult<Payment>(rows, limit);
  return {
    ...result,
    rows: result.rows.map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    })),
  };
}

export async function listPipelineContacts(
  options: PipelineQueryOptions,
): Promise<PipelineResult> {
  const stages: ContactStage[] = [
    "new",
    "contacted",
    "replied",
    "negotiating",
    "customer",
    "lost",
  ];
  const pageSize = Math.max(
    1,
    Math.min(Math.floor(options.pageSize ?? 40) || 40, 100),
  );
  const owner = options.owner ?? "all";
  const dateRange = activityDateRange(options.activity ?? "all");
  const results = await Promise.all(
    stages.map(async (stage) => {
      const page = Math.max(1, Math.floor(options.pages?.[stage] ?? 1) || 1);
      const where = new Where();
      where.add((p) => `c.stage = ${p}`, stage);
      where.search(options.query ?? "");
      if (owner === "unassigned") where.conditions.push("c.assigned_to is null");
      else if (owner !== "all") where.add((p) => `c.assigned_to = ${p}`, owner);
      if (dateRange.afterExclusive)
        where.add((p) => `c.last_touched_at > ${p}`, dateRange.afterExclusive);
      if (dateRange.beforeInclusive)
        where.add((p) => `c.last_touched_at <= ${p}`, dateRange.beforeInclusive);
      const [total, rows] = await Promise.all([
        countContacts(where),
        selectContacts(where, pageSize, (page - 1) * pageSize),
      ]);
      return {
        stage,
        rows,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }),
  );
  const pick = <T>(select: (result: (typeof results)[number]) => T) =>
    Object.fromEntries(results.map((result) => [result.stage, select(result)])) as Record<
      ContactStage,
      T
    >;
  return {
    rows: pick((result) => result.rows),
    totals: pick((result) => result.total),
    pages: pick((result) => result.page),
    totalPages: pick((result) => result.totalPages),
  };
}

export async function listAttentionContacts(limit = 5): Promise<Contact[]> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const where = new Where();
  where.addIn("c.stage", LEAD_STAGES);
  where.add((p) => `c.last_touched_at < ${p}`, cutoff);
  return selectContacts(where, limit, 0);
}

export async function createContact(
  userId: string,
  input: ContactInput,
): Promise<string> {
  const row = await insertRow<{ id: string }>(
    "contacts",
    { ...input, created_by: userId },
    "id",
  );
  notifyDataChanged();
  return row.id;
}

export async function createContacts(
  userId: string,
  inputs: ContactInput[],
): Promise<string[]> {
  if (!inputs.length) throw new Error("Choose at least one contact to import.");
  if (inputs.length > 500) throw new Error("Import at most 500 contacts at a time.");
  const columns = [...CONTACT_INSERT_COLUMNS, "created_by"];
  const params: unknown[] = [];
  const tuples = inputs.map((input) => {
    const values = [
      ...CONTACT_INSERT_COLUMNS.map((column) => input[column] ?? null),
      userId,
    ];
    const placeholders = values.map((value) => {
      params.push(value);
      return `$${params.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const { rows } = await query<{ id: string }>(
    `insert into contacts (${columns.join(", ")}) values ${tuples.join(", ")} returning id`,
    params,
  );
  if (rows.length !== inputs.length)
    throw new Error("The imported contact count could not be verified.");
  notifyDataChanged();
  return rows.map((row) => row.id);
}

export async function updateContact(id: string, input: ContactUpdate) {
  await updateRow("contacts", id, input);
  notifyDataChanged();
}

export async function moveContact(
  userId: string,
  contact: Contact,
  stage: ContactStage,
) {
  await updateRow("contacts", contact.id, { stage });
  await insertRow(
    "activities",
    {
      contact_id: contact.id,
      author: userId,
      channel: null,
      note: `Moved from ${contact.stage} to ${stage}`,
    },
    "id",
  );
  notifyDataChanged();
}

export async function addActivity(
  userId: string,
  contactId: string,
  channel: ActivityChannel,
  note: string,
): Promise<Activity> {
  const row = await insertRow<Activity>("activities", {
    contact_id: contactId,
    author: userId,
    channel,
    note,
  });
  notifyDataChanged();
  return row;
}

export async function addPayment(input: NewPaymentInput): Promise<Payment> {
  const row = await insertRow<Payment>("payments", { ...input });
  notifyDataChanged();
  return { ...row, amount: Number(row.amount) };
}

export async function getContactPaymentSummary(contactId: string) {
  const data = await rpc<any>("contact_payment_summary", [contactId]);
  return {
    collected: Number(data?.collected ?? 0),
    pending: Number(data?.pending ?? 0),
    entries: Number(data?.entries ?? 0),
  };
}
