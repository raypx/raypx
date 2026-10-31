import { createApiClient } from "@raypx/client";
import type {
  MemoryClientPort,
  MemoryProjectsPort,
  MemoryReadOptions,
  MemoryUsagePort,
} from "@raypx/memory/client";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { localRequest } from "../../lib/desktop";
import { apiUrl, desktopFetch } from "../auth/client";
let api: ReturnType<typeof createApiClient> | undefined;
const client = () => (api ??= createApiClient({ baseUrl: apiUrl, fetch: desktopFetch }));
export const accountMemory: MemoryClientPort = {
  list: (input = {}, options) => client().memory.list(input, options),
  get: (input, options) => client().memory.get(input, options),
  create: (input, options) => client().memory.create(input, options),
  update: (input, options) => client().memory.update(input, options),
  archive: (input, options) => client().memory.archive(input, options),
  delete: (input, options) => client().memory.delete(input, options),
  history: (input, options) =>
    client().memory.history({ ...input, limit: input.limit ?? 20 }, options),
  restore: (input, options) => client().memory.restore(input, options),
  resolve: (input, options) => client().memory.resolve(input, options),
};
export const memoryProjects: MemoryProjectsPort = {
  list: async (options) =>
    (await client().devices.list({}, options))
      .filter((device) => !device.revoked)
      .flatMap((device) =>
        device.projects.map((project) => ({
          deviceId: device.id,
          projectId: project.id,
          name: `${device.name} · ${project.name}`,
        })),
      ),
};
export const memoryUsage: MemoryUsagePort = {
  scheduledPlans: async ({ id }, options) =>
    (await client().jobs.list({}, options)).jobs
      .filter(
        (job) =>
          job.action.type === "agent.run" &&
          job.action.contextSelection?.sources.some(
            (source) => source.id.toLowerCase() === id.toLowerCase(),
          ),
      )
      .map((job) => ({ id: job.id, name: job.name, enabled: job.enabled })),
};
async function localRead<T>(read: () => Promise<T>, options?: MemoryReadOptions) {
  options?.signal?.throwIfAborted();
  const value = await read();
  options?.signal?.throwIfAborted();
  return value;
}
export const localMemory: MemoryClientPort = {
  delete: (input, options) => localRead(() => localRequest("memory.delete", input), options),
  list: (input = {}, options) => localRead(() => localRequest("memory.list", input), options),
  get: (input, options) => localRead(() => localRequest("memory.get", input), options),
  create: (input, options) => localRead(() => localRequest("memory.create", input), options),
  update: (input, options) => localRead(() => localRequest("memory.update", input), options),
  archive: (input, options) => localRead(() => localRequest("memory.archive", input), options),
  history: (input, options) => localRead(() => localRequest("memory.history", input), options),
  restore: (input, options) => localRead(() => localRequest("memory.restore", input), options),
  resolve: (input, options) => localRead(() => localRequest("memory.resolve", input), options),
};
export const localMemoryProjects: MemoryProjectsPort = {
  list: (options) =>
    localRead(async () => {
      const device = await localRequest("agents.local.device", {
        accountId: LOCAL_WORKSPACE_ID,
      });
      return device.projects.map((project) => ({
        deviceId: device.id,
        projectId: project.id,
        name: project.name,
      }));
    }, options),
};
