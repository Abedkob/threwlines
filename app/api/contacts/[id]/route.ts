import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick } from "@/lib/api/helpers";
import { getContact, updateContact } from "@/lib/db/contacts";
import type { ContactUpdate } from "@/types/db";

const CONTACT_FIELDS = [
  "name",
  "instagram",
  "whatsapp",
  "email",
  "location",
  "billing_name",
  "billing_contact",
  "billing_address",
  "met_at",
  "stage",
  "assigned_to",
  "notes",
] as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    return jsonResponse(await getContact(id));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await updateContact(id, pick<ContactUpdate>(body, CONTACT_FIELDS));
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
