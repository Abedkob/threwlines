import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick, intParam } from "@/lib/api/helpers";
import { createTask, listTasksPage } from "@/lib/db/tasks";
import type { TaskPriority, TaskStatus } from "@/types/db";

export async function GET(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const params = request.nextUrl.searchParams;
    const result = await listTasksPage({
      page: intParam(params, "page", 1),
      pageSize: intParam(params, "pageSize", 25),
      status: (params.get("status") as TaskStatus | "all" | null) ?? "all",
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
    const input = pick<{
      title: string;
      assigned_to?: string | null;
      due_date?: string | null;
      priority: TaskPriority;
    }>(body, ["title", "assigned_to", "due_date", "priority"]);
    await createTask(session.userId, {
      ...input,
      assigned_to: input.assigned_to ?? null,
      due_date: input.due_date ?? null,
    });
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}
