import { JobError, cloudJobSyncSchema, type CloudJobRun } from "@raypx/jobs";
import { taskStatusSchema } from "@raypx/contracts/tasks";
import type { JobDispatchResult } from "@raypx/jobs/server";
import type { RelayJobTransport } from "../relay/jobs.js";
import type { CloudflareBindings } from "./cloudflare.js";

/** The binding is private; public HTTP never forwards these paths to the room. */
export function createCloudflareJobTransport(bindings: CloudflareBindings): RelayJobTransport {
  async function invoke(
    method: "dispatch" | "sync",
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
  ): Promise<JobDispatchResult> {
    if (!bindings.RAYPX_RELAY) throw new JobError("CONTROL_UNAVAILABLE");
    if (signal.aborted) throw new JobError("DELIVERY_EXPIRED");
    let response: Response;
    try {
      response = await bindings.RAYPX_RELAY.getByName(userId).fetch(
        new Request(`https://relay/jobs/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, run }),
          signal,
        }),
      );
    } catch {
      throw new JobError("CONTROL_UNAVAILABLE", true);
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new JobError("CONTROL_UNAVAILABLE", true);
    }
    if (!response.ok) {
      const error = value && typeof value === "object" && "error" in value ? value.error : null;
      const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string" &&
        /^[A-Z_]{1,120}$/.test(error.code)
          ? error.code
          : "CONTROL_UNAVAILABLE";
      const uncertain =
        error &&
        typeof error === "object" &&
        "uncertain" in error &&
        typeof error.uncertain === "boolean"
          ? error.uncertain
          : true;
      throw new JobError(code, uncertain);
    }
    if (!value || typeof value !== "object" || !("type" in value))
      throw new JobError("CONTROL_UNAVAILABLE", true);
    if (method === "sync" && value.type === "synced") {
      const parsed = cloudJobSyncSchema.safeParse(value);
      if (parsed.success) return { type: "synced", ...parsed.data };
    }
    if (
      method === "dispatch" &&
      value.type === "task" &&
      "taskId" in value &&
      value.taskId === run.id &&
      "status" in value
    ) {
      const parsed = taskStatusSchema.safeParse(value.status);
      if (parsed.success) return { type: "task", taskId: run.id, status: parsed.data };
    }
    throw new JobError("CONTROL_UNAVAILABLE", true);
  }
  return {
    dispatch: async (userId, run, signal) =>
      (await invoke("dispatch", userId, run, signal)) as Extract<
        JobDispatchResult,
        { type: "task" }
      >,
    sync: async (userId, run, signal) =>
      (await invoke("sync", userId, run, signal)) as Extract<JobDispatchResult, { type: "synced" }>,
  };
}
