import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { deleteTemplate, saveTemplate } from "@/lib/db/billing";

type TemplateToDelete = Parameters<typeof deleteTemplate>[0];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await saveTemplate(session.userId, body, id);
    return jsonResponse({ id });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await deleteTemplate({ id, is_default: Boolean(body.is_default) } as TemplateToDelete);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
