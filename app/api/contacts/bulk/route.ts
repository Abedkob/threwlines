import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick, errorResponse } from "@/lib/api/helpers";
import { createContacts } from "@/lib/db/contacts";
import type { ContactInput } from "@/types/db";

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

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const body = await readBody(request);
    if (!Array.isArray(body.contacts)) return errorResponse("contacts must be an array.", 400);
    const inputs = body.contacts.map((item: Record<string, any>) =>
      pick<ContactInput>(item ?? {}, CONTACT_FIELDS),
    );
    const ids = await createContacts(session.userId, inputs);
    return jsonResponse({ ids }, 201);
  } catch (error) {
    return handleError(error);
  }
}
