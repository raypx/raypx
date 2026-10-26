import { createApiClient } from "@raypx/client";
import type { CloudJobsPort, JobDevicesPort } from "@raypx/jobs/client";
import { apiUrl } from "../auth/client";

let api: ReturnType<typeof createApiClient> | undefined;
const client = () => (api ??= createApiClient({ baseUrl: apiUrl }));
export const cloudJobs: CloudJobsPort = {
  list: (input = {}, options) => client().jobs.list(input, options),
  create: (input, options) => client().jobs.create(input, options),
  update: (input, options) => client().jobs.update(input, options),
  remove: (input, options) => client().jobs.remove(input, options),
  run: (input, options) => client().jobs.run(input, options),
  history: (input, options) =>
    client().jobs.history({ ...input, limit: input.limit ?? 50 }, options),
};
export const jobDevices: JobDevicesPort = {
  list: async (input = {}, options) =>
    (await client().devices.list(input, options)).filter((device) => !device.revoked),
};
