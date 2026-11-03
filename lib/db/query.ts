import { pool } from "./pool.ts";

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export type QueryResult<T> = { rows: T[]; rowCount: number };

const FUNCTION_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i;

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  db: Queryable = pool
): Promise<QueryResult<T>> {
  const result = await db.query(sql, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  db: Queryable = pool
): Promise<T | null> {
  const { rows } = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

// Reads the first column named "count" (or the first column) as a number.
export async function queryCount(
  sql: string,
  params?: unknown[],
  db: Queryable = pool
): Promise<number> {
  const row = await queryOne<Record<string, unknown>>(sql, params, db);
  if (!row) return 0;
  const value = "count" in row ? row.count : Object.values(row)[0];
  return Number(value ?? 0);
}

// Calls a SQL function: select fn($1, $2, ...) as result.
export async function rpc<T = unknown>(
  fnName: string,
  args: unknown[] = [],
  db: Queryable = pool
): Promise<T> {
  if (!FUNCTION_NAME.test(fnName)) {
    throw new Error(`Invalid function name: ${fnName}`);
  }
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
  const row = await queryOne<{ result: T }>(
    `select ${fnName}(${placeholders}) as result`,
    args,
    db
  );
  return (row?.result ?? null) as T;
}
