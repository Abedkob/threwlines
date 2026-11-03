import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick, intParam } from "@/lib/api/helpers";
import { createContact, listContactsPage } from "@/lib/db/contacts";
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

export async function GET(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const params = request.nextUrl.searchParams;
    const filter = params.get("filter");
    const result = await listContactsPage({
      page: intParam(params, "page", 1),
      pageSize: intParam(params, "pageSize", 25),
      query: params.get("query") ?? undefined,
      filter: filter === "leads" || filter === "customers" ? filter : "all",
    });
    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const body = await readBody(request);
    const id = await createContact(session.userId, pick<ContactInput>(body, CONTACT_FIELDS));
    return jsonResponse({ id }, 201);
  } catch (error) {
    return handleError(error);
  }
}
