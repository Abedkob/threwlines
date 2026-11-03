import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { query, queryCount, queryOne, rpc } from "./query.ts";
import type { Queryable } from "./query.ts";

type Call = { sql: string; params: unknown[] | undefined };

function mockPool(rows: Record<string, unknown>[], rowCount: number | null = rows.length) {
  const calls: Call[] = [];
  const pool: Queryable = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      return { rows, rowCount } as never;
    }
  };
  return { pool, calls };
}

describe("query helpers", () => {
  it("query returns rows and rowCount from the pool", async () => {
    const { pool, calls } = mockPool([{ id: 1 }, { id: 2 }]);
    const result = await query("select id from t where x = $1", ["a"], pool);
    assert.deepEqual(result.rows, [{ id: 1 }, { id: 2 }]);
    assert.equal(result.rowCount, 2);
    assert.deepEqual(calls, [{ sql: "select id from t where x = $1", params: ["a"] }]);
  });

  it("query reports rowCount 0 when the driver returns null", async () => {
    const { pool } = mockPool([], null);
    const result = await query("select 1", undefined, pool);
    assert.equal(result.rowCount, 0);
  });

  it("queryOne returns the first row", async () => {
    const { pool } = mockPool([{ id: "a" }, { id: "b" }]);
    assert.deepEqual(await queryOne("select id from t", [], pool), { id: "a" });
  });

  it("queryOne returns null when there are no rows", async () => {
    const { pool } = mockPool([]);
    assert.equal(await queryOne("select id from t", [], pool), null);
  });

  it("queryCount returns the count column as a number", async () => {
    const { pool } = mockPool([{ count: "42" }]);
    assert.equal(await queryCount("select count(*) from t", [], pool), 42);
  });

  it("queryCount returns 0 when there are no rows", async () => {
    const { pool } = mockPool([]);
    assert.equal(await queryCount("select count(*) from t", [], pool), 0);
  });

  it("rpc calls SELECT fn($1, $2) and returns the result column", async () => {
    const { pool, calls } = mockPool([{ result: { ok: true } }]);
    const result = await rpc("dashboard_summary", ["user-1", 5], pool);
    assert.deepEqual(result, { ok: true });
    assert.equal(calls[0].sql, "select dashboard_summary($1, $2) as result");
    assert.deepEqual(calls[0].params, ["user-1", 5]);
  });

  it("rpc with no args builds an empty call", async () => {
    const { pool, calls } = mockPool([{ result: 3 }]);
    assert.equal(await rpc("navigation_counts", [], pool), 3);
    assert.equal(calls[0].sql, "select navigation_counts() as result");
  });

  it("rpc rejects unsafe function names", async () => {
    const { pool } = mockPool([]);
    await assert.rejects(() => rpc("x; drop table t", [], pool), /Invalid function name/);
  });
});
