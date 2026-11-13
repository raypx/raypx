import type { Task } from "nitro/types";
import { getBackendRuntime } from "../../runtime/backend.js";

export default {
  meta: { name: "schedules:tick", description: "Reconcile and dispatch due device schedules" },
  async run() {
    try {
      const runtime = await getBackendRuntime();
      if (runtime.role === "relay") return { result: { enabled: false } };
      return { result: await runtime.jobs.tick() };
    } catch {
      throw new Error("Schedule task failed");
    }
  },
} satisfies Task;
