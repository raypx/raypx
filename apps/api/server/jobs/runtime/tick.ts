import type { Task } from "nitro/types";
import { getApiRuntime } from "../../runtime/server.js";

export default {
  meta: { name: "schedules:tick", description: "Reconcile and dispatch due device schedules" },
  async run() {
    try {
      return { result: await (await getApiRuntime()).jobs.tick() };
    } catch {
      throw new Error("Schedule task failed");
    }
  },
} satisfies Task;
