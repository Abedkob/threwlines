import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, intParam, cursorParam } from "@/lib/api/helpers";
import { addActivity, listContactActivities } from "@/lib/db/contacts";
import type { ActivityChannel } from "@/types/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const search = request.nextUrl.searchParams;
    const limit = Math.min(intParam(search, "limit", 20), 100);
    return jsonResponse(await listContactActivities(id, cursorParam(search), limit));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    const activity = await addActivity(
      session.userId,
      id,
      body.channel as ActivityChannel,
      String(body.note ?? ""),
    );
    return jsonResponse(activity, 201);
  } catch (error) {
    return handleError(error);
  }
}
