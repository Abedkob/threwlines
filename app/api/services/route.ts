import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick } from "@/lib/api/helpers";
import { createService, listServices } from "@/lib/db/settings";

type ServiceBody = Parameters<typeof createService>[0];

const SERVICE_FIELDS = [
  "name",
  "description",
  "default_quantity",
  "default_price",
  "active",
] as const;

export async function GET(_request: NextRequest) {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listServices());
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const body = await readBody(request);
    await createService(pick<ServiceBody>(body, SERVICE_FIELDS));
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}
