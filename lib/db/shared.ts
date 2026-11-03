import type { PagedResult } from "@/types/db";
import { query, queryOne } from "./query.ts";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

export function pageBounds(page: number, pageSize: number) {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = [25, 50, 100].includes(pageSize) ? pageSize : 25;
  return {
    page: safePage,
    pageSize: safeSize,
    from: (safePage - 1) * safeSize,
    to: safePage * safeSize - 1,
  };
}

export function paged<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number,
): PagedResult<T> {
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function assertIdentifiers(names: string[]) {
  for (const name of names) {
    if (!IDENTIFIER.test(name)) throw new Error(`Invalid column name: ${name}`);
  }
}

// Inserts one row built from an object and returns the requested columns.
// Column names are validated; values are always parameters.
export async function insertRow<T>(
  table: string,
  values: Record<string, unknown>,
  returning = "*",
): Promise<T> {
  assertIdentifiers([table, ...Object.keys(values)]);
  const columns = Object.keys(values);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const row = await queryOne<T>(
    `insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")}) returning ${returning}`,
    columns.map((column) => values[column]),
  );
  if (!row) throw new Error("The record was created without a returned row.");
  return row;
}

// Updates a row by id from an object. undefined values are skipped.
export async function updateRow(
  table: string,
  id: string,
  values: Record<string, unknown>,
): Promise<number> {
  const columns = Object.keys(values).filter((key) => values[key] !== undefined);
  assertIdentifiers([table, ...columns]);
  if (!columns.length) return 0;
  const sets = columns.map((column, index) => `${column} = $${index + 1}`);
  const result = await query(
    `update ${table} set ${sets.join(", ")} where id = $${columns.length + 1}`,
    [...columns.map((column) => values[column]), id],
  );
  return result.rowCount;
}

export async function deleteRow(table: string, id: string): Promise<void> {
  assertIdentifiers([table]);
  await query(`delete from ${table} where id = $1`, [id]);
}
