// Reverse-proxy / orchestrator health check.
// Returns 200 only when the DB is reachable.
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db/query";

export async function GET() {
  try {
    await queryOne<{ one: number }>("select 1 as one");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "unhealthy" },
      { status: 503 },
    );
  }
}
