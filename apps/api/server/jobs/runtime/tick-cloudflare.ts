import type { Task, TaskEvent } from "nitro/types";
import { createCloudflareRuntime, type CloudflareBindings } from "../../runtime/cloudflare.js";

export default {
  meta: { name: "schedules:tick", description: "Reconcile and dispatch due device schedules" },
  async run({ context }: TaskEvent) {
    const { cloudflare } = context as { cloudflare?: { env?: CloudflareBindings } };
    if (!cloudflare?.env) throw new Error("Cloudflare task bindings are required");
    try {
      const runtime = await createCloudflareRuntime(cloudflare.env);
      try {
        return { result: await runtime.jobs.tick() };
      } finally {
        await runtime.close();
      }
    } catch {
      throw new Error("Schedule task failed");
    }
  },
} satisfies Task;
