import pg from "pg";

// Return DATE columns (OID 1082) as the raw "YYYY-MM-DD" string instead of a
// JS Date. The old Supabase client did the same, and client code (date inputs,
// overdue comparisons, Intl.DateTimeFormat) assumes the string form.
pg.types.setTypeParser(1082, (value) => value);
// Return numeric columns (OID 1700) as JavaScript numbers. The default parser
// hands back strings, which breaks arithmetic ("10" + "20" = "1020") in the
// couple of places that forget to coerce. Precision loss above 2^53 is not a
// risk for the money and quantity columns in this schema.
pg.types.setTypeParser(1700, (value) => value === null ? null : Number(value));
// bigint (OID 20) likewise — only app_settings.next_invoice_number uses it.
pg.types.setTypeParser(20, (value) => value === null ? null : Number(value));

type PoolGlobal = typeof globalThis & { __vaultPgPool?: pg.Pool };

// Lazily create a single Pool per process. Stored on globalThis so Next.js
// hot reloads in development do not leak connections.
export function getPool(): pg.Pool {
  const holder = globalThis as PoolGlobal;
  if (!holder.__vaultPgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    holder.__vaultPgPool = new pg.Pool({ connectionString, max: 10 });
  }
  return holder.__vaultPgPool;
}

// Singleton accessor: the real Pool is only created on first property access.
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  }
});
