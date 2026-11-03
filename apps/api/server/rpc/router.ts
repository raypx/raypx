import { createAdministrationHandlers } from "./administration.js";
import { createRpcBoundary } from "./boundary.js";
import type { ApiAppOptions } from "../app/options.js";
import { createInstancesHandlers } from "./instances.js";
import { createMemoryHandlers } from "./memory.js";
import { createJobsHandlers } from "./jobs.js";
import { createHostsHandlers } from "./hosts.js";
import { createObservedHandlers } from "./observed.js";
import { createConfigurationHandlers } from "./configuration.js";
import { createDevicesHandlers } from "./devices.js";
import { createTasksHandlers } from "./tasks.js";
import { createApprovalsHandlers } from "./approvals.js";
import { createRelayHandlers } from "./relay.js";
import { createAccountHandlers } from "./account.js";
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
