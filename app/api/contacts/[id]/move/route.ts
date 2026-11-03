import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { getContact, moveContact } from "@/lib/db/contacts";
import type { ContactStage } from "@/types/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    const contact = await getContact(id);
    await moveContact(session.userId, contact, body.stage as ContactStage);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
