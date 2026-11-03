import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { addTaskItem } from "@/lib/db/tasks";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await addTaskItem(
      session.userId,
      id,
      String(body.content ?? ""),
      body.parent_id ?? null,
      Number(body.sort_order ?? 0),
    );
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}
