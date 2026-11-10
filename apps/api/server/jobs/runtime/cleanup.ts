import type { Task } from "nitro/types";
import { getBackendRuntime } from "../../runtime/backend.ts";

export default {
  meta: { name: "maintenance:cleanup", description: "Remove expired foundation records" },
  async run() {
    try {
      const runtime = await getBackendRuntime();
      if (runtime.role === "relay") return { result: { status: "disabled" } };
      return { result: await runtime.jobs.cleanup() };
    } catch {
      throw new Error("Cleanup task failed");
    }
  },
} satisfies Task;
