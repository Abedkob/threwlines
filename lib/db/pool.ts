import pg from "pg";

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
