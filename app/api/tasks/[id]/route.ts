import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick } from "@/lib/api/helpers";
import { deleteTask, updateTask } from "@/lib/db/tasks";

type TaskPatch = Parameters<typeof updateTask>[1];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await updateTask(
      id,
      pick<TaskPatch>(body, ["title", "assigned_to", "due_date", "priority", "status"]),
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    await deleteTask(id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
