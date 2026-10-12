import type {
  RequestHeadersHandlerPluginContext,
  ResponseHeadersHandlerPluginContext,
} from "@orpc/server/plugins";
import type { EvlogOrpcContext } from "@voidmix/shared/logger/orpc";

import type { ApiRequestContext } from "./context.js";
import type { ApiModules } from "./modules.js";

export interface ApiContext
  extends
    ApiRequestContext,
    RequestHeadersHandlerPluginContext,
    ResponseHeadersHandlerPluginContext {
  log?: EvlogOrpcContext["log"];
}

export interface CreateApiRouterOptions {
  modules: ApiModules;
  now?: () => Date;
}
