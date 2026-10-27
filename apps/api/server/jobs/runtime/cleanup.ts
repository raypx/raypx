import type { Task } from "nitro/types";
import { getApiRuntime } from "../../runtime/server.js";

export default {
  meta: { name: "maintenance:cleanup", description: "Remove expired foundation records" },
  async run() {
    try {
      return { result: await (await getApiRuntime()).jobs.cleanup() };
    } catch {
      throw new Error("Cleanup task failed");
    }
  },
} satisfies Task;
