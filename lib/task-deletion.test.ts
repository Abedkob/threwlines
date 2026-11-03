import assert from "node:assert/strict";
import test from "node:test";
import { deleteTask, deleteTaskItem } from "./db/tasks.ts";

type Call = { sql: string; params: unknown[] | undefined };

// deleteRow runs through the shared pool, so a fake pool on globalThis captures
// the SQL without a database. The pool module reads it lazily at call time.
function withFakePool(
  run: (calls: Call[]) => Promise<void>,
  failure?: string,
) {
  const holder = globalThis as Record<string, unknown>;
  const previous = holder.__vaultPgPool;
  const calls: Call[] = [];
  holder.__vaultPgPool = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (failure) throw new Error(failure);
      return { rows: [], rowCount: 1 };
    },
  };
  return run(calls).finally(() => {
    holder.__vaultPgPool = previous;
  });
}

test("task deletion targets only the selected task", async () => {
  await withFakePool(async (calls) => {
    await deleteTask("task-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sql, "delete from tasks where id = $1");
    assert.deepEqual(calls[0].params, ["task-1"]);
  });
});

test("checklist deletion targets only the selected item", async () => {
  await withFakePool(async (calls) => {
    await deleteTaskItem("item-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sql, "delete from task_items where id = $1");
    assert.deepEqual(calls[0].params, ["item-1"]);
  });
});

test("task deletion reports database failures", async () => {
  await withFakePool(async () => {
    await assert.rejects(deleteTask("task-2"), /Deletion denied/);
  }, "Deletion denied");
});
