import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

type Call = { sql: string; params: unknown[] | undefined };

const calls: Call[] = [];
let responses: Array<{ rows: unknown[]; rowCount?: number }> = [];

(globalThis as Record<string, unknown>).__vaultPgPool = {
  async query(sql: string, params?: unknown[]) {
    calls.push({ sql, params });
    const next = responses.shift() ?? { rows: [] };
    return { rows: next.rows, rowCount: next.rowCount ?? next.rows.length };
  },
};

const billing = await import("./billing.ts");
const licensing = await import("./licensing.ts");

beforeEach(() => {
  calls.length = 0;
  responses = [];
});

describe("billing rpc calls", () => {
  it("createInvoice passes actor first and serializes json", async () => {
    responses = [{ rows: [{ result: "inv-1" }] }];
    const id = await billing.createInvoice("user-1", { contact_id: "c1" }, [
      { description: "x", quantity: 1, unit_price: 5 } as any,
    ]);
    assert.equal(id, "inv-1");
    assert.match(calls[0].sql, /select create_invoice\(\$1, \$2, \$3\)/);
    assert.deepEqual(calls[0].params, [
      "user-1",
      JSON.stringify({ contact_id: "c1" }),
      JSON.stringify([{ description: "x", quantity: 1, unit_price: 5 }]),
    ]);
  });

  it("recordInvoicePayment nulls empty optional fields", async () => {
    await billing.recordInvoicePayment("u", {
      invoiceId: "i", amount: 10, method: "cash" as any, paidOn: "2026-01-01",
    });
    assert.deepEqual(calls[0].params, ["u", "i", 10, "cash", "2026-01-01", null, null]);
  });

  it("deleteTemplate refuses default templates", async () => {
    await assert.rejects(
      billing.deleteTemplate({ id: "t", is_default: true } as any),
      /another default/,
    );
  });
});

describe("billing listInvoicesPage", () => {
  it("filters by plain status", async () => {
    responses = [{ rows: [] }];
    await billing.listInvoicesPage({ status: "draft", page: 1, pageSize: 25 });
    assert.match(calls[0].sql, /ib\.status = \$1/);
    assert.deepEqual(calls[0].params, ["draft", 25, 0]);
  });

  it("builds overdue filter with today's date", async () => {
    responses = [{ rows: [] }];
    await billing.listInvoicesPage({ status: "overdue", page: 1, pageSize: 50 });
    assert.match(calls[0].sql, /ib\.due_date < \$1/);
    assert.equal(calls[0].params?.[0], new Date().toISOString().slice(0, 10));
    assert.deepEqual(calls[0].params?.slice(1), [50, 0]);
  });

  it("adds no where clause for all", async () => {
    responses = [{ rows: [] }];
    await billing.listInvoicesPage({ status: "all", page: 1, pageSize: 25 });
    assert.doesNotMatch(calls[0].sql, /where/);
  });

  it("coerces numerics and returns paging", async () => {
    responses = [{
      rows: [{
        id: "1", status: "draft", due_date: "2999-01-01", subtotal: "10.50", discount: "0",
        total_amount: "10.50", amount_paid: "0", balance_due: "10.50", total_count: "30",
      }],
    }];
    const result = await billing.listInvoicesPage({ page: 1, pageSize: 25 });
    assert.equal(result.rows[0].total_amount, 10.5);
    assert.equal(result.total, 30);
    assert.equal(result.totalPages, 2);
  });
});

describe("withEffectiveInvoiceStatus", () => {
  const base = { balance_due: 5, status: "sent", due_date: "2000-01-01" } as any;
  it("marks past-due sent invoices overdue", () => {
    assert.equal(billing.withEffectiveInvoiceStatus(base).status, "overdue");
  });
  it("leaves paid-off or draft invoices alone", () => {
    assert.equal(billing.withEffectiveInvoiceStatus({ ...base, balance_due: 0 }).status, "sent");
    assert.equal(billing.withEffectiveInvoiceStatus({ ...base, status: "draft" }).status, "draft");
  });
  it("numbers coerces listed keys", () => {
    assert.deepEqual(billing.numbers({ a: "1", b: "x" }, ["a"]), { a: 1, b: "x" });
  });
});

describe("licensing", () => {
  it("masks license keys", () => {
    assert.equal(
      licensing.maskedLicenseKey({ key_prefix: "ABC", key_last_four: "1234" }),
      "ABC-•••••-•••••-1234",
    );
  });

  it("issueLicense passes actor first", async () => {
    responses = [{ rows: [{ result: { id: "l" } }] }];
    await licensing.issueLicense("u", { product_id: "p" });
    assert.match(calls[0].sql, /issue_license\(\$1, \$2\)/);
    assert.equal(calls[0].params?.[0], "u");
  });
});
