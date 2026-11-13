import { Hono } from "hono";
import { limitAttachmentBody } from "../../middleware/attachment-limit.js";
import { RPCHandler } from "@orpc/server/fetch";
import { TimeoutHandlerPlugin } from "@orpc/server/plugins";
import { createRpcLoggingPlugin } from "../../logging.js";
import { procedureRequest, type ApiRouterEnv } from "../request.js";
import { createAdministrationHandlers } from "./admin.js";
import { createRpcSetup } from "./setup.js";
import type { ApiAppOptions } from "../../app/options.js";
import type { ReadReadiness } from "../../app/readiness.js";
import { createInstancesHandlers } from "./instances.js";
import { createMemoryHandlers } from "./memory.js";
import { createJobsHandlers } from "./jobs.js";
import { createHostsHandlers } from "./hosts.js";
import { createObservedHandlers } from "./observed.js";
import { createConfigHandlers } from "./config.js";
import { createDevicesHandlers } from "./devices.js";
import { createTasksHandlers } from "./tasks.js";
import { createApprovalsHandlers } from "./approvals.js";
import { createRelayHandlers } from "./relay.js";
import { createAccountHandlers } from "./account.js";
import { createAttachmentHandlers } from "./attachments.js";

export const rpcPrefix = "/rpc";

export function createRpcRouter(options: ApiAppOptions, readReadiness: ReadReadiness) {
  const setup = createRpcSetup(options);
  return setup.implementer.router({
    admin: createAdministrationHandlers(setup, readReadiness),
    attachments: createAttachmentHandlers(setup),
    instances: createInstancesHandlers(setup),
    memory: createMemoryHandlers(setup),
    jobs: createJobsHandlers(setup),
    hosts: createHostsHandlers(setup),
    observed: createObservedHandlers(setup),
    configuration: createConfigHandlers(setup),
    devices: createDevicesHandlers(setup),
    tasks: createTasksHandlers(setup),
    approvals: createApprovalsHandlers(setup),
    relay: createRelayHandlers(setup),
    account: createAccountHandlers(setup),
  });
}

export function createRpcRoutes(
  router: ReturnType<typeof createRpcRouter>,
  timeout: number,
  logger: ApiAppOptions["logger"],
) {
  const routes = new Hono<ApiRouterEnv>();
  routes.use("/attachments/*", limitAttachmentBody);
  const rpc = new RPCHandler(router, {
    plugins: [
      new TimeoutHandlerPlugin({ timeout }),
      ...(logger ? [createRpcLoggingPlugin(logger)] : []),
    ],
  });
  return routes.all("/*", async (c) => {
    const { request, context } = procedureRequest(c);
    c.set("rpcLogged", Boolean(logger));
    const result = await rpc.handle(request, {
      prefix: rpcPrefix,
      context,
    });
    return result.matched ? result.response : c.notFound();
  });
}
