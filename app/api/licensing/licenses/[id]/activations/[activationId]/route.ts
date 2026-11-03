import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { deactivateLicenseActivation } from "@/lib/db/licensing";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activationId: string }> },
) {
  try {
    const session = await requireSession(await cookies());
    const { activationId } = await params;
    let reason: string | undefined;
    try {
      const body = await readBody(request);
      reason = typeof body.reason === "string" && body.reason ? body.reason : undefined;
    } catch {
      // The body is optional; fall back to the default reason.
    }
    await deactivateLicenseActivation(session.userId, activationId, reason);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
