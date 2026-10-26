import { createApiClient } from "@raypx/client";
import type { MemoryClientPort, MemoryProjectsPort } from "@raypx/memory/client";
import { apiUrl } from "../auth/client";
let api: ReturnType<typeof createApiClient> | undefined;
const client = () => (api ??= createApiClient({ baseUrl: apiUrl }));
export const accountMemory: MemoryClientPort = {
  list: (input = {}, options) => client().memory.list(input, options),
  get: (input, options) => client().memory.get(input, options),
  create: (input, options) => client().memory.create(input, options),
  update: (input, options) => client().memory.update(input, options),
  archive: (input, options) => client().memory.archive(input, options),
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
