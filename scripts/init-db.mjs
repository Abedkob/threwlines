// init-db.mjs — one-time schema + seed bootstrap for a fresh database.
//
// Run from inside the application container after Postgres has been created.
// Idempotent: safe to re-run. In Dokploy, use the application's "Run command"
// panel: `node scripts/init-db.mjs`.
//
// Needs DATABASE_URL in the environment (already set by Dokploy for the app).

import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const files = [
  new URL("./local-schema.sql", import.meta.url),
  new URL("./local-seed.sql", import.meta.url),
];
for (const file of files) {
  const sql = readFileSync(file, "utf8");
  console.log(`[init-db] applying ${file.pathname} (${sql.length} bytes)`);
  await client.query(sql);
}
console.log("[init-db] done");
await client.end();
