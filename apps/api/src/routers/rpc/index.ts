import { createProtectedInputHandlers } from "./protected-input.js";
import { createDeviceComputersHandlers } from "./device-computers.js";
import { createPagesHandlers } from "./pages.js";
import { createSkillsHandlers } from "./skills.js";
import { createOpenApiServersHandlers } from "./openapi-servers.js";
import { createMcpServersHandlers } from "./mcp-servers.js";
import { Hono } from "hono";
import { RPCHandler } from "@orpc/server/fetch";
import { TimeoutHandlerPlugin } from "@orpc/server/plugins";
import { createRpcLoggingPlugin } from "../../logging.js";
import { procedureRequest, type ApiRouterEnv } from "../request.js";
import { createAdministrationHandlers } from "./admin.js";
import { createRpcSetup } from "./setup.js";
import type { ApiAppOptions } from "../../app/options.js";
import type { ReadReadiness } from "../../app/readiness.js";
import { createConfigHandlers } from "./config.js";
import { createApprovalsHandlers } from "./approvals.js";
import { createAccountHandlers } from "./account.js";
import { createSpaceHandlers } from "./spaces.js";
import { createModelConnectionsHandlers } from "./model-connections.js";
import { createRoutineHandlers } from "./routines.js";
import { createSpaceMemoryHandlers } from "./space-memory.js";

export const rpcPrefix = "/rpc";

export function createRpcRouter(options: ApiAppOptions, readReadiness: ReadReadiness) {
  const setup = createRpcSetup(options);
  return setup.implementer.router({
    deviceComputers: createDeviceComputersHandlers(setup),
    pages: createPagesHandlers(setup),
    skills: createSkillsHandlers(setup),
    mcpServers: createMcpServersHandlers(setup),
    openApiServers: createOpenApiServersHandlers(setup),
    routines: createRoutineHandlers(setup),
    spaceMemory: createSpaceMemoryHandlers(setup),
    ...createSpaceHandlers(setup),
    modelConnections: createModelConnectionsHandlers(setup),
    admin: createAdministrationHandlers(setup, readReadiness),
    configuration: createConfigHandlers(setup),
    approvals: createApprovalsHandlers(setup),
    protectedInputs: createProtectedInputHandlers(setup),
    account: createAccountHandlers(setup),
  });
}

export function createRpcRoutes(
  router: ReturnType<typeof createRpcRouter>,
  timeout: number,
  logger: ApiAppOptions["logger"],
) {
  const routes = new Hono<ApiRouterEnv>();
  routes.use("/protectedInputs/*", async (c, next) => {
    c.header("cache-control", "no-store");
    await next();
  });
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
