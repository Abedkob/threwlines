import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

type Call = { sql: string; params: unknown[] | undefined };

const calls: Call[] = [];
let responses: Array<{ rows: unknown[]; rowCount?: number }> = [];

// The pool module reads globalThis.__vaultPgPool, so a fake pool is enough to
// capture the SQL the domain functions build without a database.
(globalThis as Record<string, unknown>).__vaultPgPool = {
  async query(sql: string, params?: unknown[]) {
    calls.push({ sql, params });
    const next = responses.shift() ?? { rows: [] };
    return { rows: next.rows, rowCount: next.rowCount ?? next.rows.length };
  },
};

const contacts = await import("./contacts.ts");
const shared = await import("./shared.ts");

beforeEach(() => {
  calls.length = 0;
  responses = [];
});

describe("contacts pageBounds", () => {
  it("computes offset and limit for page 2, size 25", () => {
    const bounds = shared.pageBounds(2, 25);
    assert.equal(bounds.from, 25);
    assert.equal(bounds.pageSize, 25);
    assert.equal(bounds.page, 2);
  });

  it("falls back to safe values for invalid input", () => {
    const bounds = shared.pageBounds(-3, 7);
    assert.equal(bounds.page, 1);
    assert.equal(bounds.pageSize, 25);
    assert.equal(bounds.from, 0);
  });
});

describe("contacts listContactsPage", () => {
  it("filters leads with an IN clause on stage", async () => {
    responses = [{ rows: [{ count: "0" }] }, { rows: [] }];
    await contacts.listContactsPage({ page: 1, pageSize: 25, filter: "leads" });
    assert.match(calls[0].sql, /c\.stage in \(\$1, \$2, \$3, \$4\)/i);
    assert.deepEqual(calls[0].params, ["new", "contacted", "replied", "negotiating"]);
  });

  it("filters customers by exact stage", async () => {
    responses = [{ rows: [{ count: "0" }] }, { rows: [] }];
    await contacts.listContactsPage({ page: 1, pageSize: 25, filter: "customers" });
    assert.match(calls[0].sql, /c\.stage = \$1/i);
    assert.deepEqual(calls[0].params, ["customer"]);
  });

  it("builds a parameterized ILIKE OR clause for search", async () => {
    responses = [{ rows: [{ count: "0" }] }, { rows: [] }];
    await contacts.listContactsPage({ page: 1, pageSize: 25, query: "test" });
    const sql = calls[0].sql;
    assert.match(sql, /c\.name ilike \$1/i);
    assert.match(sql, /c\.email ilike \$1/i);
    assert.match(sql, /c\.location ilike \$1/i);
    assert.ok(!sql.includes("test"), "search text must not be interpolated");
    assert.deepEqual(calls[0].params, ["%test%"]);
  });

  it("applies limit and offset for page 2", async () => {
    responses = [{ rows: [{ count: "40" }] }, { rows: [] }];
    const result = await contacts.listContactsPage({ page: 2, pageSize: 25 });
    assert.match(calls[1].sql, /limit \$1 offset \$2/i);
    assert.deepEqual(calls[1].params, [25, 25]);
    assert.equal(result.total, 40);
    assert.equal(result.totalPages, 2);
  });
});

describe("contacts mutations", () => {
  it("createContact returns the new contact id and records the creator", async () => {
    responses = [{ rows: [{ id: "c-1" }] }];
    const id = await contacts.createContact("user-1", {
      name: "Ada",
      instagram: null,
      whatsapp: null,
      email: "ada@example.com",
      location: null,
      billing_name: null,
      billing_contact: null,
      billing_address: null,
      met_at: null,
      stage: "new",
      assigned_to: null,
      notes: null,
    });
    assert.equal(id, "c-1");
    assert.match(calls[0].sql, /insert into contacts/i);
    assert.ok(calls[0].params?.includes("user-1"));
  });

  it("createContacts rejects empty and oversized batches", async () => {
    await assert.rejects(() => contacts.createContacts("u", []), /at least one/);
    await assert.rejects(
      () => contacts.createContacts("u", new Array(501).fill({}) as never),
      /at most 500/,
    );
  });
});

describe("contacts cursor pagination", () => {
  it("adds the compound created_at/id cursor condition", async () => {
    responses = [{ rows: [] }];
    await contacts.listContactActivities("c-1", {
      createdAt: "2026-01-01T00:00:00.000000Z",
      id: "a-9",
    });
    assert.match(
      calls[0].sql,
      /\(a\.created_at < \$2 or \(a\.created_at = \$2 and a\.id < \$3\)\)/i,
    );
    assert.deepEqual(calls[0].params?.slice(0, 3), [
      "c-1",
      "2026-01-01T00:00:00.000000Z",
      "a-9",
    ]);
  });
});
