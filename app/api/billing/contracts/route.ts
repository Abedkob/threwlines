import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { listContracts, saveContract } from "@/lib/db/billing";

export async function GET() {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listContracts());
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const body = await readBody(request);
    const id = await saveContract(session.userId, body.contract ?? {}, body.items ?? []);
    return jsonResponse({ id });
  } catch (error) {
    return handleError(error);
  }
}
