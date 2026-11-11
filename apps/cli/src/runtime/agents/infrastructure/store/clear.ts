import { and, eq, sql } from "drizzle-orm";
import type { LocalDatabase } from "../../../sqlite/index.js";
import {
  activity,
  journal,
  piContexts,
  requests,
  taskEffects,
  taskEvents,
  tasks,
} from "../../../sqlite/schema.js";
import type { HumanRequest } from "@raypx/core/tasks";
import type { CommandReceipts } from "./commands.js";
import { journalTaskId, requestTaskId, taskBinding } from "./queries.js";

/** Deletes cleared tasks with their records and forgets commands that only referenced them. */
export function clearTasks(
  stores: {
    database: LocalDatabase;
    commands: CommandReceipts;
    getRequest(binding: string, id: string): HumanRequest | undefined;
  },
  binding: string,
  ids: string[],
  pendingCommands: ReadonlySet<string>,
) {
  const { database } = stores;
  database.transaction(() => {
    const removed = new Set(ids);
    // Include orphaned receipts from earlier clears. Read this binding once, before
    // deleting requests needed to associate approval decisions with their task.
    for (const command of stores.commands.saved(binding)) {
      const { request } = command;
      if (request.method === "observed.decide") continue;
      const taskId =
        request.method === "approvals.decide"
          ? stores.getRequest(binding, request.input.id)?.taskId
          : request.method === "tasks.input"
            ? request.input.taskId
            : request.input.id;
      if (!taskId || !removed.has(taskId)) {
        if (pendingCommands.has(command.id)) continue;
        if (
          taskId &&
          database
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.id, taskId), eq(taskBinding, binding)))
            .get()
        )
          continue;
      }
      stores.commands.forget(command.id, command.payload);
    }
    for (const id of ids) {
      database
        .delete(tasks)
        .where(and(eq(tasks.id, id), eq(taskBinding, binding)))
        .run();
      database
        .delete(activity)
        .where(and(eq(activity.binding, binding), eq(activity.taskId, id)))
        .run();
      database
        .delete(requests)
        .where(and(eq(requests.binding, binding), eq(requestTaskId, id)))
        .run();
      database
        .delete(journal)
        .where(and(eq(journal.binding, binding), eq(journalTaskId, id)))
        .run();
      // Forgotten tasks keep no orchestration history or effect intents.
      database
        .delete(taskEvents)
        .where(and(eq(taskEvents.binding, binding), eq(taskEvents.taskId, id)))
        .run();
      database
        .delete(taskEffects)
        .where(and(eq(taskEffects.binding, binding), eq(taskEffects.taskId, id)))
        .run();
    }
    database.run(sql`DELETE FROM ${piContexts}
      WHERE ${piContexts.contextId} LIKE 'pi:v1:%'
      AND NOT EXISTS (SELECT 1 FROM ${tasks}
        WHERE json_extract(${tasks.value},'$.sessionId')=${piContexts.contextId})`);
  });
}
