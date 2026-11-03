import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { deleteTemplate, saveTemplate } from "@/lib/db/billing";
import { queryOne } from "@/lib/db/query";
import type { DocumentTemplate } from "@/types/db";

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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const template = await queryOne<DocumentTemplate>(
      "select * from document_templates where id = $1",
      [id],
    );
    if (!template) return jsonResponse({ error: "Template not found" }, 404);
    await deleteTemplate(template);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
