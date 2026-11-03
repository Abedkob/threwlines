import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick } from "@/lib/api/helpers";
import { deleteService, updateService } from "@/lib/db/settings";

type ServiceBody = Parameters<typeof updateService>[1];

const SERVICE_FIELDS = [
  "name",
  "description",
  "default_quantity",
  "default_price",
  "active",
] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    const input = pick<ServiceBody>(body, SERVICE_FIELDS);
    if (!input.name) return jsonResponse({ error: "name is required" }, 400);
    await updateService(id, input);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    await deleteService(id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
