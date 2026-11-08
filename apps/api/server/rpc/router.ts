import { createAdministrationHandlers } from "./administration.ts";
import { createRpcBoundary } from "./boundary.ts";
import type { ApiAppOptions } from "../app/options.ts";
import { createInstancesHandlers } from "./instances.ts";
import { createMemoryHandlers } from "./memory.ts";
import { createJobsHandlers } from "./jobs.ts";
import { createHostsHandlers } from "./hosts.ts";
import { createObservedHandlers } from "./observed.ts";
import { createConfigurationHandlers } from "./configuration.ts";
import { createDevicesHandlers } from "./devices.ts";
import { createTasksHandlers } from "./tasks.ts";
import { createApprovalsHandlers } from "./approvals.ts";
import { createRelayHandlers } from "./relay.ts";
import { createAccountHandlers } from "./account.ts";
export function createRpcRouter(options: ApiAppOptions) {
  const boundary = createRpcBoundary(options);
  return boundary.os.router({
    admin: createAdministrationHandlers(boundary),
    instances: createInstancesHandlers(boundary),
    memory: createMemoryHandlers(boundary),
    jobs: createJobsHandlers(boundary),
    hosts: createHostsHandlers(boundary),
    observed: createObservedHandlers(boundary),
    configuration: createConfigurationHandlers(boundary),
    devices: createDevicesHandlers(boundary),
    tasks: createTasksHandlers(boundary),
    approvals: createApprovalsHandlers(boundary),
    relay: createRelayHandlers(boundary),
    account: createAccountHandlers(boundary),
  });
}
