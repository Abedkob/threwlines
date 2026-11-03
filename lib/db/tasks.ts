import type {
  PagedResult,
  Task,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from "@/types/db";
import { query, queryCount } from "./query.ts";
import {
  deleteRow,
  insertRow,
  pageBounds,
  paged,
  updateRow,
} from "./shared.ts";

const taskSelect = `
  select t.*,
    case when p.id is null then null
         else json_build_object('id', p.id, 'name', p.name, 'color', p.color) end as assignee,
    coalesce(
      (select json_agg(ti order by ti.sort_order, ti.created_at)
         from task_items ti where ti.task_id = t.id),
      '[]'::json
    ) as items
  from tasks t
  left join profiles p on p.id = t.assigned_to
`;

function normalizeTask(task: Task): Task {
  return {
    ...task,
    items: [...(task.items ?? [])].sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        String(a.created_at).localeCompare(String(b.created_at)),
    ),
  };
}

export async function listTasksPage(options: {
  page: number;
  pageSize: number;
  status?: TaskStatus | "all";
}): Promise<PagedResult<Task>> {
  const bounds = pageBounds(options.page, options.pageSize);
  const params: unknown[] = [];
  let where = "";
  if (options.status && options.status !== "all") {
    params.push(options.status);
    where = `where t.status = $${params.length}`;
  }
  // Count and select in parallel — the two queries don't depend on each other.
  const [total, { rows }] = await Promise.all([
    queryCount(`select count(*) from tasks t ${where}`, params),
    query<Task>(
      `${taskSelect} ${where}
       order by t.due_date asc nulls last, t.id asc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, bounds.pageSize, bounds.from],
    ),
  ]);
  return paged(rows.map(normalizeTask), total, bounds.page, bounds.pageSize);
}

export async function listMyOpenTasks(userId: string, limit = 5): Promise<Task[]> {
  const { rows } = await query<Task>(
    `${taskSelect}
     where t.status = 'open' and t.assigned_to = $1
     order by t.due_date asc nulls last, t.id asc
     limit $2`,
    [userId, limit],
  );
  return rows.map(normalizeTask);
}

export async function createTask(
  userId: string,
  input: {
    title: string;
    assigned_to: string | null;
    due_date: string | null;
    priority: TaskPriority;
  },
) {
  await insertRow("tasks", { ...input, created_by: userId, status: "open" }, "id");
}

export async function updateTask(
  id: string,
  input: Partial<{
    title: string;
    assigned_to: string | null;
    due_date: string | null;
    priority: TaskPriority;
    status: TaskStatus;
  }>,
) {
  await updateRow("tasks", id, input);
}

export async function deleteTask(id: string) {
  await deleteRow("tasks", id);
}

export async function addTaskItem(
  userId: string,
  taskId: string,
  content: string,
  parentId: string | null,
  sortOrder: number,
) {
  await insertRow(
    "task_items",
    {
      task_id: taskId,
      content,
      parent_id: parentId,
      sort_order: sortOrder,
      created_by: userId,
    },
    "id",
  );
}

export async function updateTaskItem(
  id: string,
  input: Partial<Pick<TaskItem, "content" | "done" | "sort_order">>,
) {
  await updateRow("task_items", id, input);
}

export async function deleteTaskItem(id: string) {
  await deleteRow("task_items", id);
}
