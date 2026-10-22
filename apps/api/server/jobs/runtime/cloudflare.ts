import type { Task, TaskEvent } from "nitro/types";
import { createCloudflareRuntime, type CloudflareBindings } from "../../runtime/cloudflare.js";

export default {
  meta: { name: "maintenance:cleanup", description: "Remove expired foundation records" },
  async run({ context }: TaskEvent) {
    const { cloudflare } = context as { cloudflare?: { env?: CloudflareBindings } };
    if (!cloudflare?.env) throw new Error("Cloudflare task bindings are required");
    try {
      const runtime = await createCloudflareRuntime(cloudflare.env);
      try {
        return { result: await runtime.jobs.cleanup() };
      } finally {
        // A scheduled event owns its runtime exactly as an HTTP request does.
        await runtime.close();
      }
    } catch {
      throw new Error("Cleanup task failed");
    }
  },
} satisfies Task;
