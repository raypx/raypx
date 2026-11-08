import { sql } from "drizzle-orm";
import { activeTaskStatuses } from "@raypx/core/tasks";
import { journal, requests, tasks } from "../../../sqlite/schema.ts";

// JSON column projections shared by more than one agent record family.
export const taskBinding = sql<string>`json_extract(${tasks.value},'$.binding')`;
export const taskCreatedAt = sql<string>`json_extract(${tasks.value},'$.task.createdAt')`;
export const activeTaskFilter = sql`json_extract(${tasks.value},'$.task.status') IN (${sql.raw(activeTaskStatuses.map((status) => `'${status}'`).join(","))})`;
export const requestTaskId = sql<string>`json_extract(${requests.value},'$.taskId')`;
export const journalTaskId = sql<string>`json_extract(${journal.value},'$.taskId')`;
