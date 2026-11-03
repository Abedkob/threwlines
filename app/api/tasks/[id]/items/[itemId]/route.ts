import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick } from "@/lib/api/helpers";
import { deleteTaskItem, updateTaskItem } from "@/lib/db/tasks";

type ItemPatch = Parameters<typeof updateTaskItem>[1];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    await requireSession(await cookies());
    const { itemId } = await params;
    const body = await readBody(request);
    await updateTaskItem(itemId, pick<ItemPatch>(body, ["content", "done", "sort_order"]));
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    await requireSession(await cookies());
    const { itemId } = await params;
    await deleteTaskItem(itemId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
